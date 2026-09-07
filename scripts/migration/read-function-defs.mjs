/**
 * Reads the live definition of named functions out of the catalogue.
 *
 *   node scripts/migration/read-function-defs.mjs save_onboarding_identity ...
 *
 * `docs/rpc-identity-migration.md` defers several functions on one specific
 * ground: they were redefined by more than one migration, so the file that
 * created them is not evidence of what is running. Porting one from a migration
 * file would be porting a version that may have been superseded. The catalogue
 * is the only authority, and Phase 3 already proved the point the hard way,
 * when four of five migrations believed to be pending turned out to be applied.
 *
 * Writes each definition to scripts/migration/out/functions/<name>.sql, which
 * is gitignored along with the rest of out/. Definitions are schema, not
 * secrets, but they are also not something to paste into a terminal.
 *
 * READ-ONLY: one SELECT against pg_catalog. Connects through the same resolver
 * every other script here uses, so it reaches Supabase over IPv4 via Supavisor.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

import { loadEnv, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error("Usage: node scripts/migration/read-function-defs.mjs <name> [name...]");
  process.exit(2);
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), "out", "functions");
mkdirSync(outDir, { recursive: true });

const { url: connectionString, via } = await resolveSupabaseUrl(postgres);
console.log(`Reading the catalogue via ${via}.\n`);

const sql = postgres(connectionString, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  onnotice: () => {},
});

try {
  for (const name of names) {
    // Every overload, with its schema and volatility, so a name that resolves
    // to two functions is visible rather than silently reduced to one.
    const rows = await sql`
      select
        n.nspname as schema,
        p.proname as name,
        pg_get_function_identity_arguments(p.oid) as args,
        p.prosecdef as security_definer,
        pg_get_functiondef(p.oid) as definition
      from pg_proc as p
      join pg_namespace as n on n.oid = p.pronamespace
      where p.proname = ${name}
        and n.nspname in ('public', 'private')
      order by n.nspname, p.oid
    `;

    if (rows.length === 0) {
      console.log(`  ${name.padEnd(32)} NOT FOUND`);
      continue;
    }

    for (const [index, row] of rows.entries()) {
      const suffix = rows.length > 1 ? `.${index + 1}` : "";
      const file = join(outDir, `${row.schema}.${row.name}${suffix}.sql`);
      writeFileSync(file, `${row.definition}\n`);
      console.log(
        `  ${`${row.schema}.${row.name}(${row.args})`.padEnd(58)} ` +
          `${row.security_definer ? "SECURITY DEFINER" : "invoker"}  ` +
          `${row.definition.split(/\r?\n/).length} lines`
      );
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}

console.log(`\nWritten to ${outDir} (gitignored).`);
