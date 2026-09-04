import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Bulk member addresses for the recipient sync.
 *
 * Addresses live in auth.users, which PostgREST does not expose. The obvious
 * way to read them is the GoTrue admin API, and that is what this did first,
 * but auth.admin.listUsers cannot deserialise a row holding NULL in any of its
 * token columns: it models them as non-nullable Go strings, so one row seeded
 * by direct SQL rather than through the Auth API fails the whole request with
 * "Database error finding users". Narrower pages succeed only because they stop
 * short of the bad row, which makes the fault look like a page-size limit.
 *
 * list_broadcast_contact_emails() reads the two columns we want in SQL and
 * never builds that struct, so it is immune to the defect whichever column is
 * NULL, and costs one round trip rather than one per thousand members.
 *
 * There is deliberately no fallback to profiles.signup_email. It is populated
 * for four of this project's members, so falling back to it would not fail: it
 * would quietly sync a near-empty audience and report success.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

type ContactEmailRow = {
  profile_id: string;
  email: string | null;
};

/** PostgREST caps a response at a page, so a set-returning function is walked. */
const PAGE_SIZE = 1000;

export const CONTACT_EMAILS_RPC = "list_broadcast_contact_emails";

export class BroadcastEmailSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BroadcastEmailSourceError";
  }
}

/**
 * PostgREST answers PGRST202 when the function is not in its schema cache, and
 * Postgres 42883 when it does not exist at all. Either means the migration has
 * not been applied, which is worth saying plainly rather than reporting as an
 * opaque database error.
 */
function missingFunction(error: { code?: string; message: string }) {
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function/i.test(error.message)
  );
}

export async function loadBroadcastContactEmails(admin: AdminClient) {
  const emails = new Map<string, string>();
  let from = 0;

  for (;;) {
    const { data, error } = await admin
      .rpc(CONTACT_EMAILS_RPC)
      .order("profile_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      // Loud rather than degraded. A sync that cannot read addresses must stop:
      // carrying on would push a truncated audience into the Resend segments
      // and then stamp them fresh, which is the one state the send path trusts.
      throw new BroadcastEmailSourceError(
        missingFunction(error)
          ? `Member addresses are unreadable: ${CONTACT_EMAILS_RPC} is missing. Apply supabase/migrations/20260903000001_broadcast_auth_emails.sql, then run the sync again.`
          : `Member addresses could not be read: ${error.message}`
      );
    }

    const rows = (data ?? []) as ContactEmailRow[];
    for (const row of rows) {
      if (row.email) emails.set(row.profile_id, row.email);
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (emails.size === 0) {
    // Every standing audience would be empty, every contact would be pushed to
    // Resend with no segments, and the run would then mark the segments fresh.
    // An account with no addressable members at all is not a state worth
    // proceeding from.
    throw new BroadcastEmailSourceError(
      `Member addresses came back empty. ${CONTACT_EMAILS_RPC} returned no rows, so the sync stopped rather than emptying every audience.`
    );
  }

  return emails;
}
