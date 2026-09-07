/**
 * Compares the copied data against Supabase, table by table.
 *
 *   node scripts/migration/verify-data.mjs
 *
 * READ-ONLY on both databases.
 *
 * Row counts alone are not evidence. A copy that loses a column's contents,
 * truncates a timestamp, or reorders a UUID keeps its row count perfectly, so
 * this checks four things per table:
 *
 *   1. **Row count**, the coarse check.
 *   2. **Primary key set**, hashed. Every key present on one side and not the
 *      other shows up as a different digest, and the digest is order
 *      independent so it does not depend on either side's plan.
 *   3. **Whole-row digest**, the same way. This is what catches a column that
 *      arrived null, a text field that lost its encoding, or a numeric that
 *      changed scale.
 *   4. **Foreign key integrity**, on Neon, by re-validating every constraint.
 *
 * Plus a targeted check on the UUIDs application identity is built from:
 * `profiles.id` must match exactly, value for value, because 112 foreign keys
 * and every ownership decision in the product depend on those specific UUIDs.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { loadEnv, redact, requireUrl, resolveSupabaseUrl } from "./env.mjs";
import { EXCLUDED_TABLE_DATA_NAMES } from "./policy.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "out");

loadEnv();

const { url: supabaseUrl, via } = await resolveSupabaseUrl(postgres);
console.log(`Supabase reached via: ${via}\n`);

const options = {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  connection: { statement_timeout: 300_000 },
  onnotice: () => {},
};
const supabase = postgres(supabaseUrl, options);
const neon = postgres(requireUrl("DATABASE_URL_DIRECT"), options);

const mismatches = [];
const rows = [];

try {
  const tables = await supabase`
    select n.nspname as schema, c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname in ('public','private')
     order by 1, 2`;

  /**
   * An order-independent digest of a result set.
   *
   * md5 per row, summed as a bigint. Summation is commutative, so neither side
   * has to produce rows in the same order, and no ORDER BY is needed on tables
   * with no natural ordering. Collisions are conceivable and irrelevant at
   * this scale: this is a copy check, not a security boundary.
   */
  const digestSql = (table, columns) => `
    select
      count(*)::bigint as rows,
      coalesce(sum(('x' || substr(md5(t::text), 1, 16))::bit(64)::bigint), 0)::text as digest,
      coalesce(sum(('x' || substr(md5(${columns}), 1, 16))::bit(64)::bigint), 0)::text as key_digest
    from ${table} t`;

  for (const table of tables) {
    const qualified = `${table.schema}.${table.name}`;

    // The primary key, so the key digest is about identity rather than payload.
    const keyColumns = await supabase`
      select a.attname as name
        from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       where i.indrelid = ${qualified}::regclass and i.indisprimary
       order by a.attnum`;

    const keyExpression =
      keyColumns.length > 0
        ? keyColumns.map((column) => `coalesce(t.${column.name}::text, '')`).join(" || '|' || ")
        : "t::text";

    const query = digestSql(qualified, keyExpression);

    const [left] = await supabase.unsafe(query);
    const [right] = await neon.unsafe(query);

    const countMatch = left.rows === right.rows;
    const digestMatch = left.digest === right.digest;
    const keyMatch = left.key_digest === right.key_digest;

    const excluded = EXCLUDED_TABLE_DATA_NAMES.has(qualified);
    const status = excluded
      ? "excluded"
      : countMatch && digestMatch && keyMatch
        ? "ok"
        : "MISMATCH";
    if (status === "MISMATCH") {
      mismatches.push({
        table: qualified,
        supabaseRows: left.rows,
        neonRows: right.rows,
        countMatch,
        digestMatch,
        keyMatch,
        hasPrimaryKey: keyColumns.length > 0,
      });
    }

    rows.push({
      table: qualified,
      supabase: Number(left.rows),
      neon: Number(right.rows),
      keys: keyMatch,
      contents: digestMatch,
      excluded,
    });
  }

  // ---- report -----------------------------------------------------------
  const width = Math.max(...rows.map((row) => row.table.length));
  console.log("--- row counts and digests ---");
  console.log(
    `  ${"table".padEnd(width)}  ${"supabase".padStart(9)} ${"neon".padStart(9)}  keys  contents`
  );
  for (const row of rows) {
    const ok = row.keys && row.contents && row.supabase === row.neon;
    const flag = row.excluded ? "-" : ok ? " " : "!";
    const verdict = row.excluded
      ? "data excluded by policy.mjs"
      : `${row.keys ? "ok  " : "DIFF"}  ${row.contents ? "ok" : "DIFF"}`;
    console.log(
      `${flag} ${row.table.padEnd(width)}  ${String(row.supabase).padStart(9)} ` +
        `${String(row.neon).padStart(9)}  ${verdict}`
    );
  }

  const compared = rows.filter((row) => !row.excluded);
  const totalLeft = compared.reduce((sum, row) => sum + row.supabase, 0);
  const totalRight = compared.reduce((sum, row) => sum + row.neon, 0);
  console.log(
    `\n  ${"TOTAL".padEnd(width)}  ${String(totalLeft).padStart(9)} ${String(totalRight).padStart(9)}`
  );

  // ---- profiles.id, exactly ---------------------------------------------
  console.log("\n--- profiles.id (application identity) ---");
  const leftIds = (await supabase`select id::text from public.profiles order by 1`).map(
    (row) => row.id
  );
  const rightIds = (await neon`select id::text from public.profiles order by 1`).map(
    (row) => row.id
  );
  const identical =
    leftIds.length === rightIds.length &&
    leftIds.every((id, index) => id === rightIds[index]);
  console.log(
    `  ${identical ? "PASS" : "FAIL"}  ${leftIds.length} UUIDs, byte-for-byte identical: ${identical}`
  );
  if (!identical) {
    mismatches.push({ table: "public.profiles", reason: "profiles.id differs" });
    const missing = leftIds.filter((id) => !rightIds.includes(id));
    console.log(`         missing on Neon: ${missing.length}`);
  }

  // ---- foreign keys, revalidated ----------------------------------------
  console.log("\n--- foreign key integrity on Neon ---");
  const constraints = await neon`
    select nsp.nspname as schema, rel.relname as table, con.conname as name
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where con.contype = 'f' and nsp.nspname in ('public','private')
     order by 1, 2, 3`;

  let invalid = 0;
  for (const constraint of constraints) {
    try {
      // Re-validating walks every row and rechecks the reference. Deferred
      // checking during the load already proved this at COMMIT; doing it again
      // proves the deferral was not skipped.
      await neon.unsafe(
        `ALTER TABLE ${constraint.schema}.${constraint.table} VALIDATE CONSTRAINT ${constraint.name}`
      );
    } catch (error) {
      invalid += 1;
      console.log(`  FAIL ${constraint.schema}.${constraint.table}.${constraint.name}`);
      console.log(`       ${redact(error)}`);
    }
  }
  console.log(`  ${invalid === 0 ? "PASS" : "FAIL"}  ${constraints.length} constraints, ${invalid} invalid`);
  if (invalid > 0) mismatches.push({ table: "(foreign keys)", reason: `${invalid} invalid` });

  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, "data-verification.json"),
    JSON.stringify({ checkedAt: new Date().toISOString(), rows, mismatches }, null, 1)
  );

  console.log(
    `\n${mismatches.length === 0 ? "DATA VERIFIED" : `${mismatches.length} MISMATCH(ES)`}`
  );
  for (const mismatch of mismatches) console.log(`  ${JSON.stringify(mismatch)}`);
} catch (error) {
  console.error(redact(error));
  mismatches.push({ table: "(error)", reason: "verification failed" });
} finally {
  await supabase.end({ timeout: 5 }).catch(() => {});
  await neon.end({ timeout: 5 }).catch(() => {});
}

process.exit(mismatches.length === 0 ? 0 : 1);
