import { NextRequest, NextResponse } from "next/server";

import {
  MIGRATABLE_READ_DOMAINS,
  isReadDomainMigrated,
  type ReadDomain,
} from "@/lib/db/readAdapter";
import { resolvePostgresExecutor } from "@/lib/db/postgres/connection";
import { isWriteFrozen } from "@/lib/writeFreeze";

export const dynamic = "force-dynamic";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

/**
 * What production is actually doing, for the database cutover.
 *
 * ## Why an endpoint rather than reading the logs
 *
 * Every check the cutover depends on is a claim about the running deployment,
 * and each one has a way of looking true when it is not. `READ_MIGRATED_DOMAINS`
 * can contain a typo and silently leave a domain on PostgREST. A redeploy can
 * fail to pick up a variable. `DATABASE_URL` can point at the database the
 * repositories were *tested* against rather than the one they are meant to
 * serve from, which is the specific mistake this migration has already made
 * once locally.
 *
 * "Search still works" distinguishes none of those. This endpoint answers them
 * directly: which domains the adapter has switched, which database the pool is
 * actually connected to, and whether a query against it returns.
 *
 * ## Why the provider name is safe to return
 *
 * The host is reduced to a provider label, `neon` or `supabase` or `other`,
 * and the database name. No connection string, no credential, no host, no
 * port, no user. Behind `ADMIN_SECRET` regardless, because the combination of
 * flag states is operational detail even though none of it is a secret.
 */
export async function GET(request: NextRequest) {
  if (!ADMIN_SECRET || request.headers.get("x-internal-secret") !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const domains = Object.fromEntries(
    MIGRATABLE_READ_DOMAINS.map((domain: ReadDomain) => [
      domain,
      isReadDomainMigrated(domain) ? "postgres" : "supabase",
    ])
  );

  const migrated = MIGRATABLE_READ_DOMAINS.filter((domain) =>
    isReadDomainMigrated(domain)
  );

  const flags = {
    readMigratedDomains: process.env.READ_MIGRATED_DOMAINS ?? null,
    writeDatabaseAdapter: process.env.WRITE_DATABASE_ADAPTER ?? null,
    authAdapter: process.env.AUTH_ADAPTER ?? null,
    databaseAdapter: process.env.DATABASE_ADAPTER ?? null,
    writeFrozen: safely(() => isWriteFrozen()),
  };

  // The live half. Only attempted when something is actually migrated, because
  // resolving the executor with no DATABASE_URL throws by design.
  let database: Record<string, unknown> = {
    probed: false,
    reason: migrated.length === 0 ? "no migrated domains" : undefined,
  };

  if (migrated.length > 0) {
    const started = Date.now();
    try {
      const executor = resolvePostgresExecutor();
      const [row] = await executor.query<{
        db: string;
        version: string;
        now: string;
      }>(
        `select current_database() as db,
                current_setting('server_version') as version,
                now()::text as now`
      );
      database = {
        probed: true,
        ok: true,
        provider: providerOf(process.env.DATABASE_URL),
        name: row?.db ?? null,
        serverVersion: row?.version ?? null,
        serverTime: row?.now ?? null,
        ms: Date.now() - started,
      };
    } catch (error) {
      // A failure here is the answer, not an inconvenience. Returning 200 with
      // an empty body would make a broken cutover look like a working one.
      database = {
        probed: true,
        ok: false,
        provider: providerOf(process.env.DATABASE_URL),
        error: error instanceof Error ? error.message.slice(0, 200) : String(error),
        ms: Date.now() - started,
      };
    }
  }

  return NextResponse.json(
    { flags, domains, migratedCount: migrated.length, database },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** The provider, from the host alone. Never the connection string. */
function providerOf(url: string | undefined): string {
  if (!url) return "unset";
  try {
    const host = new URL(url).hostname;
    if (host.includes("neon.tech")) return "neon";
    if (host.includes("supabase.com") || host.includes("supabase.co")) {
      return "supabase";
    }
    return "other";
  } catch {
    return "unparseable";
  }
}

/** A flag that throws on a bad value should report that, not take the route down. */
function safely<T>(read: () => T): T | string {
  try {
    return read();
  } catch (error) {
    return error instanceof Error ? `invalid: ${error.message.slice(0, 80)}` : "invalid";
  }
}
