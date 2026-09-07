import "server-only";

/**
 * A fixed-window counter held in the process that is serving the request.
 *
 * What this is honestly worth: a serverless deployment runs many instances, so
 * a caller spread across enough cold starts sees a limit of N per instance
 * rather than N overall. That makes this a cheap first line and not a
 * guarantee, and anything that needs a guarantee has to count somewhere
 * shared. It is used here because the alternative available today is a
 * database round trip on every request, and the alternative available
 * tomorrow (Cloudflare, a Durable Object or KV) does not exist yet.
 *
 * So it is paired, not relied on: `app/api/partner-contact/route.ts` puts this
 * in front and a durable count behind it. This one stops a single client
 * hammering one instance without touching the database at all; the durable one
 * is what actually bounds the damage.
 *
 * No timers. Entries are evicted when they are next looked at, and a sweep
 * runs when the map grows past a ceiling, so an idle process holds nothing
 * open and nothing keeps the event loop alive.
 */

interface Window {
  count: number;
  /** Epoch ms at which this window stops counting. */
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Past this many distinct keys, evict everything expired. Bounds memory for a
 *  process that has seen a lot of unique callers. */
const SWEEP_THRESHOLD = 5000;

export interface RateLimitDecision {
  allowed: boolean;
  /** Requests still available in the current window. */
  remaining: number;
  /** Seconds until the window resets. Suitable for a Retry-After header. */
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
  now: number = Date.now()
): RateLimitDecision {
  if (windows.size > SWEEP_THRESHOLD) {
    for (const [existing, window] of windows) {
      if (window.resetAt <= now) windows.delete(existing);
    }
  }

  const current = windows.get(key);

  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + options.windowMs });
    return {
      allowed: true,
      remaining: options.limit - 1,
      retryAfterSeconds: Math.ceil(options.windowMs / 1000),
    };
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));

  if (current.count >= options.limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: options.limit - current.count,
    retryAfterSeconds,
  };
}

/** Test seam. Nothing in the application calls this. */
export function resetRateLimits() {
  windows.clear();
}

/**
 * The caller's address, as far as it can be known.
 *
 * `x-forwarded-for` is a list appended to by each proxy, so the client-facing
 * entry is the first one. It is trivially forgeable by the client itself, and
 * on Vercel the platform overwrites it, which is why this is a rate-limit key
 * and never an authorization input.
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
