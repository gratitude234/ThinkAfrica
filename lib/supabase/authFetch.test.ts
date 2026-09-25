import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  JWKS_STALE_LIMIT_MS,
  forgetStoredSigningKeys,
  withAuthResilience,
} from "./authFetch";

const PROJECT = "https://project.supabase.co";
const JWKS_URL = `${PROJECT}/auth/v1/.well-known/jwks.json`;
const REFRESH_URL = `${PROJECT}/auth/v1/token?grant_type=refresh_token`;
const PASSWORD_URL = `${PROJECT}/auth/v1/token?grant_type=password`;
const KEYS = JSON.stringify({ keys: [{ kid: "key-1", kty: "EC" }] });

function json(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

function cloudflarePage(status: number) {
  return new Response("<!DOCTYPE html><title>supabase.co | Web server is down</title>", {
    status,
    headers: { "content-type": "text/html" },
  });
}

afterEach(() => {
  forgetStoredSigningKeys();
});

describe("withAuthResilience: the signing keys", () => {
  it("serves the last keys that answered when the endpoint times out", async () => {
    const base = vi
      .fn()
      .mockResolvedValueOnce(json(KEYS))
      .mockRejectedValueOnce(new Error("Supabase did not respond within 8000ms."));
    const resilient = withAuthResilience(base);

    await resilient(JWKS_URL, { method: "GET" });
    const response = await resilient(JWKS_URL, { method: "GET" });

    expect(base).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(JSON.parse(KEYS));
  });

  it("serves them when the endpoint answers with a Cloudflare error page", async () => {
    const base = vi.fn().mockResolvedValueOnce(json(KEYS)).mockResolvedValueOnce(cloudflarePage(521));
    const resilient = withAuthResilience(base);

    await resilient(JWKS_URL, { method: "GET" });
    const response = await resilient(JWKS_URL, { method: "GET" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(JSON.parse(KEYS));
  });

  it("asks the network first, so rotated keys replace the stored ones", async () => {
    const rotated = JSON.stringify({ keys: [{ kid: "key-2", kty: "EC" }] });
    const base = vi
      .fn()
      .mockResolvedValueOnce(json(KEYS))
      .mockResolvedValueOnce(json(rotated))
      .mockRejectedValueOnce(new Error("fetch failed"));
    const resilient = withAuthResilience(base);

    await resilient(JWKS_URL, { method: "GET" });
    expect(await (await resilient(JWKS_URL, { method: "GET" })).json()).toEqual(JSON.parse(rotated));
    expect(await (await resilient(JWKS_URL, { method: "GET" })).json()).toEqual(JSON.parse(rotated));
    expect(base).toHaveBeenCalledTimes(3);
  });

  it("stops waiting early for a fresh copy when it has one to fall back on", async () => {
    const base = vi
      .fn()
      .mockResolvedValueOnce(json(KEYS))
      .mockImplementationOnce(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          })
      );
    const resilient = withAuthResilience(base, { refetchDeadlineMs: 10 });

    await resilient(JWKS_URL, { method: "GET" });
    const response = await resilient(JWKS_URL, { method: "GET" });

    expect(await response.json()).toEqual(JSON.parse(KEYS));
  });

  it("does not stand in with keys older than the limit", async () => {
    let now = 1_000;
    const failure = new Error("fetch failed");
    const base = vi.fn().mockResolvedValueOnce(json(KEYS)).mockRejectedValueOnce(failure);
    const resilient = withAuthResilience(base, { now: () => now });

    await resilient(JWKS_URL, { method: "GET" });
    now += JWKS_STALE_LIMIT_MS + 1;

    await expect(resilient(JWKS_URL, { method: "GET" })).rejects.toBe(failure);
  });

  it("passes a failure through when there is nothing stored", async () => {
    const failure = new Error("fetch failed");
    const resilient = withAuthResilience(vi.fn().mockRejectedValue(failure));

    await expect(resilient(JWKS_URL, { method: "GET" })).rejects.toBe(failure);

    const unavailable = await withAuthResilience(vi.fn().mockResolvedValue(cloudflarePage(522)))(
      JWKS_URL,
      { method: "GET" }
    );
    expect(unavailable.status).toBe(522);
  });

  it("does not store an answer with no keys in it", async () => {
    const failure = new Error("fetch failed");
    const base = vi.fn().mockResolvedValueOnce(json(JSON.stringify({ keys: [] }))).mockRejectedValueOnce(failure);
    const resilient = withAuthResilience(base);

    await resilient(JWKS_URL, { method: "GET" });
    await expect(resilient(JWKS_URL, { method: "GET" })).rejects.toBe(failure);
  });
});

describe("withAuthResilience: token refresh", () => {
  it.each([500, 520, 521, 522, 525])(
    "presents a %i on a refresh as a retryable 503",
    async (status) => {
      const resilient = withAuthResilience(vi.fn().mockResolvedValue(cloudflarePage(status)));
      const response = await resilient(REFRESH_URL, { method: "POST" });
      expect(response.status).toBe(503);
    }
  );

  it("leaves an answer about the token itself alone", async () => {
    const refused = json(JSON.stringify({ code: "refresh_token_already_used" }), 400);
    const resilient = withAuthResilience(vi.fn().mockResolvedValue(refused));
    expect(await resilient(REFRESH_URL, { method: "POST" })).toBe(refused);
  });

  it("leaves a sign-in's own errors alone", async () => {
    const failed = json(JSON.stringify({ msg: "Database error" }), 500);
    const resilient = withAuthResilience(vi.fn().mockResolvedValue(failed));
    expect(await resilient(PASSWORD_URL, { method: "POST" })).toBe(failed);
  });

  it("passes every other request through untouched", async () => {
    const answer = json("[]", 500);
    const base = vi.fn().mockResolvedValue(answer);
    const resilient = withAuthResilience(base);
    const init = { method: "GET" };

    expect(await resilient(`${PROJECT}/rest/v1/posts?select=id`, init)).toBe(answer);
    expect(base).toHaveBeenCalledWith(`${PROJECT}/rest/v1/posts?select=id`, init);
  });
});

describe("withAuthResilience with supabase-js", () => {
  const STORAGE_KEY = "sb-project-auth-token";

  function expiredSession() {
    const past = Math.floor(Date.now() / 1000) - 60;
    return JSON.stringify({
      access_token: "expired.access.token",
      refresh_token: "refresh-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: past,
      user: { id: "user-1", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" },
    });
  }

  function clientWith(fetchImpl: typeof fetch) {
    const store = new Map<string, string>([[STORAGE_KEY, expiredSession()]]);
    const client = createClient(PROJECT, "anon-key", {
      auth: {
        storageKey: STORAGE_KEY,
        autoRefreshToken: false,
        persistSession: true,
        detectSessionInUrl: false,
        storage: {
          getItem: (key) => store.get(key) ?? null,
          setItem: (key, value) => void store.set(key, value),
          removeItem: (key) => void store.delete(key),
        },
      },
      global: { fetch: fetchImpl },
    });
    return { client, store };
  }

  it("keeps the session when a refresh meets a Cloudflare error page", async () => {
    const base = vi.fn().mockImplementation(async () => cloudflarePage(521));

    const unprotected = clientWith(base as unknown as typeof fetch);
    await unprotected.client.auth.getSession();
    expect(unprotected.store.has(STORAGE_KEY)).toBe(false);

    // supabase-js retries a retryable refresh with backoff for up to thirty
    // seconds before giving up on it.
    vi.useFakeTimers();
    try {
      const protectedClient = clientWith(withAuthResilience(base) as unknown as typeof fetch);
      const pending = protectedClient.client.auth.getSession();
      await vi.runAllTimersAsync();
      const { error } = await pending;
      expect(error?.name).toBe("AuthRetryableFetchError");
      expect(protectedClient.store.has(STORAGE_KEY)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
