/**
 * Turns a raw Supabase schema dump into one that can be applied to Neon.
 *
 *   node scripts/migration/dump-schema.mjs       # out/schema.raw.sql
 *   node scripts/migration/transform-schema.mjs  # out/schema.neon.sql + manifest
 *
 * Deterministic and repeatable: the same input produces the same output, and
 * every change is a named rule that records what it did and why. Nothing here
 * is a hand edit, because a hand-edited dump is a migration nobody can run
 * twice and nobody can review.
 *
 * ## What has to change, and why
 *
 * The dump is already narrowed to `public` and `private` by
 * `--schema=`, and already free of Supabase's role grants by
 * `--no-owner --no-privileges`. What remains are the places where application
 * objects reach *into* provider-owned schemas. Each is handled by one rule
 * below and appears in `out/MANIFEST.md`.
 *
 * ## What deliberately does NOT change
 *
 * The 178 `auth.uid()` and 26 `auth.role()` call sites in policies and
 * functions are left exactly as they are. Rewriting them here would be a
 * regex pass over generated SQL touching every authorization rule in the
 * product at once, which is the single most dangerous thing this pipeline
 * could do. Instead the schema gains a small `auth` compatibility shim whose
 * `uid()` returns NULL unless the application has explicitly set an identity
 * for the current transaction.
 *
 * The consequence is deliberate and is the safe direction: on Neon, every
 * owner-scoped policy **denies** by default rather than matching a row.
 * Application-level authorization, which Phase 2 made primary, is what
 * actually admits a request. See docs/neon-schema-transformation.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { splitStatements } from "./sqlStatements.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "out");
const RAW = join(OUT, "schema.raw.sql");
const NEON = join(OUT, "schema.neon.sql");

/** Every entry becomes a row in the manifest. `future` is what has to exist
 *  before the object can come back, and is the question Phase 4 inherits. */
const manifest = [];

function record(entry) {
  manifest.push(entry);
}

// The statement splitter lives in its own module so it can be tested: it is
// the riskiest part of this pipeline, and a mis-split produces a schema that
// applies with half its logic missing rather than an error.

/** The object a statement is about, for manifest entries and for matching. */
function describeStatement(statement) {
  const head = statement
    .split(/\r?\n/)
    .find((line) => line.trim() && !line.trim().startsWith("--"));
  return (head ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
}

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

/**
 * Functions whose bodies read a schema Neon does not have. Each is removed
 * from the schema, and the reason is not the same for all of them, so the
 * replacement is not either.
 */
const PROVIDER_FUNCTIONS = new Map([
  [
    "private.dispatch_indegenius_cron",
    {
      depends: "vault (secret storage) and pg_net (outbound HTTP)",
      action: "removed",
      future:
        "Cloudflare Cron Triggers call the same /api/cron/* routes over HTTPS. " +
        "The CRON_SECRET moves to a Worker secret; no database-side scheduler remains.",
    },
  ],
  [
    "private.install_indegenius_cron_jobs",
    {
      depends: "vault and pg_cron",
      action: "removed",
      future: "Replaced by wrangler.toml cron triggers. Nothing schedules from SQL.",
    },
  ],
  [
    "private.remove_indegenius_cron_jobs",
    { depends: "pg_cron", action: "removed", future: "Not needed once nothing schedules from SQL." },
  ],
  [
    "private.inspect_indegenius_cron_jobs",
    {
      depends: "pg_cron (cron.job, cron.job_run_details)",
      action: "removed",
      future:
        "Cloudflare exposes cron invocation history. The equivalent inspection " +
        "moves there rather than into SQL.",
    },
  ],
  [
    "private.prune_indegenius_cron_history",
    { depends: "pg_cron", action: "removed", future: "Nothing writes cron history on Neon." },
  ],
  [
    "private.reconcile_indegenius_cron_http_requests",
    {
      depends: "pg_net (net._http_response)",
      action: "removed",
      future:
        "The reconciliation exists because pg_net dispatches asynchronously and " +
        "the response lands later. An HTTP call from a Worker is synchronous, so " +
        "the problem does not recur.",
    },
  ],
  [
    "public.list_broadcast_contact_emails",
    {
      depends: "auth.users",
      action: "replaced with a stub that raises",
      future:
        "Reads the Better Auth user table. Deliberately NOT left returning an " +
        "empty set: CLAUDE.md records that an empty audience would sync " +
        "successfully and silently mail nobody, so on Neon it must fail loudly " +
        "until it is rewritten.",
    },
  ],
]);

/** The stub that replaces a function which must not silently succeed. */
function raisingStub(signature, reason) {
  return `-- Replaced by scripts/migration/transform-schema.mjs.
-- Original body read ${reason}, which does not exist on Neon.
-- It raises rather than returning an empty result: an empty audience would
-- report a successful sync and mail nobody.
CREATE FUNCTION ${signature}
    LANGUAGE plpgsql
    AS $migration_stub$
BEGIN
  RAISE EXCEPTION
    'list_broadcast_contact_emails() has not been ported off auth.users. '
    'See docs/neon-schema-transformation.md.'
    USING ERRCODE = 'feature_not_supported';
END;
$migration_stub$;`;
}

const RULES = [
  {
    name: "schema-if-not-exists",
    why:
      "The preflight creates public and private before the schema is applied, " +
      "so a bare CREATE SCHEMA aborts the restore on its first statement.",
    apply(statement) {
      const match = statement.match(/^CREATE SCHEMA (\w+);/m);
      if (!match) return null;
      record({
        object: `schema ${match[1]}`,
        action: "made idempotent",
        reason: "created by neon-preflight.sql Part A",
        future: null,
      });
      return statement.replace(
        /^CREATE SCHEMA (\w+);/m,
        "CREATE SCHEMA IF NOT EXISTS $1;"
      );
    },
  },

  {
    name: "provider-functions",
    why:
      "Functions whose bodies read pg_cron, pg_net, vault or auth.users. Neon " +
      "has none of those, so the restore would fail on the function body.",
    apply(statement) {
      const match = statement.match(/^CREATE FUNCTION ((?:public|private)\.\w+)\(/m);
      if (!match) return null;
      const entry = PROVIDER_FUNCTIONS.get(match[1]);
      if (!entry) return null;

      record({
        object: `function ${match[1]}()`,
        action: entry.action,
        reason: `body reads ${entry.depends}`,
        future: entry.future,
      });

      if (entry.action !== "replaced with a stub that raises") return "";

      const signature = statement
        .slice(statement.indexOf("CREATE FUNCTION ") + "CREATE FUNCTION ".length)
        .split(/\r?\n/)[0]
        .replace(/\s*$/, "");
      return raisingStub(signature, entry.depends);
    },
  },

  {
    name: "auth-users-foreign-keys",
    why:
      "Three application tables reference auth.users. The target of those keys " +
      "is the Better Auth user table, which does not exist yet, so the " +
      "constraints are dropped and the columns keep their UUIDs untouched.",
    apply(statement) {
      if (!/REFERENCES auth\.users/.test(statement)) return null;
      const match = statement.match(/ADD CONSTRAINT (\w+) FOREIGN KEY \((\w+)\)/);
      const onDelete = statement.match(/ON DELETE (\w+(?: \w+)?)/);
      const table = statement.match(/ALTER TABLE ONLY (\S+)/);
      record({
        object: `constraint ${match?.[1] ?? "?"} on ${table?.[1] ?? "?"}`,
        action: "removed",
        reason: "references auth.users, a provider-owned table that is not migrated",
        future:
          `Recreate against the Better Auth user table, preserving ` +
          `ON DELETE ${onDelete?.[1] ?? "?"}. The UUIDs in ` +
          `${table?.[1] ?? "?"}.${match?.[2] ?? "?"} are unchanged and are the ` +
          `same values auth.users holds, so the key is re-addable without a backfill.`,
      });
      return "";
    },
  },

  {
    name: "extensions-schema-qualification",
    why:
      "Supabase installs extensions into a dedicated `extensions` schema. The " +
      "preflight installs uuid-ossp into public, so a column default calling " +
      "extensions.uuid_generate_v4() would not resolve.",
    apply(statement) {
      if (!/extensions\.uuid_generate_v4\(\)/.test(statement)) return null;
      const table = statement.match(/^CREATE TABLE (\S+)/m);
      record({
        object: `default on ${table?.[1] ?? describeStatement(statement)}`,
        action: "re-qualified",
        reason: "extensions.uuid_generate_v4() -> public.uuid_generate_v4()",
        future: null,
      });
      return statement.replace(
        /extensions\.uuid_generate_v4\(\)/g,
        "public.uuid_generate_v4()"
      );
    },
  },
];

// ---------------------------------------------------------------------------
// The auth compatibility shim
// ---------------------------------------------------------------------------

const AUTH_SHIM = `--
-- Auth compatibility shim, added by scripts/migration/transform-schema.mjs.
--
-- 178 policy expressions and 51 function bodies in this schema call
-- auth.uid(); 26 call auth.role(). Rewriting all of them here would be a
-- regex pass over every authorization rule in the product at once, performed
-- on generated SQL, in a step nobody reviews line by line. That is not a
-- trade this migration is willing to make, so the calls stay and the
-- functions are provided.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
-- It does not reproduce Supabase Auth. auth.uid() here returns whatever the
-- application set for the CURRENT TRANSACTION and NULL otherwise, so:
--
--   * every owner-scoped policy DENIES by default rather than matching rows,
--   * every auth.role() = 'authenticated' policy DENIES by default,
--   * a SECURITY DEFINER function guarding on a null uid RAISES.
--
-- Failing closed is the point. Application-level authorization, which Phase 2
-- made primary, is what admits a request; this shim exists so that the
-- migrated SQL still parses and still refuses, not so that it still grants.
--
-- THE POOLING HAZARD, STATED ONCE
--
-- The setting is read with is_local semantics in mind: the application must
-- set it with set_config(..., true), inside an explicit transaction, so it is
-- discarded at COMMIT. A session-scoped setting on a pooled connection is
-- handed to whichever request gets that connection next, which would give one
-- member another member's identity. Nothing in the application sets it today;
-- see docs/neon-schema-transformation.md before anything starts.

--
-- PostgREST role placeholders.
--
-- The --no-privileges flag strips GRANT statements, but a role named in a
-- policy TO clause is part of the policy definition, not a privilege. 35
-- policies name authenticated or anon, and the restore aborts on the first
-- one if the role does not exist.
--
-- They are created here as NOLOGIN, NOINHERIT, with no grants and no
-- membership. That is deliberate, and is the conservative of the two options:
--
--   * Creating them keeps every policy byte-identical to production, so the
--     authorization rules stay reviewable by diffing against Supabase.
--   * Re-pointing TO authenticated at indegenius_app would have made the
--     policies apply to the application role. That looks more "working" and is
--     worse: it silently changes who 35 rules cover, in a generated file, in a
--     step nobody reads line by line.
--
-- The consequence is that these policies match no role that can connect, so
-- they neither grant nor obstruct. Combined with auth.uid() returning NULL,
-- the schema's RLS is inert-but-intact on Neon: preserved for inspection and
-- for the eventual rewrite, relied upon for nothing.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT;
  END IF;
END
$roles$;

COMMENT ON ROLE anon IS 'Placeholder so migrated policies restore. NOLOGIN, no grants.';
COMMENT ON ROLE authenticated IS 'Placeholder so migrated policies restore. NOLOGIN, no grants.';
COMMENT ON ROLE service_role IS 'Placeholder so migrated policies restore. NOLOGIN, no grants.';

CREATE SCHEMA IF NOT EXISTS auth;

COMMENT ON SCHEMA auth IS
  'Compatibility shim only. Two functions, no tables, no relationship to '
  'Supabase Auth. See scripts/migration/transform-schema.mjs.';

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $shim$
  SELECT public.app_user_id()
$shim$;

COMMENT ON FUNCTION auth.uid() IS
  'Returns the transaction-local app.user_id, or NULL. NULL means nobody, '
  'never everybody: policies that compare against it deny.';

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $shim$
  SELECT CASE WHEN public.app_user_id() IS NULL THEN 'anon' ELSE 'authenticated' END
$shim$;

COMMENT ON FUNCTION auth.role() IS
  'anon unless the application set an identity for this transaction. Policies '
  'requiring the authenticated role therefore deny by default.';

REVOKE ALL ON SCHEMA auth FROM PUBLIC;
GRANT USAGE ON SCHEMA auth TO indegenius_app;
GRANT EXECUTE ON FUNCTION auth.uid() TO indegenius_app;
GRANT EXECUTE ON FUNCTION auth.role() TO indegenius_app;
`;

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const raw = readFileSync(RAW, "utf8");
const statements = splitStatements(raw);

let removed = 0;
let rewritten = 0;

const transformed = statements.map((statement) => {
  for (const rule of RULES) {
    const result = rule.apply(statement);
    if (result === null) continue;
    if (result === "") removed += 1;
    else rewritten += 1;
    return result;
  }
  return statement;
});

const header = `--
-- Indegenius: Supabase -> Neon application schema.
--
-- GENERATED. Do not edit. Regenerate with:
--   node scripts/migration/dump-schema.mjs
--   node scripts/migration/transform-schema.mjs
--
-- Source: pg_dump --schema-only --schema=public --schema=private
--         --no-owner --no-privileges
-- Rules applied: ${RULES.map((rule) => rule.name).join(", ")}
-- Objects changed: ${manifest.length} (see out/MANIFEST.md)
--
-- Apply AFTER neon-preflight.sql Part A, and run Part B afterwards.
--

`;

mkdirSync(OUT, { recursive: true });
writeFileSync(NEON, header + AUTH_SHIM + "\n" + transformed.join("\n"), "utf8");

// The manifest, in both machine and human form.
writeFileSync(
  join(OUT, "manifest.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), rules: RULES.map((r) => ({ name: r.name, why: r.why })), entries: manifest }, null, 1)
);

const grouped = new Map();
for (const entry of manifest) {
  const list = grouped.get(entry.action) ?? [];
  list.push(entry);
  grouped.set(entry.action, list);
}

const md = [
  "# Neon schema transformation manifest",
  "",
  "GENERATED by `scripts/migration/transform-schema.mjs`. Every object that",
  "could not move unchanged, what happened to it, and what has to exist before",
  "it can come back.",
  "",
  `Generated: ${new Date().toISOString()}`,
  `Statements in dump: ${statements.length}`,
  `Objects changed: ${manifest.length} (${removed} removed, ${rewritten} rewritten)`,
  "",
  "## Rules",
  "",
  ...RULES.flatMap((rule) => [`### \`${rule.name}\``, "", rule.why, ""]),
  "## Objects",
  "",
  "| Object | Action | Reason | Future replacement |",
  "|---|---|---|---|",
  ...manifest.map(
    (entry) =>
      `| \`${entry.object}\` | ${entry.action} | ${entry.reason} | ${entry.future ?? "n/a"} |`
  ),
  "",
];
writeFileSync(join(OUT, "MANIFEST.md"), md.join("\n"), "utf8");

console.log(`statements parsed: ${statements.length}`);
console.log(`objects changed:   ${manifest.length} (${removed} removed, ${rewritten} rewritten)`);
for (const [action, entries] of grouped) {
  console.log(`  ${action}: ${entries.length}`);
}
console.log(`\nwrote out/schema.neon.sql, out/manifest.json, out/MANIFEST.md`);

// A transformed schema that still names a provider schema is a bug in a rule,
// not something to discover during the restore.
const leftovers = [
  ["auth.users", /auth\.users/g],
  ["vault.", /\bvault\./g],
  ["cron.", /\bcron\.(?:job|schedule|unschedule)/g],
  ["net.http", /\bnet\.(?:http|_http)/g],
  ["extensions.", /\bextensions\./g],
];
/**
 * Comments and string literals removed, so the check is about what the schema
 * *depends on* rather than what it talks about. A stub that explains it was
 * ported off auth.users mentions auth.users, and that is documentation, not a
 * dependency.
 */
function executableSql(source) {
  return source
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .replace(/'(?:[^']|'')*'/g, "''");
}

const output = executableSql(readFileSync(NEON, "utf8"));
let clean = true;
console.log("\nresidual provider references in the output (comments and string");
console.log("literals excluded: those are documentation, not dependencies):");
for (const [label, pattern] of leftovers) {
  const count = (output.match(pattern) ?? []).length;
  console.log(`  ${label.padEnd(14)} ${count}`);
  if (count > 0) clean = false;
}
if (!clean) {
  console.error("\nFAILED: the transformed schema still references a provider schema.");
  process.exit(1);
}
