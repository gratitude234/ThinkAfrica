/**
 * Applies the transformed schema to the Neon scratch database, in order.
 *
 *   node scripts/migration/apply-schema.mjs
 *
 * Three steps, and the order is the whole point:
 *
 *   1. `neon-preflight.sql` Part A: extensions, schemas, `app_user_id()`, the
 *      two roles, default privileges, statement timeouts.
 *   2. `out/schema.neon.sql`: the transformed dump.
 *   3. Part B: the ALL TABLES grants, which cannot run before the tables
 *      exist. Skipping this leaves the application role able to connect and
 *      able to read nothing, which looks like a broken query rather than a
 *      missing grant.
 *
 * Step 3 is extracted from the same preflight file rather than kept in a
 * second one, so the two halves cannot drift apart. The file marks Part B as a
 * commented block; this uncomments it and runs it.
 *
 * Uses DATABASE_URL_DIRECT: DDL on a pooled endpoint is how a schema change
 * becomes an outage.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, requireUrl } from "./env.mjs";
import { psql } from "./pg.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
const PREFLIGHT = join(HERE, "neon-preflight.sql");
const SCHEMA = join(OUT, "schema.neon.sql");

loadEnv();
const url = requireUrl("DATABASE_URL_DIRECT");

if (!new URL(url).hostname.endsWith(".neon.tech")) {
  console.error("REFUSED: DATABASE_URL_DIRECT does not point at Neon.");
  process.exit(2);
}

/**
 * Part B lives in the preflight as a commented block between two markers.
 * Extracting it here keeps one file as the source of truth for both halves.
 */
function extractPartB() {
  const source = readFileSync(PREFLIGHT, "utf8");
  const start = source.indexOf("-- Part B: run AFTER the schema is applied");
  const end = source.indexOf("-- Verification. Run after Part B.");
  if (start < 0 || end < 0) {
    throw new Error("Could not find Part B in neon-preflight.sql.");
  }
  const block = source.slice(start, end);
  const statements = block
    .split(/\r?\n/)
    .filter((line) => /^-- (GRANT|REVOKE) /.test(line.trim()))
    .map((line) => line.replace(/^--\s?/, ""));
  if (statements.length === 0) {
    throw new Error("Part B contains no GRANT or REVOKE statements.");
  }
  return statements.join("\n") + "\n";
}

function step(label, args) {
  process.stdout.write(`${label} ... `);
  const result = psql(url, args);
  const errors = result.stderr
    .split(/\r?\n/)
    .filter((line) => /ERROR|FATAL/.test(line));

  if (result.status !== 0 || errors.length > 0) {
    console.log("FAILED");
    for (const error of errors) console.log(`    ${error}`);
    if (errors.length === 0) console.log(`    exit ${result.status}`);
    console.log(
      "\nThe database is now partially applied. Do not patch it by hand:\n" +
        "  node scripts/migration/reset-neon.mjs --yes\n" +
        "then fix the transformation and run this again."
    );
    process.exit(1);
  }

  const notices = result.stderr
    .split(/\r?\n/)
    .filter((line) => /NOTICE|WARNING/.test(line));
  console.log(`ok${notices.length ? ` (${notices.length} notices)` : ""}`);
  return result;
}

mkdirSync(OUT, { recursive: true });
const partB = join(OUT, "preflight-part-b.sql");
writeFileSync(partB, extractPartB(), "utf8");

step("preflight Part A     ", ["-f", PREFLIGHT]);
step("transformed schema   ", ["-f", SCHEMA]);
step("preflight Part B     ", ["-f", partB]);

console.log("\nSchema applied. Next: node scripts/migration/verify-schema.mjs");
