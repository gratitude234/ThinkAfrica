/**
 * Two ways an unhealthy Supabase turned into a sign-out, closed at the fetch
 * every Supabase client shares.
 *
 * The signing keys. getClaims() checks an access token locally, but first
 * needs the project's public keys from /auth/v1/.well-known/jwks.json.
 * supabase-js keeps them for ten minutes per module copy (the proxy and the
 * page bundles each have their own), then asks again, and an answer that does
 * not come fails the check of a token that is perfectly valid. So the last
 * keys that answered are kept here and served when the endpoint does not
 * answer, for up to six hours. The network is always asked first, so a key
 * rotation is picked up as soon as Auth can report it.
 *
 * Refresh failures. supabase-js retries only 502, 503 and 504. Any other 5xx
 * on a token refresh is taken as final, and supabase-js then deletes the
 * session cookies. That covers Cloudflare's 520 to 527 pages when the project
 * is unreachable and GoTrue's own 500s while its database is down. A refresh
 * that failed on the server's side says nothing about the refresh token, so
 * those answers are presented as 503 and the session is kept for the next
 * attempt.
 *
 * Every other request passes through untouched.
 */

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const JWKS_PATH = "/auth/v1/.well-known/jwks.json";
const TOKEN_PATH = "/auth/v1/token";
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

/** How long a copy of the keys may stand in for an Auth server that does not answer. */
export const JWKS_STALE_LIMIT_MS = 6 * 60 * 60 * 1000;

/** With a copy in hand, how long to wait for a fresh one before using the copy. */
export const JWKS_REFETCH_DEADLINE_MS = 2000;

interface StoredKeys {
  body: string;
  storedAt: number;
}

interface AuthFetchOptions {
  now: () => number;
  refetchDeadlineMs: number;
}

const storedKeys = new Map<string, StoredKeys>();

/** Test isolation only. */
export function forgetStoredSigningKeys() {
  storedKeys.clear();
}

function requestUrl(input: RequestInfo | URL): URL | null {
  const href =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : typeof (input as Request).url === "string"
          ? (input as Request).url
          : "";
  if (!href) return null;
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const fromRequest =
    typeof input === "object" && !(input instanceof URL)
      ? (input as Request).method
      : undefined;
  return (init?.method ?? fromRequest ?? "GET").toUpperCase();
}

function hasKeys(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as { keys?: unknown };
    return Array.isArray(parsed.keys) && parsed.keys.length > 0;
  } catch {
    return false;
  }
}

function keysResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function withDeadline(signal: AbortSignal | null | undefined, ms: number): AbortSignal {
  const deadline = AbortSignal.timeout(ms);
  if (!signal) return deadline;
  return typeof AbortSignal.any === "function" ? AbortSignal.any([signal, deadline]) : signal;
}

async function fetchSigningKeys(
  baseFetch: FetchLike,
  url: URL,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options: AuthFetchOptions
): Promise<Response> {
  const stored = storedKeys.get(url.href);
  const fallback =
    stored && options.now() - stored.storedAt <= JWKS_STALE_LIMIT_MS ? stored : null;

  try {
    const response = await baseFetch(
      input,
      fallback
        ? { ...init, signal: withDeadline(init?.signal, options.refetchDeadlineMs) }
        : init
    );
    if (!response.ok) return fallback ? keysResponse(fallback.body) : response;

    const body = await response.text();
    if (hasKeys(body)) storedKeys.set(url.href, { body, storedAt: options.now() });
    return keysResponse(body);
  } catch (error) {
    // A caller that gave up does not want an answer, stored or otherwise.
    if (!fallback || init?.signal?.aborted) throw error;
    return keysResponse(fallback.body);
  }
}

function isRefreshGrant(url: URL, method: string): boolean {
  return (
    method === "POST" &&
    url.pathname.endsWith(TOKEN_PATH) &&
    url.searchParams.get("grant_type") === "refresh_token"
  );
}

export function withAuthResilience(
  baseFetch: FetchLike = (input, init) => fetch(input, init),
  { now = Date.now, refetchDeadlineMs = JWKS_REFETCH_DEADLINE_MS }: Partial<AuthFetchOptions> = {}
): FetchLike {
  const options: AuthFetchOptions = { now, refetchDeadlineMs };

  return async function resilientFetch(input, init) {
    const url = requestUrl(input);
    if (!url) return baseFetch(input, init);

    const method = requestMethod(input, init);
    if (method === "GET" && url.pathname.endsWith(JWKS_PATH)) {
      return fetchSigningKeys(baseFetch, url, input, init, options);
    }

    const response = await baseFetch(input, init);
    if (
      isRefreshGrant(url, method) &&
      response.status >= 500 &&
      !RETRYABLE_STATUSES.has(response.status)
    ) {
      return new Response(response.body, {
        status: 503,
        statusText: "Service Unavailable",
        headers: response.headers,
      });
    }
    return response;
  };
}
