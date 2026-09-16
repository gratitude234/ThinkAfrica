/**
 * Applies the three reviewed identity migrations.
 *
 *   node scripts/migration/apply-identity-migrations.mjs --dry-run
 *   node scripts/migration/apply-identity-migrations.mjs --apply
 *
 * There is no local migration runner in this project, so this is the workflow:
 * each file is already a single transaction with a lock timeout, and they are
 * sent in order over the same direct connection the parity harnesses use.
 *
 * `--dry-run` wraps all three in one outer transaction and rolls it back, which
 * answers a question the Neon rehearsal cannot: whether they apply against
 * *this* database's current state. The scratch copy has the earlier draft on
 * it and production does not.
 *
 * ## What is deliberately NOT applied
 *
 * 20260910000001_parameterize_identity_rpcs_group2.sql. It creates PUBLIC
 * explicit-id overloads granted to `authenticated`, which is the design
 * 20260909000001 was rewritten to remove, and its bodies call
 * `public.assert_identity_claim` — which no longer exists, because the guard
 * moved to `private`. PostgreSQL does not validate a plpgsql body at creation,
 * so that file would apply cleanly and then fail at runtime, in the signup
 * flow. It needs the same rework group one got.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";

import { loadEnv, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const MIGRATIONS = [
  "20260909000001_parameterize_identity_rpcs.sql",
  "20260910000001_private_profile_explicit_user.sql",
  "20260910000002_drop_superseded_public_identity_overloads.sql",
];

const mode = process.argv.includes("--apply")
  ? "apply"
  : process.argv.includes("--dry-run")
    ? "dry-run"
    : null;

if (!mode) {
  console.error("\nPass --dry-run or --apply.\n");
  process.exit(2);
}

/** The file, with its own transaction boundary removed so the caller owns it. */
function statements(file) {
  return readFileSync(resolve("supabase/migrations", file), "utf8")
    .replace(/^\s*BEGIN;\s*$/m, "")
    .replace(/^\s*COMMIT;\s*$/m, "")
    .replace(/^\s*SET LOCAL lock_timeout[^\n]*$/m, "");
}

const resolved = await resolveSupabaseUrl(postgres);
console.log(`\nConnected via ${resolved.via}`);
console.log(`Mode: ${mode}\n`);

const sql = postgres(resolved.url, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  fetch_types: false,
  onnotice: () => {},
});

try {
  if (mode === "dry-run") {
    let rolledBack = false;
    await sql
      .begin(async (tx) => {
        await tx.unsafe("set local lock_timeout = '5s'");
        for (const file of MIGRATIONS) {
          const started = Date.now();
          await tx.unsafe(statements(file));
          console.log(`  would apply ${file}  ${Date.now() - started}ms`);
        }
        throw new Error("rollback");
      })
      .catch((error) => {
        if (error instanceof Error && error.message === "rollback") {
          rolledBack = true;
          return;
        }
        throw error;
      });

    console.log(
      rolledBack
        ? "\nDry run clean. Nothing was committed.\n"
        : "\nDry run did not reach the rollback.\n"
    );
  } else {
    // One transaction per file, so a failure in the third does not undo the
    // first two: each is independently reversible and independently meaningful.
    for (const file of MIGRATIONS) {
      const started = Date.now();
      await sql.begin(async (tx) => {
        await tx.unsafe("set local lock_timeout = '5s'");
        await tx.unsafe(statements(file));
      });
      console.log(`  APPLIED ${file}  ${Date.now() - started}ms`);
    }
    console.log("\nAll three applied.\n");
  }
} finally {
  await sql.end({ timeout: 5 });
}
