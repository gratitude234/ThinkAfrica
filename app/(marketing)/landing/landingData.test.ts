import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The guards on the failure that broke a deployment.
 *
 * A Vercel build failed three times over because the landing page was
 * statically generated and its data fetch ran against production Supabase
 * during `next build`. Supabase was slow that minute, the admin client had no
 * deadline, and Next killed the page build at 60 seconds. An identical
 * redeploy two minutes later succeeded, which is what proves the code was
 * never the problem: the deployment process depended on a third party being
 * fast.
 *
 * Four properties are asserted here, one per way that could come back.
 */

vi.mock("server-only", () => ({}));

const unstableCache = vi.hoisted(() =>
  vi.fn((fn: (...args: never[]) => unknown) => fn)
);
vi.mock("next/cache", () => ({ unstable_cache: unstableCache }));

const createAdminClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));

const createServerClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createClient: createServerClient }));

const getPublicTopicCounts = vi.hoisted(() => vi.fn());
vi.mock("@/lib/discoverData", () => ({ getPublicTopicCounts }));

const {
  EMPTY_LANDING_DATA,
  TOPICS_DISPLAY_LIMIT,
  describeLandingFailure,
  fetchLandingData,
  loadLandingData,
} = await import("./landingData");

/** A query builder whose every method returns itself and whose terminal
 *  resolves to one canned answer. Enough to exercise the shape. */
function stubClient(answer: {
  data?: unknown;
  count?: number;
  error?: unknown;
}) {
  const chain: Record<string, unknown> = {
    then: (ok: unknown, err: unknown) =>
      Promise.resolve({ data: null, count: 0, error: null, ...answer }).then(
        ok as never,
        err as never
      ),
  };
  for (const method of ["select", "eq", "neq", "order", "limit"]) {
    chain[method] = () => chain;
  }
  return { from: () => chain } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  getPublicTopicCounts.mockResolvedValue([]);
  createAdminClient.mockReturnValue(stubClient({ data: [], count: 0 }));
});

describe("the build must not depend on Supabase", () => {
  const page = readFileSync(
    resolve(process.cwd(), "app/(marketing)/landing/page.tsx"),
    "utf8"
  );

  it("renders the landing page at request time, not at build time", () => {
    // The whole fix. Static generation is what put a Supabase round trip
    // inside `next build`, where a slow response is a failed deployment
    // rather than a slow page.
    expect(page).toMatch(/export const dynamic = "force-dynamic"/);
  });

  it("does not also declare a static revalidate, which would contradict it", () => {
    expect(page).not.toMatch(/export const revalidate/);
  });

  it("keeps the data cache, so a dynamic page is not four round trips a visit", () => {
    // Dynamic rendering without the Data Cache would fix the build by making
    // every visitor pay for it. The cache is the other half of the fix.
    const data = readFileSync(
      resolve(process.cwd(), "app/(marketing)/landing/landingData.ts"),
      "utf8"
    );
    expect(data).toContain("unstable_cache");
    expect(data).toContain("revalidate: 300");
  });

  it("issues no query from the page module itself", () => {
    // If a query comes back into page.tsx it is a static-generation candidate
    // again, whatever the dynamic export says about the rest of the page.
    expect(page).not.toContain('.from("posts")');
    expect(page).not.toContain('.from("profiles")');
    expect(page).not.toContain("createAdminClient");
  });
});

describe("the admin client is timeout-bounded", () => {
  // Read rather than executed, because constructing the real client needs a
  // URL and a service key, and what matters is that the wrapper is wired in
  // at all. Its behaviour is covered by lib/supabase/fetchTimeout.test.ts.
  const admin = readFileSync(
    resolve(process.cwd(), "lib/supabase/admin.ts"),
    "utf8"
  );

  it("uses the same deadline wrapper as the request-scoped client", () => {
    expect(admin).toContain("withSupabaseTimeout");
    expect(admin).toMatch(/global:\s*\{\s*fetch:\s*withSupabaseTimeout\(\)/);
  });

  it("does not exempt itself with a longer deadline of its own", () => {
    // A per-call-site timeout is how the deadline drifts apart. There is one
    // number and it lives in fetchTimeout.ts.
    expect(admin).not.toMatch(/withSupabaseTimeout\([^)]+\)/);
  });

  it("leaves storage alone by construction rather than by remembering to", () => {
    const timeout = readFileSync(
      resolve(process.cwd(), "lib/supabase/fetchTimeout.ts"),
      "utf8"
    );
    // The wrapper matches only PostgREST and Auth paths, so a storage upload
    // through the admin client is untouched without the caller doing anything.
    expect(timeout).toContain('"/rest/v1/"');
    expect(timeout).toContain('"/auth/v1/"');
    expect(timeout).not.toContain('"/storage/v1/"');
  });
});

describe("loadLandingData never rejects", () => {
  it("returns the fallback when the query throws", async () => {
    createAdminClient.mockImplementation(() => {
      throw new Error("connection timed out");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(loadLandingData()).resolves.toEqual(EMPTY_LANDING_DATA);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it("returns the fallback when Supabase times out", async () => {
    getPublicTopicCounts.mockRejectedValue(
      new Error("Supabase did not respond within 8000ms.")
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(loadLandingData()).resolves.toEqual(EMPTY_LANDING_DATA);
    error.mockRestore();
  });

  it("produces a fallback the page can render", async () => {
    // Empty, not absent. Every field the page destructures has to exist, or
    // the fallback trades a slow page for a crashed one.
    expect(Object.keys(EMPTY_LANDING_DATA).sort()).toEqual([
      "postCount",
      "postsRaw",
      "topics",
      "userCount",
    ]);
    expect(Array.isArray(EMPTY_LANDING_DATA.postsRaw)).toBe(true);
    expect(Array.isArray(EMPTY_LANDING_DATA.topics)).toBe(true);
    expect(typeof EMPTY_LANDING_DATA.postCount).toBe("number");
    expect(typeof EMPTY_LANDING_DATA.userCount).toBe("number");
  });

  it("hands back a fallback nobody can mutate for everyone else", () => {
    expect(Object.isFrozen(EMPTY_LANDING_DATA)).toBe(true);
  });

  it("returns real data when the query succeeds", async () => {
    getPublicTopicCounts.mockResolvedValue([
      { tag: "africa", count: 3 },
      { tag: "policy", count: 9 },
    ]);
    createAdminClient.mockReturnValue(stubClient({ data: [], count: 42 }));

    const data = await loadLandingData();
    expect(data.postCount).toBe(42);
    expect(data.topics[0]).toEqual({ tag: "policy", count: 9 });
  });

  it("caps the topic strip", async () => {
    getPublicTopicCounts.mockResolvedValue(
      Array.from({ length: 40 }, (_, index) => ({
        tag: `t${index}`,
        count: 40 - index,
      }))
    );

    const data = await fetchLandingData(stubClient({ data: [], count: 0 }));
    expect(data.topics).toHaveLength(TOPICS_DISPLAY_LIMIT);
  });
});

describe("what reaches the visitor and the log", () => {
  it("bounds the logged message", () => {
    // A gateway in front of Postgres answers with a whole HTML error page.
    // Unbounded, that is kilobytes per request during an outage, in the log
    // that is least readable and most needed.
    const long = describeLandingFailure(new Error("x".repeat(5000)));
    expect(long.length).toBeLessThan(260);
    expect(long).toContain("truncated");
  });

  it("keeps the message useful rather than generic", () => {
    expect(describeLandingFailure(new Error("connection timed out"))).toContain(
      "connection timed out"
    );
    expect(describeLandingFailure(new Error("boom"))).toContain("Error");
  });

  it("survives a thrown non-Error", () => {
    expect(describeLandingFailure("just a string")).toBe("just a string");
    expect(() => describeLandingFailure(undefined)).not.toThrow();
  });

  it("puts no database detail on the page", async () => {
    // The fallback carries no error field at all, so there is nothing for the
    // page to render even by accident.
    createAdminClient.mockImplementation(() => {
      throw new Error('relation "posts" does not exist');
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const data = await loadLandingData();
    expect(JSON.stringify(data)).not.toContain("relation");
    expect(JSON.stringify(data)).not.toContain("does not exist");
    error.mockRestore();
  });
});

describe("no secret reaches the browser", () => {
  it("keeps the landing data module server-only", () => {
    const data = readFileSync(
      resolve(process.cwd(), "app/(marketing)/landing/landingData.ts"),
      "utf8"
    );
    // It reads SUPABASE_SERVICE_ROLE_KEY. The import is what makes a client
    // component importing it a build error rather than a leaked key.
    expect(data).toMatch(/^import "server-only";/m);
  });

  it("keeps the admin client server-only", () => {
    const admin = readFileSync(
      resolve(process.cwd(), "lib/supabase/admin.ts"),
      "utf8"
    );
    expect(admin).toMatch(/^import "server-only";/m);
  });

  it("names no service-role key in a client component on this page", () => {
    for (const file of [
      "app/(marketing)/landing/page.tsx",
      "app/(marketing)/landing/LandingNav.tsx",
      "app/(marketing)/landing/LandingAnimations.tsx",
      "app/(marketing)/landing/LandingTrackedLink.tsx",
    ]) {
      const text = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(text, `${file} must not name the service-role key`).not.toContain(
        "SUPABASE_SERVICE_ROLE_KEY"
      );
    }
  });
});
