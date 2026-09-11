/**
 * Is this machine fit to run the final copy?
 *
 *   node scripts/migration/runner-readiness.mjs
 *   node scripts/migration/runner-readiness.mjs --rounds 10 --gap 30
 *
 * READ ONLY on both databases. Run it on whatever host will execute the copy,
 * before the production write freeze is applied.
 *
 * ## Why a ping is not the question
 *
 * The final copy failed three times from a laptop, and never at connect time.
 * It failed part-way through sustained work: once during a 10.6 MB load, twice
 * during the 126 sequential `ALTER TABLE` statements that restore deferrable
 * constraints. Between those failures a single `select 1` answered in under
 * three seconds. A connectivity check built from pings would have declared the
 * machine healthy every time.
 *
 * So this exercises the three shapes the copy actually performs, against both
 * databases, repeatedly over a window:
 *
 *   1. **Connect and query.** The cheap check, included because its absence is
 *      still disqualifying.
 *   2. **A sustained statement sequence.** 150 statements over one connection,
 *      which is the shape that dropped with ECONNRESET twice.
 *   3. **A bulk read.** Several MB in one result, which is the shape of the
 *      dump and the load.
 *
 * Repetition matters as much as the shapes. Neon was unreachable for roughly
 * twenty minutes and then answered in 2.8 seconds; one sample taken inside
 * either period describes the network at that moment and not the half hour the
 * copy needs.
 *
 * ## The bar
 *
 * Every round must pass against both databases. Not most of them. A copy that
 * fails at 90% through wastes the freeze window it was given, and the freeze is
 * the expensive part: production is read-only while it holds.
 *
 * There is also a latency bar, and it exists because success alone was not
 * discriminating. The laptop that failed the copy three times passed all four
 * rounds of an earlier version of this check, while taking 43 seconds against
 * Supabase and 68 against Neon to run 150 trivial statements. That is 290ms
 * and 460ms per round trip, against single-digit milliseconds on a healthy
 * link, and it is the direct explanation for the failures: the restore step's
 * 126 statements sit exposed for a full minute, so any transient drop lands
 * inside the operation rather than between operations.
 *
 * `MAX_SEQUENCE_MS` is therefore calibrated against a host known to fail, not
 * chosen for elegance. It is generous, at roughly 165ms per statement, and
 * still excludes both observed figures.
 */

/** 150 statements. Slower than this is a link that fails mid-copy. */
const MAX_SEQUENCE_MS = 25_000;
import postgres from "postgres";

import { loadEnv, requireUrl, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

const ROUNDS = flag("rounds", 6);
const GAP_SECONDS = flag("gap", 20);

const OPTIONS = {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  fetch_types: false,
  onnotice: () => {},
  connection: { statement_timeout: 120_000 },
};

const supabaseResolved = await resolveSupabaseUrl(postgres);

const TARGETS = [
  { name: "supabase", url: supabaseResolved.url },
  { name: "neon", url: requireUrl("DATABASE_URL_DIRECT") },
];

console.log(`Supabase via ${supabaseResolved.via}`);
console.log(`Neon via DATABASE_URL_DIRECT`);
console.log(
  `\n${ROUNDS} round(s), ${GAP_SECONDS}s apart. Roughly ` +
    `${Math.round((ROUNDS * GAP_SECONDS) / 60)} minute(s).\n`
);

const results = [];

/** Bounded, because a hung socket otherwise produces no output at all. */
function within(ms, promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms).unref()
    ),
  ]);
}

async function probe(target) {
  const sql = postgres(target.url, OPTIONS);
  const record = { target: target.name };

  try {
    let started = Date.now();
    await within(30_000, sql.unsafe("select 1"));
    record.connect = Date.now() - started;

    // The shape that dropped twice: many small statements, one connection.
    started = Date.now();
    await within(120_000, (async () => {
      for (let i = 0; i < 150; i += 1) {
        await sql.unsafe("select $1::int as n", [i]);
      }
    })());
    record.sequence = Date.now() - started;

    // The shape of the dump and the load: volume in one result.
    started = Date.now();
    const [row] = await within(120_000, sql.unsafe(
      `select length(string_agg(repeat('x', 1000), '')) as bytes
         from generate_series(1, 4000)`
    ));
    record.bulk = Date.now() - started;
    record.bulkBytes = Number(row.bytes);

    record.ok = true;
  } catch (error) {
    record.ok = false;
    record.error = error instanceof Error
      ? `${error.code ?? ""} ${error.message}`.trim().slice(0, 70)
      : String(error);
  }

  await sql.end({ timeout: 5 }).catch(() => {});
  return record;
}

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

for (let round = 1; round <= ROUNDS; round += 1) {
  for (const target of TARGETS) {
    const record = await probe(target);
    record.round = round;
    results.push(record);
    console.log(
      record.ok
        ? `  round ${String(round).padStart(2)}  ${record.target.padEnd(9)} ` +
            `connect ${String(record.connect).padStart(5)}ms   ` +
            `150 statements ${String(record.sequence).padStart(6)}ms   ` +
            `bulk ${String(record.bulk).padStart(6)}ms`
        : `  round ${String(round).padStart(2)}  ${record.target.padEnd(9)} FAILED  ${record.error}`
    );
  }
  if (round < ROUNDS) await sleep(GAP_SECONDS);
}

console.log("\nSUMMARY");

let ready = true;
for (const target of TARGETS) {
  const mine = results.filter((entry) => entry.target === target.name);
  const passed = mine.filter((entry) => entry.ok);
  const rate = `${passed.length}/${mine.length}`;

  if (passed.length === mine.length) {
    const worstSequence = Math.max(...passed.map((entry) => entry.sequence));
    const worstBulk = Math.max(...passed.map((entry) => entry.bulk));
    const tooSlow = worstSequence > MAX_SEQUENCE_MS;
    if (tooSlow) ready = false;
    console.log(
      `  ${target.name.padEnd(9)} ${rate} rounds   ` +
        `worst sequence ${worstSequence}ms   worst bulk ${worstBulk}ms` +
        (tooSlow
          ? `   TOO SLOW (limit ${MAX_SEQUENCE_MS}ms, ` +
            `${Math.round(worstSequence / 150)}ms per round trip)`
          : "")
    );
  } else {
    ready = false;
    console.log(`  ${target.name.padEnd(9)} ${rate} rounds   NOT STABLE`);
    for (const entry of mine.filter((e) => !e.ok)) {
      console.log(`             round ${entry.round}: ${entry.error}`);
    }
  }
}

console.log(
  ready
    ? "\nREADY. Both databases held for every round, including the sustained\n" +
        "shapes the copy performs. This host can run the copy.\n"
    : "\nNOT READY. Do not apply the production write freeze from this host:\n" +
        "the freeze makes the site read-only, and a copy that fails part-way\n" +
        "spends that window for nothing.\n"
);

process.exit(ready ? 0 : 1);
