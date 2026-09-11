/**
 * Can Supabase feed Neon incrementally, and by what mechanism?
 *
 *   node scripts/migration/sync-feasibility.mjs
 *
 * READ ONLY. This answers a design question with the databases' own settings
 * rather than with assumptions, because the three candidate mechanisms have
 * very different prerequisites and only one of them is decided by opinion.
 *
 *   1. PostgreSQL logical replication (Supabase publishes, Neon subscribes)
 *   2. Timestamp-keyed incremental copy (needs a reliable per-row clock)
 *   3. Write freeze plus a final full re-copy
 */
import postgres from "postgres";

import { loadEnv, requireUrl, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const options = {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  fetch_types: false,
  onnotice: () => {},
};

const { url: supabaseUrl, via } = await resolveSupabaseUrl(postgres);
const supabase = postgres(supabaseUrl, options);
const neon = postgres(requireUrl("DATABASE_URL"), options);

console.log(`Supabase via ${via}`);
console.log("Neon via DATABASE_URL\n");

const line = (label, value) => console.log(`  ${label.padEnd(34)} ${value}`);

// ── 1. logical replication ────────────────────────────────────────────────

console.log("1. LOGICAL REPLICATION");

for (const [label, sql] of [
  ["Supabase", supabase],
  ["Neon", neon],
]) {
  try {
    const [settings] = await sql`
      select
        current_setting('wal_level', true) as wal_level,
        current_setting('max_replication_slots', true) as slots,
        current_setting('max_wal_senders', true) as senders`;
    const [role] = await sql`
      select
        current_user as who,
        (select rolreplication from pg_roles where rolname = current_user) as can_replicate,
        (select rolsuper from pg_roles where rolname = current_user) as is_super`;

    line(`${label} wal_level`, settings.wal_level);
    line(`${label} max_replication_slots`, settings.slots);
    line(`${label} role`, `${role.who} (replication=${role.can_replicate}, superuser=${role.is_super})`);

    const publications = await sql`select pubname from pg_publication`;
    line(
      `${label} publications`,
      publications.length ? publications.map((p) => p.pubname).join(", ") : "(none)"
    );

    const slotRows = await sql`
      select slot_name, active from pg_replication_slots`;
    line(
      `${label} replication slots`,
      slotRows.length
        ? slotRows.map((s) => `${s.slot_name}${s.active ? " (active)" : ""}`).join(", ")
        : "(none)"
    );
  } catch (error) {
    line(`${label}`, `could not inspect: ${error instanceof Error ? error.message : error}`);
  }
}

// Can this role actually create a subscription on Neon? Asked by trying, in a
// transaction that is rolled back, because the answer depends on the platform
// rather than on the documented role attributes.
console.log("\n  Can Neon subscribe?");
try {
  await neon.begin(async (tx) => {
    await tx.unsafe(
      `create subscription __feasibility_probe
         connection 'host=localhost port=5432 dbname=nonexistent'
         publication __none
         with (connect = false, slot_name = NONE, create_slot = false, enabled = false)`
    );
    throw new Error("rollback");
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  line(
    "CREATE SUBSCRIPTION",
    message === "rollback"
      ? "PERMITTED (probe rolled back, nothing created)"
      : `REFUSED: ${message.split("\n")[0].slice(0, 90)}`
  );
}

// ── 2. is there a per-row clock to key an incremental copy on? ────────────

console.log("\n2. TIMESTAMP-KEYED INCREMENTAL COPY");
console.log("   Which tables carry a column that moves when a row is UPDATED?\n");

const tables = await supabase`
  select c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r' and n.nspname = 'public'
   order by 1`;

const withClock = [];
const withoutClock = [];

for (const { name } of tables) {
  const columns = await supabase`
    select column_name as column
      from information_schema.columns
     where table_schema = 'public' and table_name = ${name}`;
  const names = new Set(columns.map((c) => c.column));

  // created_at does not count. It never moves on UPDATE, so keying on it
  // copies new rows and silently misses every edit to an existing one.
  const clock = ["updated_at", "edited_at", "modified_at"].find((c) => names.has(c));
  const [count] = await supabase.unsafe(
    `select count(*)::bigint as n from public.${name}`
  );

  (clock ? withClock : withoutClock).push({
    name,
    clock: clock ?? null,
    rows: Number(count.n),
  });
}

console.log(`   HAVE an update clock: ${withClock.length} table(s)`);
for (const row of withClock) {
  console.log(`     ${row.name.padEnd(34)} ${row.clock}  (${row.rows} rows)`);
}

const populated = withoutClock.filter((row) => row.rows > 0);
console.log(`\n   NO update clock: ${withoutClock.length} table(s), ${populated.length} of them non-empty`);
for (const row of populated) {
  console.log(`     ${row.name.padEnd(34)} ${row.rows} rows`);
}

// ── 3. can updates even be detected on the clocked tables? ────────────────

console.log("\n   Is the clock maintained, or merely present?");
for (const row of withClock) {
  if (row.rows === 0) continue;
  try {
    const [check] = await supabase.unsafe(
      `select count(*)::bigint as moved
         from public.${row.name}
        where ${row.clock} is not null
          and created_at is not null
          and ${row.clock} > created_at + interval '1 second'`
    );
    const moved = Number(check.moved);
    console.log(
      `     ${row.name.padEnd(34)} ${moved} row(s) show ${row.clock} > created_at` +
        `${moved === 0 ? "   <- never moves; treat as no clock" : ""}`
    );
  } catch {
    console.log(`     ${row.name.padEnd(34)} (no created_at to compare against)`);
  }
}

await Promise.all([supabase.end({ timeout: 5 }), neon.end({ timeout: 5 })]);
console.log("");
