/**
 * Is this host fit to run the final copy?
 *
 *   node scripts/migration/runner-readiness.mjs
 *   node scripts/migration/runner-readiness.mjs --rounds 3 --gap 10
 *
 * Nothing persists on either database. Supabase is only read. On Neon every
 * object this creates is a temporary table or a pg_temp function, which the
 * server drops when the session ends. Run it on the host that will execute the
 * copy, before the production write freeze is applied.
 *
 * ## What changed, and the evidence for it
 *
 * The first version held both databases to one bar: 150 trivial statements in
 * under 25 seconds. The GitHub runner then passed Neon at 20.3s and failed
 * Supabase at 35.8s, while holding every connection with no drops. That result
 * raised the right question: does the source actually need the destination's
 * latency profile? It does not, for two reasons that come from the scripts
 * rather than from wanting the gate to pass.
 *
 * **Every historical failure was on Neon.** The copy failed three times from a
 * laptop: once during the load, twice during the restore. All three were
 * writes to Neon. The Supabase dump completed in every one of those attempts,
 * which is why a load and a restore happened at all, and the 11.1 MB
 * `out/data.sql` they left behind is the proof. That laptop measured about
 * 290ms per Supabase round trip, worse than the runner's 239ms.
 *
 * **A failure costs different things on each side.** `copy-data.mjs` runs
 * `pg_dump` and exits on a non-zero status before it disables a single trigger,
 * so a dropped dump leaves Neon exactly as it was and the rerun is clean. The
 * restore is different. It issues one autocommitted `ALTER` per foreign key and
 * per table, and a drop part-way leaves triggers disabled and constraints
 * deferrable. The only safe recovery then is to reset Neon and start again.
 *
 * So each database is now gated on the operations it actually performs:
 *
 *   SUPABASE, the source
 *     connect
 *     a stable 150-statement sequence on one backend. This is the shape of the
 *       verification reads. Every statement must succeed and the backend must
 *       not change, but latency is reported rather than gated, for the reasons
 *       above.
 *     the real data dump, with the exact arguments the copy uses
 *       (`dataDumpArgs()`), which must complete. Output is discarded and never
 *       written to disk.
 *
 *   NEON, the destination
 *     connect
 *     the real restore shape: autocommitted `ALTER TABLE ... ALTER CONSTRAINT`
 *       and `... TRIGGER USER` statements, at the restore's real count, derived
 *       from the catalogue. Gated strictly.
 *     the real load shape: `psql --single-transaction` running a COPY of the
 *       same byte count as the dump. It must succeed.
 *
 * ## The Neon bar is unchanged, only applied to the real operation
 *
 * The original limit was calibrated per statement: 25 seconds for 150, about
 * 167ms each, which excludes the laptop's 460ms. That figure is kept exactly,
 * as `MAX_MS_PER_STATEMENT`, and multiplied by the restore's actual count
 * instead of an arbitrary 150. The absolute number rises because the real
 * restore has more statements. The bar each statement must clear does not move.
 *
 * Switching from `select` to real DDL does not make the test easier or harder
 * for a reason unrelated to the network. Neon was measured at about 2ms of
 * server time per autocommitted `ALTER`, against 244 to 313ms per round trip.
 * The restore's exposure is almost entirely network, which is exactly what
 * this gate is meant to measure.
 *
 * Temporary objects add one more benefit. A connection that drops and silently
 * reconnects loses its temporary tables, so the next `ALTER` fails loudly
 * instead of succeeding on a new session. A `select` sequence could not detect
 * that. Both sides also compare `pg_backend_pid()` before and after.
 *
 * ## The bar for passing
 *
 * Every round, every check, both databases. A copy that fails at 90% spends
 * the freeze window it was given, and the freeze is the expensive part:
 * production is read-only while it holds.
 */
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import postgres from "postgres";

import {
  assertDumperNewerThan,
  loadEnv,
  redact,
  requireUrl,
  resolveSupabaseUrl,
} from "./env.mjs";
import { pgDump, psql } from "./pg.mjs";
import { dataDumpArgs } from "./policy.mjs";

/**
 * The calibrated per-statement bar for the Neon restore: 25 seconds for 150
 * statements, set against a laptop that failed the copy at about 460ms each.
 * Unchanged. See the header.
 */
const MAX_MS_PER_STATEMENT = 25_000 / 150;

/** Hang guards, not latency gates. A stuck process must fail, not wait. */
const DUMP_TIMEOUT_MS = 10 * 60_000;
const LOAD_TIMEOUT_MS = 10 * 60_000;

/** Used for the load only if no dump in this run has produced a size yet. */
const FALLBACK_LOAD_BYTES = 11_106_068;

loadEnv();

function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

const ROUNDS = flag("rounds", 3);
const GAP_SECONDS = flag("gap", 10);

const OPTIONS = {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  fetch_types: false,
  onnotice: () => {},
  connection: { statement_timeout: 120_000 },
};

const supabaseResolved = await resolveSupabaseUrl(postgres);
const supabaseUrl = supabaseResolved.url;
const neonUrl = requireUrl("DATABASE_URL_DIRECT");

if (!new URL(neonUrl).hostname.endsWith(".neon.tech")) {
  console.error("REFUSED: DATABASE_URL_DIRECT does not point at Neon.");
  process.exit(2);
}

console.log(`Supabase via ${supabaseResolved.via}`);
console.log("Neon via DATABASE_URL_DIRECT");

/** Bounded, because a hung socket otherwise produces no output at all. */
function within(ms, promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms).unref()
    ),
  ]);
}

function describe(error) {
  const code = error instanceof Error && error.code ? `${error.code} ` : "";
  return `${code}${redact(error)}`.trim().slice(0, 90);
}

// ── What the restore will actually issue ───────────────────────────────────

/**
 * The restore's statement count, read from the source catalogue. The schema
 * applied to Neon is a transform of this one, so the count the restore faces
 * comes from here rather than from a number written down once.
 */
async function restoreShape() {
  const sql = postgres(supabaseUrl, OPTIONS);
  try {
    const [row] = await within(
      60_000,
      sql.unsafe(`
        select
          (select count(*)::int
             from pg_constraint con
             join pg_class rel on rel.oid = con.conrelid
             join pg_namespace nsp on nsp.oid = rel.relnamespace
            where con.contype = 'f' and nsp.nspname in ('public','private')) as foreign_keys,
          (select count(*)::int
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where c.relkind = 'r' and n.nspname in ('public','private')) as tables,
          current_setting('server_version_num') as version`)
    );
    return {
      foreignKeys: row.foreign_keys,
      tables: row.tables,
      serverMajor: Math.floor(Number(row.version) / 10000),
    };
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

let shape;
try {
  shape = await restoreShape();
  assertDumperNewerThan(shape.serverMajor);
} catch (error) {
  console.error(`\nNOT READY: could not read the source catalogue. ${describe(error)}\n`);
  process.exit(1);
}

const RESTORE_STATEMENTS = shape.foreignKeys + shape.tables;
const RESTORE_LIMIT_MS = Math.round(RESTORE_STATEMENTS * MAX_MS_PER_STATEMENT);

console.log(
  `\nRestore shape: ${shape.foreignKeys} foreign keys + ${shape.tables} tables ` +
    `= ${RESTORE_STATEMENTS} autocommitted statements.`
);
console.log(
  `Neon restore limit: ${RESTORE_LIMIT_MS}ms ` +
    `(${MAX_MS_PER_STATEMENT.toFixed(1)}ms per statement, unchanged).`
);
console.log(
  `${ROUNDS} round(s), ${GAP_SECONDS}s apart.\n`
);

// ── Supabase: the source ───────────────────────────────────────────────────

async function probeSupabase() {
  const record = { target: "supabase", ok: false };
  const sql = postgres(supabaseUrl, OPTIONS);

  try {
    let started = Date.now();
    await within(30_000, sql.unsafe("select 1"));
    record.connect = Date.now() - started;

    // Verification's shape: many small reads on one backend. The backend id
    // is compared at both ends, so a silent reconnect cannot pass as stable.
    const [{ pid: before }] = await within(30_000, sql`select pg_backend_pid() as pid`);
    started = Date.now();
    await within(
      300_000,
      (async () => {
        for (let i = 0; i < 150; i += 1) {
          await sql.unsafe("select $1::int as n", [i]);
        }
      })()
    );
    record.sequence = Date.now() - started;
    const [{ pid: after }] = await within(30_000, sql`select pg_backend_pid() as pid`);
    if (before !== after) {
      throw new Error(`backend changed mid-sequence (${before} -> ${after})`);
    }
  } catch (error) {
    record.error = describe(error);
    await sql.end({ timeout: 5 }).catch(() => {});
    return record;
  }
  // Closed before the dump: spawnSync blocks the event loop, and an idle
  // client socket should not be left open while nothing can service it.
  await sql.end({ timeout: 5 }).catch(() => {});

  // The real dump, with the copy's own arguments. Output stays in memory, is
  // counted, and is dropped. It is production data and goes nowhere.
  try {
    const started = Date.now();
    const dump = pgDump(supabaseUrl, dataDumpArgs(), { timeout: DUMP_TIMEOUT_MS });
    record.dump = Date.now() - started;
    if (dump.status !== 0) {
      throw new Error(
        `pg_dump exited ${dump.status}: ${redact({ message: dump.stderr.trim().split(/\r?\n/).pop() ?? "" })}`
      );
    }
    record.dumpBytes = Buffer.byteLength(dump.stdout, "utf8");
    record.copyBlocks = (dump.stdout.match(/^COPY /gm) ?? []).length;
    if (record.copyBlocks === 0) {
      throw new Error("pg_dump succeeded but emitted no COPY blocks");
    }
    record.ok = true;
  } catch (error) {
    record.error = describe(error);
  }

  return record;
}

// ── Neon: the destination ──────────────────────────────────────────────────

async function probeNeon(loadBytes) {
  const record = { target: "neon", ok: false };
  const sql = postgres(neonUrl, OPTIONS);

  try {
    let started = Date.now();
    await within(30_000, sql.unsafe("select 1"));
    record.connect = Date.now() - started;

    // Session-scoped stand-ins for the restore's targets: a foreign key whose
    // deferrability can be toggled, and a user trigger that can be switched.
    // Untimed setup. pg_temp objects are dropped when the session ends.
    await within(
      60_000,
      sql.unsafe(`
        create temp table readiness_parent (id int primary key);
        create temp table readiness_child (
          id int primary key,
          parent_id int references readiness_parent (id)
        );
        create function pg_temp.readiness_noop() returns trigger
          language plpgsql as $f$ begin return new; end $f$;
        create trigger readiness_trigger before insert on readiness_child
          for each row execute function pg_temp.readiness_noop();`)
    );

    const [{ pid: before }] = await within(30_000, sql`select pg_backend_pid() as pid`);
    started = Date.now();
    await within(
      Math.max(RESTORE_LIMIT_MS * 3, 120_000),
      (async () => {
        // One autocommitted statement per foreign key, then one per table,
        // alternating so every statement changes the catalogue and commits.
        for (let i = 0; i < shape.foreignKeys; i += 1) {
          await sql.unsafe(
            `alter table readiness_child alter constraint readiness_child_parent_id_fkey ` +
              (i % 2 === 0 ? "deferrable initially deferred" : "not deferrable")
          );
        }
        for (let i = 0; i < shape.tables; i += 1) {
          await sql.unsafe(
            `alter table readiness_child ${i % 2 === 0 ? "disable" : "enable"} trigger user`
          );
        }
      })()
    );
    record.restore = Date.now() - started;
    const [{ pid: after }] = await within(30_000, sql`select pg_backend_pid() as pid`);
    if (before !== after) {
      throw new Error(`backend changed mid-restore (${before} -> ${after})`);
    }
  } catch (error) {
    record.error = describe(error);
    await sql.end({ timeout: 5 }).catch(() => {});
    return record;
  }
  await sql.end({ timeout: 5 }).catch(() => {});

  // The load's shape: psql, one transaction, COPY of the dump's byte count.
  // Synthetic rows, never production data. The table drops at commit.
  const lineBytes = 100;
  const lines = Math.ceil(loadBytes / lineBytes);
  const file = join(tmpdir(), `readiness-load-${process.pid}-${Date.now()}.sql`);
  try {
    writeFileSync(
      file,
      "set statement_timeout = '600s';\n" +
        "create temp table readiness_load (line text) on commit drop;\n" +
        "copy readiness_load from stdin;\n" +
        `${"x".repeat(lineBytes - 1)}\n`.repeat(lines) +
        "\\.\n" +
        "select count(*) from readiness_load;\n",
      "utf8"
    );

    const started = Date.now();
    const load = psql(neonUrl, ["-q", "-At", "--single-transaction", "-f", file], {
      timeout: LOAD_TIMEOUT_MS,
    });
    record.load = Date.now() - started;
    record.loadBytes = lines * lineBytes;

    if (load.status !== 0) {
      throw new Error(
        `psql exited ${load.status}: ${redact({ message: load.stderr.trim().split(/\r?\n/).pop() ?? "" })}`
      );
    }
    const counted = Number(load.stdout.trim().split(/\r?\n/).pop());
    if (counted !== lines) {
      throw new Error(`loaded ${counted} rows, expected ${lines}`);
    }
    record.ok = true;
  } catch (error) {
    record.error = describe(error);
  } finally {
    try {
      unlinkSync(file);
    } catch {
      // Already gone, or never written. Either way nothing to clean.
    }
  }

  return record;
}

// ── Rounds ─────────────────────────────────────────────────────────────────

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

const ms = (value) => `${String(value).padStart(6)}ms`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const results = [];
let lastDumpBytes = null;

for (let round = 1; round <= ROUNDS; round += 1) {
  const source = await probeSupabase();
  source.round = round;
  results.push(source);
  if (source.dumpBytes) lastDumpBytes = source.dumpBytes;

  console.log(
    source.ok
      ? `  round ${round}  supabase  connect ${ms(source.connect)}  ` +
          `150 reads ${ms(source.sequence)} ` +
          `(${Math.round(source.sequence / 150)}ms each, reported)  ` +
          `dump ${ms(source.dump)}  ${mb(source.dumpBytes)}, ${source.copyBlocks} COPY blocks`
      : `  round ${round}  supabase  FAILED  ${source.error}`
  );

  const destination = await probeNeon(lastDumpBytes ?? FALLBACK_LOAD_BYTES);
  destination.round = round;
  destination.tooSlow =
    destination.restore !== undefined && destination.restore > RESTORE_LIMIT_MS;
  results.push(destination);

  console.log(
    destination.ok || destination.restore !== undefined
      ? `  round ${round}  neon      connect ${ms(destination.connect)}  ` +
          `${RESTORE_STATEMENTS} DDL ${ms(destination.restore)} ` +
          `(${Math.round(destination.restore / RESTORE_STATEMENTS)}ms each` +
          `${destination.tooSlow ? `, OVER ${RESTORE_LIMIT_MS}ms` : ""})  ` +
          (destination.ok
            ? `load ${ms(destination.load)}  ${mb(destination.loadBytes)}`
            : `FAILED  ${destination.error}`)
      : `  round ${round}  neon      FAILED  ${destination.error}`
  );

  if (round < ROUNDS) await sleep(GAP_SECONDS);
}

// ── Verdict ────────────────────────────────────────────────────────────────

console.log("\nSUMMARY");

let ready = true;

const sourceRuns = results.filter((entry) => entry.target === "supabase");
const sourceFailures = sourceRuns.filter((entry) => !entry.ok);
if (sourceFailures.length === 0) {
  const worstRead = Math.max(...sourceRuns.map((entry) => entry.sequence));
  const worstDump = Math.max(...sourceRuns.map((entry) => entry.dump));
  console.log(
    `  supabase  ${sourceRuns.length}/${sourceRuns.length} rounds stable   ` +
      `worst dump ${worstDump}ms   worst 150 reads ${worstRead}ms ` +
      `(${Math.round(worstRead / 150)}ms each, not gated)`
  );
} else {
  ready = false;
  console.log(
    `  supabase  ${sourceRuns.length - sourceFailures.length}/${sourceRuns.length} rounds   NOT STABLE`
  );
  for (const entry of sourceFailures) {
    console.log(`            round ${entry.round}: ${entry.error}`);
  }
}

const destinationRuns = results.filter((entry) => entry.target === "neon");
const destinationFailures = destinationRuns.filter(
  (entry) => !entry.ok || entry.tooSlow
);
if (destinationFailures.length === 0) {
  const worstRestore = Math.max(...destinationRuns.map((entry) => entry.restore));
  const worstLoad = Math.max(...destinationRuns.map((entry) => entry.load));
  console.log(
    `  neon      ${destinationRuns.length}/${destinationRuns.length} rounds stable   ` +
      `worst restore ${worstRestore}ms of ${RESTORE_LIMIT_MS}ms   worst load ${worstLoad}ms`
  );
} else {
  ready = false;
  console.log(
    `  neon      ${destinationRuns.length - destinationFailures.length}/${destinationRuns.length} rounds   NOT READY`
  );
  for (const entry of destinationFailures) {
    console.log(
      `            round ${entry.round}: ` +
        (entry.error ??
          `restore ${entry.restore}ms over the ${RESTORE_LIMIT_MS}ms limit, ` +
            `${Math.round(entry.restore / RESTORE_STATEMENTS)}ms per statement`)
    );
  }
}

console.log(
  ready
    ? "\nREADY. The source completed the real dump on a stable connection every\n" +
        "round, and the destination held the real restore and load shapes within\n" +
        "the calibrated bar. This host can run the copy.\n"
    : "\nNOT READY. Do not apply the production write freeze for this host:\n" +
        "the freeze makes the site read-only, and a copy that fails part-way\n" +
        "spends that window for nothing.\n"
);

process.exit(ready ? 0 : 1);
