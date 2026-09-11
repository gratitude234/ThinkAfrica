import "server-only";

import { isReadDomainMigrated, type ReadDomain } from "@/lib/db/readAdapter";

/**
 * Which backend served a migrated read, as a response header.
 *
 * ## Why this exists
 *
 * A domain is enabled by setting `READ_MIGRATED_DOMAINS` and redeploying, and
 * until now there was no way to confirm from outside that the flag had taken
 * effect. "Search still works" is equally true whether the repository ran
 * against PostgreSQL or PostgREST, so the canary would have been verified by
 * assuming the thing it was meant to prove. A flag that silently did nothing,
 * because of a typo or a deploy that did not pick up the variable, looks
 * exactly like a successful cutover.
 *
 * So the header states which path served the request. One `curl -I` answers it.
 *
 * ## Why this is safe to expose
 *
 * The value is `postgres` or `supabase` and nothing else. It carries no
 * connection string, no host, no credential and no query. It says which of two
 * implementations ran, which is not information an attacker can act on: the
 * application's use of PostgreSQL is described in its public repository.
 *
 * It is still opt-in, because a permanent header is a permanent commitment and
 * this is a temporary instrument. `READ_BACKEND_HEADER=1` turns it on for a
 * canary and removing the variable turns it off, with no code change either
 * way.
 */

export const READ_BACKEND_HEADER = "x-read-backend";

function headerEnabled(
  raw: string | undefined = process.env.READ_BACKEND_HEADER
): boolean {
  const value = (raw ?? "").trim().toLowerCase();
  return value === "1" || value === "true";
}

/**
 * The header pair for a domain, or nothing.
 *
 * Reports what the adapter *would* select for this domain, read from the same
 * function the repository selection uses, so the header cannot claim one thing
 * while the request did another.
 */
export function readBackendHeaders(
  domain: ReadDomain
): Record<string, string> {
  if (!headerEnabled()) return {};
  return {
    [READ_BACKEND_HEADER]: isReadDomainMigrated(domain) ? "postgres" : "supabase",
  };
}
