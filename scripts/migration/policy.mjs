/**
 * Migration policy that more than one script has to agree on.
 *
 * Keeping these here rather than in the script that first needed them is what
 * stops the copier and the verifier from disagreeing about what was supposed
 * to happen, which would turn a deliberate exclusion into a reported mismatch
 * or, worse, the reverse.
 */

/**
 * Tables whose SCHEMA migrates but whose DATA does not.
 *
 * `private.cron_http_requests` is the Supabase Cron dispatch log. Three
 * reasons it is excluded, in order of importance:
 *
 *   1. **Nothing on Neon will ever write it.** The five `private.*` scheduler
 *      functions depend on pg_cron, pg_net and vault, none of which Neon has,
 *      so the transformation removes them. The table would be a permanent
 *      6,000-row fossil.
 *   2. **It is the only table that moves during a copy.** Supabase Cron
 *      appends to it every few minutes, so a dump taken at T and verified at
 *      T+2min differs by however many jobs ran in between. That is not a copy
 *      failure, but it is indistinguishable from one, and a verification step
 *      that is sometimes off by one teaches people to ignore it.
 *   3. It is operational history with no application meaning. Nothing reads it
 *      except the reconciliation function, which is also removed.
 *
 * The table itself is kept so the schema is a faithful copy and so the
 * decision stays visible rather than becoming a silently missing object.
 */
export const EXCLUDED_TABLE_DATA = [
  {
    table: "private.cron_http_requests",
    reason:
      "Supabase Cron dispatch log. Nothing on Neon writes it, and it grows " +
      "during the copy, which makes verification non-deterministic.",
  },
];

export const EXCLUDED_TABLE_DATA_NAMES = new Set(
  EXCLUDED_TABLE_DATA.map((entry) => entry.table)
);
