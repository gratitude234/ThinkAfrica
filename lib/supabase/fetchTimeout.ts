/**
 * A deadline on every PostgREST and Auth call a request makes.
 *
 * When Postgres stops answering, a Supabase call does not fail. It waits. The
 * Vercel function waits with it, holds its connection, and is eventually killed
 * at the platform's 300-second ceiling, having produced nothing at all. That is
 * the worst possible shape for an outage: maximum resource consumption, zero
 * information, and a reader staring at a blank tab for five minutes.
 *
 * So the boundary gets a deadline. A post that cannot be read in eight seconds
 * is not going to be read; failing there turns a five-minute hang into a fast
 * 500 that the error boundary can render and the logs can explain.
 *
 * Two deliberate restrictions:
 *
 *   - Storage is exempt. `/storage/v1/` moves manuscript PDFs and cover images,
 *     where a multi-second transfer is normal and a deadline would break
 *     uploads that were never part of the problem.
 *   - There is no retry. During connection exhaustion a retry is not a second
 *     chance, it is a second connection, and every client retrying at once is
 *     how a slow database becomes an unreachable one.
 */

/** Applies to PostgREST and Auth. Everything else, storage included, is
 *  passed through untouched. */
const DEADLINE_PATH_PREFIXES = ["/rest/v1/", "/auth/v1/"];

export const DEFAULT_SUPABASE_TIMEOUT_MS = 8000;

/** `SUPABASE_SERVER_TIMEOUT_MS=0` disables the deadline entirely, for the rare
 *  case where an operation legitimately needs longer than the ceiling. */
export function resolveTimeoutMs(
  raw: string | undefined = process.env.SUPABASE_SERVER_TIMEOUT_MS
): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_SUPABASE_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_SUPABASE_TIMEOUT_MS;
  return parsed;
}

export function shouldApplyTimeout(input: RequestInfo | URL): boolean {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : typeof (input as Request).url === "string"
          ? (input as Request).url
          : "";

  if (!url) return false;

  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }

  return DEADLINE_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export class SupabaseTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(
      `Supabase did not respond within ${timeoutMs}ms. The request was abandoned rather than held open.`
    );
    this.name = "SupabaseTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

/**
 * Wraps a fetch implementation so PostgREST and Auth calls carry an abort
 * deadline. A caller's own `signal` is preserved: whichever fires first wins.
 */
export function withSupabaseTimeout(
  baseFetch: FetchLike = (input, init) => fetch(input, init),
  timeoutMs: number = resolveTimeoutMs()
): FetchLike {
  if (timeoutMs <= 0) return baseFetch;

  return async function timedFetch(input, init) {
    if (!shouldApplyTimeout(input)) {
      return baseFetch(input, init);
    }

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const callerSignal = init?.signal ?? undefined;
    const signal =
      callerSignal && typeof AbortSignal.any === "function"
        ? AbortSignal.any([callerSignal, timeoutSignal])
        : (callerSignal ?? timeoutSignal);

    try {
      return await baseFetch(input, { ...init, signal });
    } catch (error) {
      // Only the deadline is rewritten. A caller-initiated abort, and any
      // other network failure, is re-thrown exactly as it arrived.
      if (timeoutSignal.aborted && !(callerSignal?.aborted ?? false)) {
        throw new SupabaseTimeoutError(timeoutMs);
      }
      throw error;
    }
  };
}
