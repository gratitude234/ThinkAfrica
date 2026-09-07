/**
 * Runs `psql` and `pg_dump` without a connection string on the command line.
 *
 * A URI passed as an argument is visible in the process list to every other
 * user on the machine, and lands in shell history. libpq reads `PGHOST`,
 * `PGUSER`, `PGPASSWORD` and friends from the environment instead, which is
 * visible only to the process and its children. So the URL is parsed here and
 * handed over as environment variables.
 *
 * Everything in this module is a thin wrapper. It adds no SQL, rewrites no
 * arguments, and reports the child's exit status faithfully.
 */
import { spawnSync } from "node:child_process";
import { pgTools } from "./env.mjs";

/**
 * libpq environment for one connection string.
 *
 * `sslmode` deserves a note: both Supabase and Neon require TLS, and Neon
 * additionally needs SNI, which libpq sends whenever it connects by hostname.
 * `require` verifies nothing about the certificate chain, which is the same
 * posture postgres.js uses elsewhere in this migration and is appropriate for
 * a scratch copy. A production cutover should move to `verify-full` with a
 * pinned root, and that is a Phase 4 decision, not a Phase 3 one.
 */
export function connectionEnv(url) {
  const parsed = new URL(url);
  const env = {
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: parsed.pathname.replace(/^\//, "") || "postgres",
    PGSSLMODE: parsed.searchParams.get("sslmode") ?? "require",
    // Never let a local .pgpass or service file change what this connects to.
    PGPASSFILE: "",
    PGSERVICEFILE: "",
    // Deterministic output regardless of the operator's locale.
    PGCLIENTENCODING: "UTF8",
    LC_MESSAGES: "C",
  };
  const options = parsed.searchParams.get("options");
  if (options) env.PGOPTIONS = options;
  return env;
}

function run(binary, args, url, options = {}) {
  const result = spawnSync(binary, args, {
    env: { ...process.env, ...connectionEnv(url) },
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    ...options,
  });

  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function psql(url, args, options = {}) {
  const { psql: binary } = pgTools();
  return run(
    binary,
    // -X ignores ~/.psqlrc, so an operator's own settings cannot change what a
    // migration step does. ON_ERROR_STOP turns a failed statement into a
    // non-zero exit instead of a partially applied script.
    ["-X", "-v", "ON_ERROR_STOP=1", ...args],
    url,
    options
  );
}

/** A single statement, with the result as plain text. Used for verification
 *  queries where a table of rows is easier to read than JSON. */
export function psqlQuery(url, sql, extraArgs = []) {
  return psql(url, ["-At", "-c", sql, ...extraArgs], url);
}

export function pgDump(url, args) {
  const { pgDump: binary } = pgTools();
  return run(binary, args, url);
}
