import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The acceptance condition for the post-page deduplication: one request for
 * /post/example-slug must not run one core post query for generateMetadata and
 * another identical one for the page.
 *
 * React's own `cache()` cannot be observed here directly. Vitest resolves
 * "react" to the client build, whose `cache` is a bare passthrough
 * (`return fn.apply(null, arguments)`); only the react-server build carries the
 * dispatcher that does the memoising, and Next.js installs that dispatcher per
 * server render. So `cache` is replaced below with a faithful stand-in that
 * memoises by argument the way the server build does. What that proves is the
 * part this module is responsible for: the database call sits INSIDE the cached
 * function rather than outside it, which is the mistake that would silently
 * reintroduce the duplicate.
 */

const cacheScopes: Array<Map<unknown, Map<string, unknown>>> = [];

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    cache: (fn: (...args: never[]) => unknown) => {
      return (...args: never[]) => {
        const scope = cacheScopes[cacheScopes.length - 1];
        if (!scope) return fn(...args);
        let perFn = scope.get(fn);
        if (!perFn) {
          perFn = new Map();
          scope.set(fn, perFn);
        }
        const key = JSON.stringify(args);
        if (!perFn.has(key)) perFn.set(key, fn(...args));
        return perFn.get(key);
      };
    },
  };
});

/** One server render. The scope has to outlive the awaits inside it, so this
 *  is async: popping in a synchronous finally would tear the scope down before
 *  a caller that awaits its first result ever reads it. */
async function withRenderScope<T>(run: () => T | Promise<T>): Promise<T> {
  cacheScopes.push(new Map());
  try {
    return await run();
  } finally {
    cacheScopes.pop();
  }
}

interface QueryLogEntry {
  table: string;
  select: string;
  filters: Array<[string, unknown, unknown?]>;
}

const queryLog: QueryLogEntry[] = [];
let nextRow: unknown = null;
let nextError: unknown = null;
let getUserCalls = 0;

function makeQueryBuilder(table: string) {
  const entry: QueryLogEntry = { table, select: "", filters: [] };
  const builder = {
    select(columns: string) {
      entry.select = columns;
      queryLog.push(entry);
      return builder;
    },
    eq(column: string, value: unknown) {
      entry.filters.push(["eq", column, value]);
      return builder;
    },
    in(column: string, value: unknown) {
      entry.filters.push(["in", column, value]);
      return builder;
    },
    async maybeSingle() {
      return { data: nextRow, error: nextError };
    },
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => makeQueryBuilder(table),
    auth: {
      getUser: async () => {
        getUserCalls += 1;
        return { data: { user: { id: "viewer-1" } }, error: null };
      },
    },
  }),
}));

vi.mock("server-only", () => ({}));

const { getPostBySlug, getPostAuthor, VISIBLE_POST_STATUSES } = await import(
  "@/lib/postBySlug"
);
// The PostgREST projection moved into the Supabase adapter when the query did.
// It is asserted on below because it is still what the production request
// sends, whichever module happens to own the string.
const { POST_CORE_SELECT } = await import("@/lib/db/supabase/posts");
const { getCurrentUser } = await import("@/lib/serverAuth");

beforeEach(() => {
  queryLog.length = 0;
  nextRow = { id: "post-1", slug: "example-slug", profiles: null };
  nextError = null;
  getUserCalls = 0;
});

describe("getPostBySlug", () => {
  it("runs one query when generateMetadata and the page ask for the same slug", async () => {
    const [fromMetadata, fromPage] = await withRenderScope(() =>
      Promise.all([getPostBySlug("example-slug"), getPostBySlug("example-slug")])
    );

    const postQueries = queryLog.filter((entry) => entry.table === "posts");
    expect(postQueries).toHaveLength(1);
    // Same object, not merely an equal one: both callers read one row.
    expect(fromMetadata).toBe(fromPage);
  });

  it("still runs one query when the second caller asks after the first resolved", async () => {
    await withRenderScope(async () => {
      await getPostBySlug("example-slug");
      await getPostBySlug("example-slug");
    });

    expect(queryLog.filter((entry) => entry.table === "posts")).toHaveLength(1);
  });

  it("does not confuse two different slugs", async () => {
    await withRenderScope(async () => {
      await getPostBySlug("first-slug");
      await getPostBySlug("second-slug");
    });

    const postQueries = queryLog.filter((entry) => entry.table === "posts");
    expect(postQueries).toHaveLength(2);
    expect(postQueries[0].filters).toContainEqual(["eq", "slug", "first-slug"]);
    expect(postQueries[1].filters).toContainEqual(["eq", "slug", "second-slug"]);
  });

  it("does not leak one render's row into the next render", async () => {
    await withRenderScope(() => getPostBySlug("example-slug"));
    await withRenderScope(() => getPostBySlug("example-slug"));

    // Two renders, two queries. The memo is per render, never a shared cache.
    expect(queryLog.filter((entry) => entry.table === "posts")).toHaveLength(2);
  });

  it("queries only the posts table by slug and visible status", async () => {
    await withRenderScope(() => getPostBySlug("example-slug"));

    const [query] = queryLog;
    expect(query.table).toBe("posts");
    expect(query.filters).toContainEqual(["eq", "slug", "example-slug"]);
    expect(query.filters).toContainEqual([
      "in",
      "status",
      ["published", "pending", "pending_revision", "draft"],
    ]);
    expect(VISIBLE_POST_STATUSES).not.toContain("rejected");
  });

  it("selects no viewer-specific columns, so the shared row is safe to reuse", () => {
    // The memo is shared for the whole render. Anything viewer-dependent would
    // therefore be shared too, so it must not be in this select at all.
    for (const forbidden of [
      "likes",
      "bookmarks",
      "follows",
      "author_subscriptions",
      "user_id",
      "viewer",
    ]) {
      expect(POST_CORE_SELECT).not.toContain(forbidden);
    }
  });

  it("returns null for a slug that resolves to nothing", async () => {
    nextRow = null;
    const post = await withRenderScope(() => getPostBySlug("missing"));
    expect(post).toBeNull();
  });

  it("raises a named failure rather than returning a half-loaded page", async () => {
    nextError = { message: "canceling statement due to statement timeout" };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      withRenderScope(() => getPostBySlug("example-slug"))
    ).rejects.toThrow('Failed to load post "example-slug".');
    expect(error).toHaveBeenCalledWith(
      "[post/example-slug] core post query failed",
      nextError
    );

    error.mockRestore();
  });
});

describe("getPostAuthor", () => {
  it("normalises the embedded profile whichever shape PostgREST returns", () => {
    const profile = { id: "a", username: "ada" };
    expect(
      getPostAuthor({ profiles: profile } as never)
    ).toBe(profile);
    expect(
      getPostAuthor({ profiles: [profile] } as never)
    ).toBe(profile);
    expect(getPostAuthor({ profiles: null } as never)).toBeNull();
    expect(getPostAuthor({ profiles: [] } as never)).toBeNull();
  });
});

describe("getCurrentUser", () => {
  it("validates the session once per render, not once per caller", async () => {
    await withRenderScope(async () => {
      await Promise.all([getCurrentUser(), getCurrentUser()]);
      await getCurrentUser();
    });

    expect(getUserCalls).toBe(1);
  });

  it("does not carry a viewer across renders", async () => {
    await withRenderScope(() => getCurrentUser());
    await withRenderScope(() => getCurrentUser());

    expect(getUserCalls).toBe(2);
  });
});
