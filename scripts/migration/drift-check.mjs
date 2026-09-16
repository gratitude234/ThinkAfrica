/**
 * How far Neon has drifted from Supabase, table by table.
 *
 *   node scripts/migration/drift-check.mjs
 *   node scripts/migration/drift-check.mjs --json
 *
 * READ ONLY on both databases. Nothing is written, and no user data is
 * printed: identifiers, counts and timestamps only.
 *
 * ## Why this is not verify-data.mjs
 *
 * `verify-data.mjs` answers "is the copy identical", with a whole-row digest
 * per table. That is the right question immediately after a load and the wrong
 * one now: the two databases are *known* to differ, because production writes
 * have continued to Supabase for weeks, and a digest mismatch tells you only
 * that they do. What a cutover decision needs is the shape of the difference.
 *
 * So this reports, per table:
 *
 *   - row counts on both sides
 *   - primary keys present on Supabase and absent from Neon (rows that arrived
 *     after the snapshot, or were never copied)
 *   - primary keys present on Neon and absent from Supabase (rows hard-deleted
 *     upstream since the snapshot, which a re-copy would never surface)
 *   - the newest timestamp on each side, which dates the snapshot per table
 *     rather than globally
 *   - soft-delete and status counts, because a row can be present on both
 *     sides and mean different things
 *   - orphaned foreign keys on Neon
 *
 * ## The table list is derived, not written down
 *
 * The tables are extracted from the SQL in the migrated repositories. A
 * hand-maintained list would be wrong the first time a repository gained a
 * join, and wrong silently, which is the failure mode this whole migration
 * keeps finding. `--all` widens it to every public table instead.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import postgres from "postgres";

import { loadEnv, requireUrl, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const asJson = process.argv.includes("--json");
const everyTable = process.argv.includes("--all");

// ── which tables ───────────────────────────────────────────────────────────

/** Every `public.<name>` the migrated repositories mention. */
function tablesFromRepositories() {
  const found = new Set();
  for (const file of readdirSync("lib/db")) {
    if (!file.endsWith(".ts") || file.includes(".test.")) continue;
    const source = readFileSync(join("lib/db", file), "utf8");
    for (const match of source.matchAll(/\bpublic\.([a-z_][a-z0-9_]*)/g)) {
      found.add(match[1]);
    }
  }
  return found;
}

const options = {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  connection: { statement_timeout: 120_000 },
  fetch_types: false,
  onnotice: () => {},
};

const { url: supabaseUrl, via } = await resolveSupabaseUrl(postgres);
const supabase = postgres(supabaseUrl, options);
const neon = postgres(requireUrl("DATABASE_URL"), options);

console.log(`Supabase via ${via}`);
console.log("Neon via DATABASE_URL\n");

/** Real tables that exist on BOTH sides, so a missing table is reported once
 *  rather than as a drift finding on every column. */
async function realTables(sql) {
  const rows = await sql`
    select c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname = 'public'`;
  return new Set(rows.map((row) => row.name));
}

const [onSupabase, onNeon] = await Promise.all([
  realTables(supabase),
  realTables(neon),
]);

const wanted = everyTable ? onSupabase : tablesFromRepositories();
const tables = [...wanted].filter((t) => onSupabase.has(t)).sort();
const missingOnNeon = tables.filter((t) => !onNeon.has(t));
const present = tables.filter((t) => onNeon.has(t));

// ── per-table shape ────────────────────────────────────────────────────────

/** The primary key columns, so composite keys are diffed correctly. */
async function primaryKey(sql, table) {
  const rows = await sql`
    select a.attname as column
      from pg_index i
      join pg_attribute a
        on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
     where i.indrelid = ${`public.${table}`}::regclass and i.indisprimary
     order by a.attnum`;
  return rows.map((row) => row.column);
}

async function columnsOf(sql, table) {
  const rows = await sql`
    select column_name as name, data_type as type
      from information_schema.columns
     where table_schema = 'public' and table_name = ${table}`;
  return rows;
}

/** Columns that mark a row as gone without removing it. */
const SOFT_DELETE = [
  "deleted_at",
  "hidden_at",
  "removed_at",
  "suspended_at",
  "dismissed_at",
  "revoked_at",
  "archived_at",
];

/** Columns that date a row. Preferred in this order. */
const RECENCY = ["updated_at", "edited_at", "created_at", "published_at", "occurred_at"];

const report = [];

for (const table of present) {
  const entry = { table };

  try {
    const [pk, columns] = await Promise.all([
      primaryKey(supabase, table),
      columnsOf(supabase, table),
    ]);
    const names = new Set(columns.map((c) => c.name));

    const [[supabaseCount], [neonCount]] = await Promise.all([
      supabase.unsafe(`select count(*)::bigint as n from public.${table}`),
      neon.unsafe(`select count(*)::bigint as n from public.${table}`),
    ]);
    entry.supabaseRows = Number(supabaseCount.n);
    entry.neonRows = Number(neonCount.n);

    // Key sets, diffed in JS. Both sides are read as text so a uuid and a
    // bigint compare the same way and neither driver's type mapping matters.
    if (pk.length > 0) {
      const keyExpr = pk.map((c) => `coalesce(${c}::text,'')`).join(` || '|' || `);
      const [supabaseKeys, neonKeys] = await Promise.all([
        supabase.unsafe(`select ${keyExpr} as k from public.${table}`),
        neon.unsafe(`select ${keyExpr} as k from public.${table}`),
      ]);
      const left = new Set(supabaseKeys.map((r) => r.k));
      const right = new Set(neonKeys.map((r) => r.k));

      const absentFromNeon = [...left].filter((k) => !right.has(k));
      const absentFromSupabase = [...right].filter((k) => !left.has(k));

      entry.primaryKey = pk.join(", ");
      entry.missingFromNeon = absentFromNeon.length;
      entry.missingFromSupabase = absentFromSupabase.length;
      // A short sample, for investigating. Keys only, never row contents.
      entry.sampleMissingFromNeon = absentFromNeon.slice(0, 3);
      entry.sampleMissingFromSupabase = absentFromSupabase.slice(0, 3);
    } else {
      entry.primaryKey = null;
    }

    // Newest row on each side, which dates the snapshot for this table.
    const recency = RECENCY.find((c) => names.has(c));
    if (recency) {
      const [[newestSupabase], [newestNeon]] = await Promise.all([
        supabase.unsafe(`select max(${recency})::text as t from public.${table}`),
        neon.unsafe(`select max(${recency})::text as t from public.${table}`),
      ]);
      entry.recencyColumn = recency;
      entry.newestSupabase = newestSupabase.t;
      entry.newestNeon = newestNeon.t;
    }

    // Soft deletes: a row present on both sides can still mean two things.
    for (const column of SOFT_DELETE) {
      if (!names.has(column)) continue;
      const [[a], [b]] = await Promise.all([
        supabase.unsafe(
          `select count(*)::bigint as n from public.${table} where ${column} is not null`
        ),
        neon.unsafe(
          `select count(*)::bigint as n from public.${table} where ${column} is not null`
        ),
      ]);
      entry.softDeleted ??= {};
      entry.softDeleted[column] = { supabase: Number(a.n), neon: Number(b.n) };
    }

    // Status distribution, where the table has one.
    if (names.has("status")) {
      const [a, b] = await Promise.all([
        supabase.unsafe(
          `select status::text as s, count(*)::bigint as n from public.${table} group by 1`
        ),
        neon.unsafe(
          `select status::text as s, count(*)::bigint as n from public.${table} group by 1`
        ),
      ]);
      const merge = (rows) =>
        Object.fromEntries(rows.map((r) => [r.s ?? "null", Number(r.n)]));
      entry.status = { supabase: merge(a), neon: merge(b) };
    }
  } catch (error) {
    entry.error = error instanceof Error ? error.message : String(error);
  }

  report.push(entry);
}

// ── orphaned foreign keys, on Neon ─────────────────────────────────────────

/**
 * Every FK on the tables in scope, counted for violations directly rather than
 * revalidated. `VALIDATE CONSTRAINT` takes a lock and stops at the first bad
 * row; this says how many there are, which is what a drift report needs.
 */
const orphans = [];
const constraints = await neon`
  select
    con.conname as name,
    child.relname as child_table,
    parent.relname as parent_table,
    pg_get_constraintdef(con.oid) as definition
  from pg_constraint con
  join pg_class child on child.oid = con.conrelid
  join pg_class parent on parent.oid = con.confrelid
  join pg_namespace n on n.oid = child.relnamespace
  where con.contype = 'f' and n.nspname = 'public'
  order by 2, 1`;

for (const constraint of constraints) {
  if (!present.includes(constraint.child_table)) continue;
  const match = /FOREIGN KEY \(([^)]+)\) REFERENCES [^(]+\(([^)]+)\)/.exec(
    constraint.definition
  );
  if (!match) continue;

  const childColumns = match[1].split(",").map((c) => c.trim());
  const parentColumns = match[2].split(",").map((c) => c.trim());
  const on = childColumns
    .map((c, i) => `p.${parentColumns[i]} = c.${c}`)
    .join(" and ");
  const notNull = childColumns.map((c) => `c.${c} is not null`).join(" and ");

  try {
    const [row] = await neon.unsafe(
      `select count(*)::bigint as n
         from public.${constraint.child_table} c
        where ${notNull}
          and not exists (
            select 1 from public.${constraint.parent_table} p where ${on}
          )`
    );
    if (Number(row.n) > 0) {
      orphans.push({
        constraint: constraint.name,
        child: constraint.child_table,
        parent: constraint.parent_table,
        orphaned: Number(row.n),
      });
    }
  } catch (error) {
    orphans.push({
      constraint: constraint.name,
      child: constraint.child_table,
      parent: constraint.parent_table,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

await Promise.all([supabase.end({ timeout: 5 }), neon.end({ timeout: 5 })]);

// ── output ─────────────────────────────────────────────────────────────────

if (asJson) {
  console.log(
    JSON.stringify({ missingOnNeon, tables: report, orphans }, null, 2)
  );
} else {
  if (missingOnNeon.length) {
    console.log("TABLES ABSENT FROM NEON ENTIRELY");
    for (const table of missingOnNeon) console.log(`  ${table}`);
    console.log("");
  }

  const width = Math.max(...report.map((r) => r.table.length), 5);
  console.log(
    `${"table".padEnd(width)}  ${"supabase".padStart(9)}  ${"neon".padStart(9)}  ` +
      `${"absent".padStart(7)}  ${"extra".padStart(6)}   newest on neon`
  );
  console.log("-".repeat(width + 60));

  for (const row of report) {
    if (row.error) {
      console.log(`${row.table.padEnd(width)}  ERROR  ${row.error.slice(0, 60)}`);
      continue;
    }
    const drifted =
      row.supabaseRows !== row.neonRows ||
      (row.missingFromNeon ?? 0) > 0 ||
      (row.missingFromSupabase ?? 0) > 0;
    console.log(
      `${row.table.padEnd(width)}  ${String(row.supabaseRows).padStart(9)}  ` +
        `${String(row.neonRows).padStart(9)}  ` +
        `${String(row.missingFromNeon ?? "-").padStart(7)}  ` +
        `${String(row.missingFromSupabase ?? "-").padStart(6)}   ` +
        `${row.newestNeon ? row.newestNeon.slice(0, 19) : "-"}` +
        `${drifted ? "  DRIFTED" : ""}`
    );
  }

  console.log("\nabsent = on Supabase, not on Neon.  extra = on Neon, not on Supabase.");
  console.log("`extra` is the dangerous column: those rows were hard-deleted");
  console.log("upstream, and no incremental copy keyed on updated_at finds them.\n");

  const statusDrift = report.filter(
    (r) => r.status && JSON.stringify(r.status.supabase) !== JSON.stringify(r.status.neon)
  );
  if (statusDrift.length) {
    console.log("STATUS DISTRIBUTION DIFFERS");
    for (const row of statusDrift) {
      console.log(`  ${row.table}`);
      const keys = new Set([
        ...Object.keys(row.status.supabase),
        ...Object.keys(row.status.neon),
      ]);
      for (const key of [...keys].sort()) {
        const a = row.status.supabase[key] ?? 0;
        const b = row.status.neon[key] ?? 0;
        if (a !== b) console.log(`    ${key.padEnd(20)} supabase ${a}   neon ${b}`);
      }
    }
    console.log("");
  }

  const softDrift = report.filter(
    (r) =>
      r.softDeleted &&
      Object.values(r.softDeleted).some((v) => v.supabase !== v.neon)
  );
  if (softDrift.length) {
    console.log("SOFT-DELETE COUNTS DIFFER");
    for (const row of softDrift) {
      for (const [column, value] of Object.entries(row.softDeleted)) {
        if (value.supabase !== value.neon) {
          console.log(
            `  ${row.table}.${column}  supabase ${value.supabase}   neon ${value.neon}`
          );
        }
      }
    }
    console.log("");
  }

  console.log(
    orphans.length
      ? `ORPHANED FOREIGN KEYS ON NEON: ${orphans.length}`
      : "No orphaned foreign keys on Neon."
  );
  for (const row of orphans) {
    console.log(
      `  ${row.child} -> ${row.parent} (${row.constraint}): ` +
        `${row.error ?? `${row.orphaned} orphaned row(s)`}`
    );
  }

  const drifted = report.filter(
    (r) =>
      !r.error &&
      (r.supabaseRows !== r.neonRows ||
        (r.missingFromNeon ?? 0) > 0 ||
        (r.missingFromSupabase ?? 0) > 0)
  );
  console.log(
    `\n${drifted.length} of ${report.length} table(s) have drifted.\n`
  );
}
