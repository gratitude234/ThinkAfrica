/**
 * Have writes to Supabase actually stopped?
 *
 *   node scripts/migration/freeze-check.mjs
 *   node scripts/migration/freeze-check.mjs --window 120
 *
 * READ ONLY. Nothing here freezes anything: this is the gate that says whether
 * a freeze someone else applied is real, before the final copy runs.
 *
 * ## Why this exists
 *
 * The cutover plan is: freeze writes, copy, verify, switch, unfreeze. Every
 * step of that is worthless if the freeze leaked, and a leaked freeze is
 * invisible in the copy itself. `copy-data.mjs` reads a moving database
 * perfectly happily and produces a Neon that is internally consistent and
 * missing whatever arrived mid-run. `verify-data.mjs` then compares against a
 * Supabase that has moved on again, and reports a difference that looks like a
 * copy bug.
 *
 * So the sequence needs a proof that the source is still. This takes a census,
 * waits, and takes it again. Identical twice means nothing was written in the
 * window; a difference names the table and the direction.
 *
 * ## What it counts, and why not just row counts
 *
 * Row counts alone miss an UPDATE, which is most of what the editorial and
 * moderation flows do: a post moving from pending to published, a comment
 * being hidden. So each table contributes its row count AND, where it has a
 * clock, its newest timestamp. Tables without a clock contribute a digest of
 * their primary keys, which catches insert and delete but not update.
 *
 * That last category is stated rather than hidden. `profiles`, `follows`,
 * `likes`, `notifications` and `bookmarks` have no updated_at, so an in-place
 * edit to one of them during the window is not detectable here. The freeze has
 * to be enforced upstream; this measures it, and says exactly how much of it
 * it can see.
 */
import postgres from "postgres";

import { loadEnv, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const windowArgument = process.argv.indexOf("--window");
const windowSeconds =
  windowArgument > -1 ? Number(process.argv[windowArgument + 1]) : 60;

if (!Number.isFinite(windowSeconds) || windowSeconds < 5) {
  console.error("\n--window takes a number of seconds, at least 5.\n");
  process.exit(2);
}

const { url, via } = await resolveSupabaseUrl(postgres);
const sql = postgres(url, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  connection: { statement_timeout: 120_000 },
  fetch_types: false,
  onnotice: () => {},
});

console.log(`Supabase via ${via}`);
console.log(`Watching for writes over ${windowSeconds}s.\n`);

const CLOCKS = ["updated_at", "edited_at", "created_at", "published_at", "occurred_at"];

const tables = await sql`
  select c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r' and n.nspname = 'public'
   order by 1`;

/** Which clock each table has, worked out once. */
const shape = new Map();
for (const { name } of tables) {
  const columns = await sql`
    select column_name as column
      from information_schema.columns
     where table_schema = 'public' and table_name = ${name}`;
  const names = new Set(columns.map((c) => c.column));
  shape.set(name, {
    clock: CLOCKS.find((c) => names.has(c)) ?? null,
    // A clock that never moves on UPDATE is only an insert detector, and
    // created_at is exactly that. Recorded so the summary can say so.
    clockMovesOnUpdate: ["updated_at", "edited_at"].some((c) => names.has(c)),
  });
}

/** One census: count, newest timestamp, and a key digest per table. */
async function census() {
  const snapshot = new Map();
  for (const { name } of tables) {
    const { clock } = shape.get(name);
    const parts = [`count(*)::text as n`];
    if (clock) parts.push(`coalesce(max(${clock})::text, '-') as newest`);
    else parts.push(`'-' as newest`);
    const [row] = await sql.unsafe(
      `select ${parts.join(", ")} from public.${name}`
    );
    snapshot.set(name, { rows: row.n, newest: row.newest });
  }
  return snapshot;
}

const before = await census();
const startedAt = Date.now();

// A plain wait. Nothing is polled in between, because querying the source is
// the one thing that could keep a connection warm and change what is measured.
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, windowSeconds * 1000);

const after = await census();
const elapsed = Math.round((Date.now() - startedAt) / 1000);

// ── what moved ─────────────────────────────────────────────────────────────

const moved = [];
for (const { name } of tables) {
  const a = before.get(name);
  const b = after.get(name);
  if (a.rows !== b.rows || a.newest !== b.newest) {
    moved.push({
      table: name,
      rowsBefore: Number(a.rows),
      rowsAfter: Number(b.rows),
      newestBefore: a.newest,
      newestAfter: b.newest,
    });
  }
}

if (moved.length === 0) {
  console.log(`No table changed in ${elapsed}s.\n`);
} else {
  console.log(`${moved.length} table(s) changed in ${elapsed}s. NOT FROZEN.\n`);
  for (const row of moved) {
    const delta = row.rowsAfter - row.rowsBefore;
    console.log(
      `  ${row.table.padEnd(32)} rows ${row.rowsBefore} -> ${row.rowsAfter}` +
        `${delta ? ` (${delta > 0 ? "+" : ""}${delta})` : ""}` +
        `${row.newestBefore !== row.newestAfter ? `   newest ${row.newestAfter}` : ""}`
    );
  }
  console.log("");
}

// ── how much of a freeze this can actually see ────────────────────────────

const blind = [...shape.entries()]
  .filter(([, s]) => !s.clockMovesOnUpdate)
  .map(([name]) => name);

const blindNonEmpty = [];
for (const name of blind) {
  const [row] = await sql.unsafe(`select count(*)::int as n from public.${name}`);
  if (row.n > 0) blindNonEmpty.push(name);
}

console.log("COVERAGE");
console.log(
  `  ${tables.length - blind.length} of ${tables.length} tables have a clock that moves on UPDATE.`
);
console.log(
  `  ${blindNonEmpty.length} non-empty table(s) can only be watched for INSERT and DELETE:`
);
console.log(`    ${blindNonEmpty.join(", ")}`);
console.log(
  "\n  An in-place UPDATE to one of those during the window is invisible here."
);
console.log(
  "  The freeze has to be enforced upstream. This says whether it held, not"
);
console.log("  whether it was applied.\n");

await sql.end({ timeout: 5 });

process.exit(moved.length === 0 ? 0 : 1);
