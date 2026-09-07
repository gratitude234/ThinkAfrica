import "server-only";

import postgres from "postgres";
import { adaptDriver, type SqlExecutor } from "@/lib/db/postgres/executor";

/**
 * The one PostgreSQL connection the application uses.
 *
 * Created lazily, at module scope, and reused. Not per request and not per
 * query: a `postgres()` instance owns a pool, so constructing one per call
 * would open a fresh set of connections for every page view and exhaust the
 * server long before it ran out of anything else.
 *
 * ## Where the connection string comes from
 *
 * Two runtimes, two answers, and the difference matters enough that this
 * module refuses to guess:
 *
 *   - **Vercel (today, and throughout the transition).** `DATABASE_URL`, which
 *     must be Neon's *pooled* endpoint. A Vercel function is short-lived and
 *     there are many of them, so the pooling has to happen on Neon's side.
 *   - **A Cloudflare Worker (later).** The string comes from the Hyperdrive
 *     binding, never from an environment variable, because a Worker that dials
 *     Neon directly bypasses the pool it is paying for. `setConnectionString()`
 *     is how the Worker entry point will hand it over.
 *
 * `DATABASE_URL_DIRECT` is deliberately not read here. It is the unpooled
 * admin connection for migrations and DDL, it belongs to a different role, and
 * runtime traffic on it is how a schema change becomes an outage.
 */

let driver: ReturnType<typeof postgres> | undefined;
let overrideConnectionString: string | undefined;

export class PostgresConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostgresConnectionError";
  }
}

/**
 * Supplies the connection string explicitly, for a runtime that does not use
 * environment variables. Must be called before the first query.
 *
 * Throws rather than silently replacing a live pool: changing the target of a
 * pool that already has connections open is not a thing this module supports,
 * and quietly leaking the old one would be worse than refusing.
 */
export function setConnectionString(value: string): void {
  if (driver) {
    throw new PostgresConnectionError(
      "The PostgreSQL pool is already open. Set the connection string before the first query."
    );
  }
  overrideConnectionString = value;
}

export function resolveConnectionString(
  env: NodeJS.ProcessEnv = process.env
): string {
  const value = overrideConnectionString ?? env.DATABASE_URL;
  if (!value || !value.trim()) {
    throw new PostgresConnectionError(
      "DATABASE_URL is not set. The PostgreSQL adapter needs a pooled connection string; " +
        "in a Worker, call setConnectionString() with the Hyperdrive binding instead."
    );
  }
  return value.trim();
}

/**
 * Options that are not preferences.
 *
 * `max: 5` because a Cloudflare Worker invocation may hold at most six TCP
 * connections and Hyperdrive pools on the far side anyway, so a large local
 * pool buys nothing and risks the ceiling. The same number is right on Vercel
 * for the same reason in reverse: Neon's pooler is doing the pooling, and a
 * function that opens more sockets than it can use just holds them.
 *
 * `prepare: false` because both intended targets are transaction-mode poolers
 * (Neon's `-pooler` endpoint, and Hyperdrive). A named prepared statement is
 * bound to a backend connection, and a transaction-mode pooler does not
 * promise the next statement lands on the same one.
 *
 * `idle_timeout` and `max_lifetime` keep a serverless instance from holding a
 * connection open across long idle periods, which is how a small pool becomes
 * a large one at the database.
 *
 * `connect_timeout` and `statement_timeout` are the direct heirs of
 * lib/supabase/fetchTimeout.ts. That deadline exists because a database that
 * stopped answering held a Vercel function open for 300 seconds and produced
 * nothing; the fix must not be lost in the port. `statement_timeout` is also
 * set on the role by scripts/migration/neon-preflight.sql, so the ceiling
 * holds even for a client that forgets to ask for it.
 */
export const POSTGRES_POOL_OPTIONS = {
  max: 5,
  prepare: false,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
  connect_timeout: 10,
  connection: { statement_timeout: 8000 },
  // postgres.js otherwise runs a type-OID lookup on connect, which is a whole
  // extra round trip on every cold isolate.
  fetch_types: false,
} as const;

function getDriver(): ReturnType<typeof postgres> {
  if (!driver) {
    driver = postgres(resolveConnectionString(), POSTGRES_POOL_OPTIONS);
  }
  return driver;
}

export function resolvePostgresExecutor(): SqlExecutor {
  return adaptDriver(getDriver());
}

/** Closes the pool. For scripts and tests; a serverless request never calls
 *  this, because the next request wants the pool that is already warm. */
export async function closePostgresConnection(): Promise<void> {
  if (!driver) return;
  const open = driver;
  driver = undefined;
  await open.end({ timeout: 5 });
}

/** Test seam, so a suite can assert the resolution rules without opening a
 *  socket. Nothing in the application calls this. */
export function resetPostgresConnectionForTests(): void {
  driver = undefined;
  overrideConnectionString = undefined;
}
