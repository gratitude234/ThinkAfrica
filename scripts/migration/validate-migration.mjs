/**
 * Runs unapplied migrations against the Neon scratch database inside a
 * transaction, checks what they created, and rolls back.
 *
 *   node scripts/migration/validate-migration.mjs supabase/migrations/a.sql b.sql
 *
 * There is no local migration runner in this project, so a SQL file that has
 * never been executed is a file nobody has proved parses. The identity RPC
 * migrations are the sharp case: they are deliberately not applied to
 * production, they are ported from catalogue definitions, and a typo in one
 * would be discovered by the person applying it to production at the worst
 * possible moment.
 *
 * The scratch database already holds the real schema, so a function body that
 * names a column that does not exist fails here too, not just a syntax error.
 *
 * Rolls back unconditionally, including on success: this validates, it does
 * not deploy. Nothing is left behind, so the parity and preview harnesses see
 * the same database afterwards as before.
 *
 * Top-level BEGIN; and COMMIT; lines are stripped so the whole run is one
 * transaction this script controls. Only lines that are exactly that at column
 * zero are touched, so the BEGIN inside a plpgsql body is left alone.
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

import { loadEnv, requireUrl } from "./env.mjs";

loadEnv();

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: node scripts/migration/validate-migration.mjs <file.sql> [...]");
  process.exit(2);
}

const neonUrl = requireUrl("DATABASE_URL");
if (!new URL(neonUrl).hostname.endsWith(".neon.tech")) {
  console.error("REFUSED: DATABASE_URL does not point at Neon.");
  process.exit(2);
}

function withoutTransactionControl(sql) {
  return sql
    .split(/\r?\n/)
    .filter((line) => !/^(BEGIN|COMMIT|ROLLBACK)\s*;\s*$/.test(line))
    .join("\n");
}

const sql = postgres(neonUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  onnotice: () => {},
});

let failed = false;

try {
  await sql.begin(async (tx) => {
    for (const file of files) {
      const text = withoutTransactionControl(readFileSync(file, "utf8"));
      try {
        await tx.unsafe(text);
        console.log(`  PASS  ${file}`);
      } catch (error) {
        failed = true;
        console.log(`  FAIL  ${file}`);
        console.log(`        ${error.message}`);
        if (error.position) console.log(`        at character ${error.position}`);
        if (error.where) console.log(`        ${error.where}`);
        // Keep going: one broken file should not hide the state of the next.
        throw error;
      }
    }

    // What the run actually created, so a file that parsed but created
    // something with the wrong signature is visible.
    const created = await tx.unsafe(`
      select
        p.proname as name,
        pg_get_function_identity_arguments(p.oid) as args,
        p.prosecdef as security_definer
      from pg_proc as p
      join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
          'assert_identity_claim',
          'save_onboarding_identity',
          'complete_onboarding',
          'withdraw_post_submission'
        )
      order by p.proname, pg_get_function_identity_arguments(p.oid)
    `);

    console.log("\n  Signatures present after the run:\n");
    for (const row of created) {
      console.log(
        `    ${row.security_definer ? "definer" : "invoker"}  ` +
          `${row.name}(${row.args || ""})`
      );
    }

    // Always. This validates, it does not deploy.
    throw new Error("__rollback__");
  });
} catch (error) {
  if (error.message !== "__rollback__") {
    if (!failed) {
      console.error(`\n  FAIL  ${error.message}`);
      failed = true;
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}

console.log(
  failed
    ? "\nVALIDATION FAILED. Nothing was applied."
    : "\nVALIDATED and rolled back. Nothing was applied."
);
process.exit(failed ? 1 : 0);
