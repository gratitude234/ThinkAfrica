import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SUPABASE_TIMEOUT_MS,
  SupabaseTimeoutError,
  resolveTimeoutMs,
  shouldApplyTimeout,
  withSupabaseTimeout,
} from "@/lib/supabase/fetchTimeout";

const REST = "https://project.supabase.co/rest/v1/posts?slug=eq.example";
const AUTH = "https://project.supabase.co/auth/v1/user";
const STORAGE =
  "https://project.supabase.co/storage/v1/object/public/covers/a.jpg";

/** A fetch that never answers, which is what the database looked like during
 *  the outages. */
function hangingFetch() {
  return vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal!.reason)
        );
      })
  );
}

describe("resolveTimeoutMs", () => {
  it("defaults to eight seconds", () => {
    expect(resolveTimeoutMs(undefined)).toBe(DEFAULT_SUPABASE_TIMEOUT_MS);
    expect(resolveTimeoutMs("")).toBe(DEFAULT_SUPABASE_TIMEOUT_MS);
    expect(resolveTimeoutMs("not a number")).toBe(DEFAULT_SUPABASE_TIMEOUT_MS);
    expect(resolveTimeoutMs("-1")).toBe(DEFAULT_SUPABASE_TIMEOUT_MS);
  });

  it("honours an explicit value, including the zero that disables it", () => {
    expect(resolveTimeoutMs("5000")).toBe(5000);
    expect(resolveTimeoutMs("0")).toBe(0);
  });
});

describe("shouldApplyTimeout", () => {
  it("covers PostgREST and Auth", () => {
    expect(shouldApplyTimeout(REST)).toBe(true);
    expect(shouldApplyTimeout(AUTH)).toBe(true);
    expect(shouldApplyTimeout(new URL(REST))).toBe(true);
  });

  it("leaves storage transfers alone", () => {
    // Manuscript PDFs and cover images legitimately take longer than a query.
    expect(shouldApplyTimeout(STORAGE)).toBe(false);
  });
});

describe("withSupabaseTimeout", () => {
  it("abandons a query that outlives the deadline", async () => {
    const base = hangingFetch();
    const timed = withSupabaseTimeout(base, 20);

    await expect(timed(REST)).rejects.toBeInstanceOf(SupabaseTimeoutError);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("does not retry", async () => {
    // A retry during connection exhaustion is a second connection, not a
    // second chance.
    const base = hangingFetch();
    const timed = withSupabaseTimeout(base, 20);

    await expect(timed(AUTH)).rejects.toBeInstanceOf(SupabaseTimeoutError);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("lets a storage transfer run past the deadline", async () => {
    const base = vi.fn(
      async () =>
        await new Promise<Response>((resolve) =>
          setTimeout(() => resolve(new Response("ok")), 40)
        )
    );
    const timed = withSupabaseTimeout(base as never, 10);

    await expect(timed(STORAGE)).resolves.toBeInstanceOf(Response);
    // No signal was attached at all, so nothing can cut the transfer short.
    expect(base.mock.calls[0][1]).toBeUndefined();
  });

  it("passes a fast response straight through", async () => {
    const response = new Response("{}");
    const base = vi.fn(async () => response);
    const timed = withSupabaseTimeout(base as never, 1000);

    await expect(timed(REST)).resolves.toBe(response);
  });

  it("keeps the caller's own abort as the caller's abort", async () => {
    const base = hangingFetch();
    const timed = withSupabaseTimeout(base, 5000);
    const controller = new AbortController();

    const pending = timed(REST, { signal: controller.signal });
    controller.abort(new Error("caller changed its mind"));

    await expect(pending).rejects.toThrow("caller changed its mind");
  });

  it("is a no-op when the deadline is disabled", () => {
    const base = hangingFetch();
    expect(withSupabaseTimeout(base, 0)).toBe(base);
  });
});
