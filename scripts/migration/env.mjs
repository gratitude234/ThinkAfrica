/**
 * Loads `.env.local` for the migration scripts.
 *
 * They are plain Node, so they get none of the environment Next.js assembles
 * for the application. Phase 2 asked the operator to export the variables by
 * hand, which is both a nuisance and a way for a connection string to end up
 * in a shell history file.
 *
 * Two rules this module exists to enforce:
 *
 *   - **A real environment variable always wins.** CI, a one-off override and
 *     a deliberate `SUPABASE_DB_URL=... node ...` all keep working, and none of
 *     them is silently replaced by whatever happens to be in a local file.
 *   - **Nothing here ever returns a value to be printed.** `requireUrl()` hands
 *     back the string for a driver to consume; `describe()` is what a script
 *     shows a human, and it emits a host class and nothing else.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** `.env.local` first, then `.env`. Neither is required. */
const FILES = [".env.local", ".env"];

function parse(source) {
  const values = new Map();
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

let loaded = false;

export function loadEnv() {
  if (loaded) return;
  loaded = true;
  for (const file of FILES) {
    const path = join(REPO, file);
    if (!existsSync(path)) continue;
    for (const [key, value] of parse(readFileSync(path, "utf8"))) {
      // A variable already in the environment is authoritative.
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

export class MissingEnvError extends Error {
  constructor(key, description) {
    super(`${key} is not set.\n\n  ${description}\n`);
    this.name = "MissingEnvError";
  }
}

const DESCRIPTIONS = {
  SUPABASE_DB_URL:
    "The DIRECT Supabase PostgreSQL URI (Project Settings -> Database ->\n  " +
    "Connection string -> URI). Not the anon key, not the service-role key,\n  " +
    "and not the https:// project URL: none of those can run a catalogue query.",
  DATABASE_URL:
    "The Neon SCRATCH connection string, POOLED endpoint. Never production.",
  DATABASE_URL_DIRECT:
    "The Neon SCRATCH connection string, UNPOOLED endpoint. Used for DDL and\n  " +
    "data loading only, never for application runtime traffic.",
};

export function requireUrl(key) {
  loadEnv();
  const value = process.env[key];
  if (!value || !value.trim()) {
    throw new MissingEnvError(key, DESCRIPTIONS[key] ?? "Required by this script.");
  }
  return value.trim();
}

/**
 * A one-line description safe to print: which database family, and whether the
 * endpoint is pooled. Deliberately no host, no user, no database name, no port.
 */
export function describe(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "unparseable connection string";
  }
  const host = parsed.hostname.toLowerCase();
  const provider = host.endsWith(".neon.tech")
    ? "Neon"
    : host.endsWith(".supabase.co") || host.endsWith(".supabase.com")
      ? "Supabase"
      : host === "localhost" || host === "127.0.0.1"
        ? "local"
        : "other";
  // Neon spells it `...-pooler.<region>.neon.tech`; Supavisor spells it
  // `aws-N-<region>.pooler.supabase.com`. Both are pooled.
  const pooled =
    host.includes("-pooler") || host.includes(".pooler.") || host.includes("pgbouncer");
  return `${provider}, ${pooled ? "pooled" : "direct"} endpoint`;
}

/**
 * Redacts anything that could reconstruct a connection: a driver's error text
 * routinely embeds the host, the user and sometimes the password.
 */
export function redact(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/\b[a-z0-9._-]+:[^\s@]+@[^\s/]+/gi, "<credentials redacted>")
    .replace(/\b[a-z0-9-]+\.[a-z0-9-]+\.(?:aws|azure|gcp)\.neon\.tech\b/gi, "<neon host>")
    .replace(/\bdb\.[a-z0-9]+\.supabase\.(?:co|com)\b/gi, "<supabase host>")
    .replace(/\b(?:postgres|postgresql):\/\/\S+/gi, "<connection string redacted>");
}

// ---------------------------------------------------------------------------
// Reaching Supabase from a network without IPv6
// ---------------------------------------------------------------------------

/**
 * Supabase's direct database host, `db.<ref>.supabase.co`, publishes only an
 * AAAA record. A machine with no IPv6 egress cannot reach it at all: the
 * failure is `ENOTFOUND` from the resolver, not a connection error, which
 * makes it look like a wrong hostname rather than a missing route.
 *
 * The IPv4 path is Supavisor, Supabase's pooler. `resolveSupabaseUrl()` uses
 * the direct host when it resolves and falls back to the pooler when it does
 * not, so the same command works on a dual-stack machine and on this one.
 *
 * Two details that are not optional:
 *
 *   - **Session mode, port 5432.** Transaction mode (6543) reuses a backend
 *     between statements, which breaks `pg_dump` and anything that depends on
 *     session state. Every use here is a dump or a catalogue read.
 *   - **The username becomes `postgres.<ref>`.** Supavisor routes to a tenant
 *     by username, not by host, which is also why the region can be discovered
 *     by asking each pooler whether it knows the tenant.
 *
 * The region is not derivable from the project ref and is not in any public
 * record, so it is discovered once and cached. `SUPABASE_POOLER_HOST` skips
 * discovery entirely.
 */

const POOLER_CACHE = join(REPO, "scripts", "migration", "out", "pooler-host.json");

/** Ordered by how often Supabase places projects there, so discovery usually
 *  stops in the first few. */
const SUPAVISOR_REGIONS = [
  "eu-west-1", "us-east-1", "eu-central-1", "us-west-1", "eu-west-2",
  "ap-southeast-1", "ap-south-1", "us-east-2", "ap-northeast-1",
  "ap-southeast-2", "eu-west-3", "ca-central-1", "sa-east-1",
  "ap-northeast-2", "eu-north-1", "eu-central-2", "us-west-2",
];

async function hasIpv4(hostname) {
  const { Resolver } = await import("node:dns/promises");
  const resolver = new Resolver();
  resolver.setServers(["1.1.1.1", "8.8.8.8"]);
  try {
    return (await resolver.resolve4(hostname)).length > 0;
  } catch {
    return false;
  }
}

function poolerUrl(direct, host) {
  const url = new URL(direct);
  const ref = url.hostname.split(".")[1];
  url.hostname = host;
  url.port = "5432";
  url.username = `postgres.${ref}`;
  return url.toString();
}

function cachedPoolerHost() {
  if (process.env.SUPABASE_POOLER_HOST) return process.env.SUPABASE_POOLER_HOST;
  try {
    return JSON.parse(readFileSync(POOLER_CACHE, "utf8")).host ?? null;
  } catch {
    return null;
  }
}

async function discoverPoolerHost(direct, postgres) {
  const ref = new URL(direct).hostname.split(".")[1];
  const password = decodeURIComponent(new URL(direct).password);

  for (const region of SUPAVISOR_REGIONS) {
    for (const prefix of ["aws-0", "aws-1"]) {
      const host = `${prefix}-${region}.pooler.supabase.com`;
      const sql = postgres({
        host,
        port: 5432,
        database: "postgres",
        username: `postgres.${ref}`,
        password,
        ssl: "require",
        max: 1,
        prepare: false,
        connect_timeout: 8,
        idle_timeout: 2,
        onnotice: () => {},
      });
      try {
        await sql`select 1`;
        return host;
      } catch {
        // Every pooler that does not front this tenant answers the same way.
      } finally {
        await sql.end({ timeout: 2 }).catch(() => {});
      }
    }
  }
  return null;
}

/**
 * The connection string to use for Supabase, and a label saying which path it
 * took. The label is safe to print; the string is not.
 */
export async function resolveSupabaseUrl(postgres) {
  const direct = requireUrl("SUPABASE_DB_URL");
  const hostname = new URL(direct).hostname;

  if (await hasIpv4(hostname)) {
    return { url: direct, via: "direct host (IPv4)" };
  }

  const cached = cachedPoolerHost();
  if (cached) {
    return { url: poolerUrl(direct, cached), via: `Supavisor session mode (${cached.replace(/\.pooler\.supabase\.com$/, "")})` };
  }

  if (!postgres) {
    throw new Error(
      "The Supabase direct host has no IPv4 address and no pooler host is known.\n" +
        "  Set SUPABASE_POOLER_HOST, or run: node scripts/migration/check-connections.mjs"
    );
  }

  const discovered = await discoverPoolerHost(direct, postgres);
  if (!discovered) {
    throw new Error(
      "The Supabase direct host has no IPv4 address, and no Supavisor region\n" +
        "  accepted this tenant. Set SUPABASE_POOLER_HOST explicitly."
    );
  }

  mkdirSync(dirname(POOLER_CACHE), { recursive: true });
  writeFileSync(POOLER_CACHE, JSON.stringify({ host: discovered }, null, 1));
  return {
    url: poolerUrl(direct, discovered),
    via: `Supavisor session mode (${discovered.replace(/\.pooler\.supabase\.com$/, "")}, discovered)`,
  };
}

// ---------------------------------------------------------------------------
// PostgreSQL client binaries
// ---------------------------------------------------------------------------

/**
 * Locates `pg_dump`, `psql` and friends.
 *
 * On this machine PostgreSQL 18 is installed but not on PATH, which is the
 * normal outcome of the Windows installer. Rather than ask an operator to edit
 * their PATH, or hard-code one absolute path into every script, the tools are
 * looked up: PATH first, then the standard install roots, newest major version
 * first.
 *
 * The version matters in one direction only. `pg_dump` must be at least as new
 * as the server it reads, because a newer server can emit catalogue shapes an
 * older dumper does not understand. Reading 17 with 18 is supported; reading
 * 18 with 17 is not.
 */

const PG_INSTALL_ROOTS = [
  "C:/Program Files/PostgreSQL",
  "C:/Program Files (x86)/PostgreSQL",
  "/usr/lib/postgresql",
  "/opt/homebrew/opt",
  "/usr/local/opt",
];

let toolCache = null;

export function pgTools() {
  if (toolCache) return toolCache;

  const exe = process.platform === "win32" ? ".exe" : "";
  const candidates = [];

  // An explicit PGBIN wins, then PATH: an operator who set either one meant it.
  if (process.env.PGBIN) candidates.push({ dir: process.env.PGBIN, label: "PGBIN" });
  candidates.push({ dir: null, label: "PATH" });

  for (const root of PG_INSTALL_ROOTS) {
    if (!existsSync(root)) continue;
    let entries;
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    const versions = entries
      .map((entry) => ({ entry, major: Number.parseInt(entry, 10) }))
      .filter((version) => Number.isFinite(version.major))
      .sort((a, b) => b.major - a.major);
    for (const version of versions) {
      candidates.push({
        dir: join(root, version.entry, "bin"),
        label: `PostgreSQL ${version.entry}`,
      });
    }
  }

  for (const candidate of candidates) {
    const pgDump = candidate.dir ? join(candidate.dir, `pg_dump${exe}`) : `pg_dump${exe}`;
    const psql = candidate.dir ? join(candidate.dir, `psql${exe}`) : `psql${exe}`;
    if (candidate.dir && !existsSync(pgDump)) continue;
    try {
      const version = execFileSync(pgDump, ["--version"], { encoding: "utf8" }).trim();
      const major = Number.parseInt(version.replace(/^\D*(\d+).*$/, "$1"), 10);
      toolCache = { pgDump, psql, version, major, source: candidate.label };
      return toolCache;
    } catch {
      // Present but not runnable. Try the next.
    }
  }

  throw new Error(
    "pg_dump was not found.\n\n" +
      "  Install the PostgreSQL client tools, or set PGBIN to the directory\n" +
      "  containing pg_dump and psql. On Windows:\n" +
      "    winget install PostgreSQL.PostgreSQL.18\n"
  );
}

/**
 * Refuses a dumper older than the server it is about to read. A newer server
 * can emit catalogue shapes an older pg_dump does not understand, and the
 * failure mode is a dump that is quietly missing objects rather than an error.
 */
export function assertDumperNewerThan(serverMajor) {
  const tools = pgTools();
  if (tools.major < serverMajor) {
    throw new Error(
      `pg_dump is version ${tools.major} but the source server is ${serverMajor}.\n` +
        "  Dumping a newer server with an older pg_dump is not supported and can\n" +
        "  silently omit objects. Install a client at least as new as the server."
    );
  }
  return tools;
}
