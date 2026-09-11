/**
 * The migration write freeze.
 *
 * Phase 5 of the Neon cutover needs Supabase to stop receiving new application
 * data while the final copy runs. A copy taken from a moving database is
 * internally consistent and missing whatever arrived mid-run, and the drift
 * check that follows then compares against a source that has moved again and
 * reports a difference that looks like a copy bug. So the freeze is not a
 * courtesy to the copy, it is a precondition of being able to verify it.
 *
 * ## Why the middleware, and not the repositories
 *
 * The obvious place is `requireViewer()`, and it is the wrong one: 47 files
 * declare server actions and only 6 call it, so most writes resolve identity
 * some other way and would sail straight through. Gating each of the 59 files
 * that write would mean 59 chances to miss one, and a freeze with a hole in it
 * is worse than no freeze, because the copy is taken believing it held.
 *
 * Every mutation in this application arrives over HTTP as a non-GET request: a
 * server action is a POST, and so is every route handler that writes. The
 * middleware sees all of them, matches every path except static assets, and is
 * one file. That makes the freeze auditable by reading a single function
 * rather than by trusting a survey.
 *
 * ## What stays open, and why
 *
 * Reading. The product stays fully browsable during the freeze, which is the
 * point of freezing writes rather than taking the site down.
 *
 * Authentication, because a member who is signed in should stay signed in and
 * because sign-in writes a session rather than application data. Sessions are
 * not carried across the cutover in either direction, so nothing here depends
 * on them surviving. Auth is migrated separately in Phase 9, under its own
 * freeze if it needs one.
 *
 * ## What this deliberately does not do
 *
 * It does not pretend to stop a write issued outside the request path. A
 * Supabase Cron job, a webhook processed out of band, or somebody running SQL
 * by hand is not an HTTP request to this application and is not affected.
 * Those have to be paused where they live, and `freeze-check.mjs` is what
 * proves the result rather than this flag.
 */

/** Methods that cannot change anything, so they are never refused. */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Paths that keep accepting writes while frozen.
 *
 * Short on purpose. Every entry is a hole, so each one needs a reason that
 * survives the question "what would be lost if this wrote during the copy".
 */
const EXEMPT_PREFIXES = [
  // Sessions, not application data. Nothing here is copied to Neon.
  "/api/auth",
  "/auth",
  "/login",
  "/signup",
  "/logout",
];

export function isWriteFrozen(
  raw: string | undefined = process.env.MIGRATION_WRITE_FREEZE
): boolean {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "" || value === "0" || value === "false") return false;
  if (value === "1" || value === "true") return true;
  // An unrecognised value is not a decision to keep writing. A typo during a
  // cutover must not be the reason the final copy was taken from a moving
  // database.
  throw new Error(
    `MIGRATION_WRITE_FREEZE must be "1"/"true" or "0"/"false". Received "${raw}".`
  );
}

export function isFreezeExempt(pathname: string): boolean {
  return EXEMPT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Should this request be refused?
 *
 * Takes the method and path rather than a request object so it can be tested
 * without constructing one, and so the middleware's own logic stays readable.
 */
export function shouldRefuseWrite(
  method: string,
  pathname: string,
  frozen: boolean = isWriteFrozen()
): boolean {
  if (!frozen) return false;
  if (READ_METHODS.has(method.toUpperCase())) return false;
  return !isFreezeExempt(pathname);
}

/** What a refused write is told. 503 with Retry-After, so clients and crawlers
 *  treat it as temporary rather than as the endpoint having gone away. */
export const FREEZE_RESPONSE = {
  status: 503,
  body: {
    error: "write_frozen",
    message:
      "Indegenius is read-only for a few minutes while we move to new database infrastructure. Nothing has been lost. Please try again shortly.",
  },
  headers: {
    "Retry-After": "600",
    "Cache-Control": "no-store",
  },
} as const;
