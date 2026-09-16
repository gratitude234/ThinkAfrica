import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The loaders resolve the viewer, because the profiles policy that PostgREST
 * applied from the session has to be carried explicitly on a direct
 * connection. `getCurrentUser` reads cookies, which a unit test has no request
 * context for, so it is stubbed as the logged-out reader unless a test says
 * otherwise.
 */
const currentUser = vi.hoisted(() => ({ value: null as { id: string } | null }));
vi.mock("@/lib/serverAuth", () => ({
  getCurrentUser: async () => currentUser.value,
}));

/**
 * The identity read is behind lib/db, so it does not travel through the
 * Supabase client stubbed below. The row it returns is set per test here; the
 * null-versus-error distinction the query itself preserves is tested against
 * the adapter, in lib/db/supabase/profiles.test.ts.
 */
const findIdentityByUsername = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({ profiles: { findIdentityByUsername } }),
}));

import {
  loadProfileDrafts,
  loadProfileIdentity,
  loadProfilePublications,
  loadProfileView,
  loadProfileViewerContext,
} from "./profileViewData";

type StubResult = {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number;
};

type Routes = Record<string, StubResult>;

/**
 * A Supabase stand-in shaped like the query builder rather than like a
 * database: every chain method returns the chain, and the terminal call
 * resolves to whatever the route for that table says. Enough to assert which
 * tables a loader touches and how it treats an error.
 */
function makeClient({ routes = {} }: { routes?: Routes } = {}) {
  const tables: string[] = [];
  const rpcNames: string[] = [];
  /** Every table call with its equality filters, so a test can tell a drafts
   *  query from a publications query on the same table. */
  const queries: Array<{ table: string; eq: Array<[string, unknown]> }> = [];

  const chainFor = (table: string) => {
    const query = { table, eq: [] as Array<[string, unknown]> };
    queries.push(query);
    const resolve = () => {
      const route = routes[table] ?? { data: null, error: null };
      return Promise.resolve({ data: null, error: null, count: 0, ...route });
    };
    const chain: Record<string, unknown> = {
      maybeSingle: resolve,
      single: resolve,
      then: (onOk: unknown, onErr: unknown) =>
        resolve().then(onOk as never, onErr as never),
    };
    for (const method of ["select", "neq", "in", "or", "not", "order", "limit", "range"]) {
      chain[method] = () => chain;
    }
    chain.eq = (column: string, value: unknown) => {
      query.eq.push([column, value]);
      return chain;
    };
    return chain;
  };

  return {
    tables,
    rpcNames,
    queries,
    client: {
      from(table: string) {
        tables.push(table);
        return chainFor(table);
      },
      rpc(name: string) {
        rpcNames.push(name);
        return Promise.resolve({ data: null, error: null });
      },
    } as never,
  };
}

const PROFILE_ROW = {
  id: "author-1",
  username: "student1",
  full_name: "A Student",
  bio: null,
  avatar_url: null,
  professional_title: null,
  country: "Nigeria",
  university: "University of Lagos",
  field_of_study: "Political Science",
  graduation_year: 2028,
  interests: null,
  verified: false,
  verified_type: null,
  created_at: "2026-01-05T09:30:00+00:00",
};

function row(overrides: Record<string, unknown>) {
  return {
    id: "row",
    author_id: "author-1",
    title: "A title",
    slug: "a-title",
    excerpt: null,
    content_kind: "post",
    created_at: "2026-01-01T00:00:00Z",
    published_at: "2026-01-01T00:00:00Z",
    cover_image_url: null,
    ...overrides,
  };
}

beforeEach(() => {
  currentUser.value = null;
  findIdentityByUsername.mockReset();
  findIdentityByUsername.mockResolvedValue(null);
  vi.unstubAllEnvs();
});

describe("loadProfileIdentity: delegation to the database boundary", () => {
  it("forwards the username and returns what the repository answered", async () => {
    const { client } = makeClient();
    findIdentityByUsername.mockResolvedValue(PROFILE_ROW);

    await expect(loadProfileIdentity(client, "student1")).resolves.toEqual(PROFILE_ROW);
    // The viewer travels with the username: the profiles policy decides whether
    // this profile is found at all, and null is the logged-out reader.
    expect(findIdentityByUsername).toHaveBeenCalledWith("student1", null);
  });

  it("returns null when the repository found nothing", async () => {
    const { client } = makeClient();
    await expect(loadProfileIdentity(client, "nobody")).resolves.toBeNull();
  });

  it("propagates a failure rather than reporting an absence", async () => {
    const { client } = makeClient();
    findIdentityByUsername.mockRejectedValue(new Error('Failed to load profile "student1".'));

    await expect(loadProfileIdentity(client, "student1")).rejects.toThrow(
      /Failed to load profile/
    );
  });

  it("does not touch the Supabase client it is still handed", async () => {
    const { client, tables } = makeClient();
    await loadProfileIdentity(client, "student1");
    expect(tables).toHaveLength(0);
  });
});

describe("loadProfileView: not-found versus failure", () => {
  it("returns null for a username that does not exist", async () => {
    const { client } = makeClient();
    await expect(loadProfileView({ supabase: client, username: "nobody" })).resolves.toBeNull();
  });

  it("propagates a query failure instead of reporting an absence", async () => {
    const { client } = makeClient();
    findIdentityByUsername.mockRejectedValue(new Error('Failed to load profile "student1".'));

    await expect(loadProfileView({ supabase: client, username: "student1" })).rejects.toThrow();
  });

  it("throws when a relationship count fails rather than printing zero", async () => {
    findIdentityByUsername.mockResolvedValue(PROFILE_ROW);
    const { client } = makeClient({
      routes: { follows: { data: null, error: { message: "statement timeout" }, count: 0 } },
    });

    await expect(
      loadProfileView({ supabase: client, username: "student1", tab: "about" })
    ).rejects.toThrow(/count failed/);
  });
});

describe("loadProfileViewerContext", () => {
  it("asks nothing about a relationship the viewer cannot have", async () => {
    const { client, tables } = makeClient({
      routes: { follows: { count: 4, data: null, error: null } },
    });

    const viewer = await loadProfileViewerContext({
      supabase: client,
      profileId: "author-1",
      viewerId: null,
    });

    expect(viewer.isOwnProfile).toBe(false);
    expect(viewer.followerCount).toBe(4);
    expect(tables).not.toContain("author_subscriptions");
    expect(tables).not.toContain("user_blocks");
  });

  it("does not offer the owner a relationship with themselves", async () => {
    const { client, tables } = makeClient({
      routes: { follows: { count: 9, data: null, error: null } },
    });

    const viewer = await loadProfileViewerContext({
      supabase: client,
      profileId: "author-1",
      viewerId: "author-1",
    });

    expect(viewer.isOwnProfile).toBe(true);
    expect(viewer.isFollowing).toBe(false);
    expect(tables).not.toContain("user_blocks");
  });
});

describe("Posts and Articles", () => {
  it("files legacy Essays, Policy Briefs and Research as Articles, like any other Article", async () => {
    const { client } = makeClient({
      routes: {
        posts: {
          // What a legacy Policy Brief and a legacy Research paper carry
          // after 20260915000005: content_kind "article", like any other.
          data: [
            row({ id: "own-article", content_kind: "article" }),
            row({ id: "legacy-brief", content_kind: "article", published_at: "2025-12-01T00:00:00Z" }),
            row({ id: "legacy-research", content_kind: "article", published_at: "2025-11-01T00:00:00Z" }),
          ],
          error: null,
        },
      },
    });

    const page = await loadProfilePublications({
      supabase: client,
      profileId: "author-1",
      kind: "article",
    });

    expect(page.items.map((item) => item.id)).toEqual([
      "own-article",
      "legacy-brief",
      "legacy-research",
    ]);
    expect(page.items.every((item) => item.kind === "article")).toBe(true);
  });

  it("lists only work the writer primarily authored, and reads no co-author credits", async () => {
    const { client, tables } = makeClient({
      routes: {
        posts: { data: [row({ id: "own-post" })], error: null },
        // A credit on somebody else's publication. Co-authoring is retired,
        // so nothing on the profile asks for these any more.
        post_authors: {
          data: [{ posts: row({ id: "credited-post", author_id: "someone-else", status: "published" }) }],
          error: null,
        },
      },
    });

    const page = await loadProfilePublications({
      supabase: client,
      profileId: "author-1",
      kind: "post",
    });

    expect(page.items.map((item) => item.id)).toEqual(["own-post"]);
    expect(page.items.every((item) => item.isCoAuthor === false)).toBe(true);
    expect(tables).not.toContain("post_authors");
  });

  it("lists a legacy Response as an ordinary publication of its own content kind", async () => {
    const { client } = makeClient({
      routes: {
        posts: {
          data: [row({ id: "response-post", content_kind: "post", in_response_to: "original" })],
          error: null,
        },
      },
    });

    const posts = await loadProfilePublications({ supabase: client, profileId: "author-1", kind: "post" });
    expect(posts.items.map((item) => item.id)).toEqual(["response-post"]);
    expect(posts.items[0]?.kind).toBe("post");
  });

  it("reports a further page without counting the whole table", async () => {
    const many = Array.from({ length: 21 }, (_, index) =>
      row({
        id: `post-${index}`,
        created_at: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
        published_at: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
      })
    );
    const { client } = makeClient({ routes: { posts: { data: many, error: null } } });

    const page = await loadProfilePublications({
      supabase: client,
      profileId: "author-1",
      kind: "post",
      pageSize: 20,
    });

    expect(page.items).toHaveLength(20);
    expect(page.hasNextPage).toBe(true);
    expect(page.hasPreviousPage).toBe(false);
  });

  it("throws rather than returning a short list when the query fails", async () => {
    const { client } = makeClient({
      routes: { posts: { data: null, error: { message: "timeout" } } },
    });

    await expect(
      loadProfilePublications({ supabase: client, profileId: "author-1", kind: "article" })
    ).rejects.toThrow(/publications failed/);
  });
});

/**
 * The query budget of a profile view, measured through the real loaders.
 * The identity lookup is one more round trip on top of these, shared between
 * `generateMetadata` and the page by React's per-render cache.
 */
describe("what a profile view reads", () => {
  function viewWith(viewer: { id: string } | null) {
    currentUser.value = viewer;
    findIdentityByUsername.mockResolvedValue(PROFILE_ROW);
    return makeClient({
      routes: {
        follows: { count: 1, data: null, error: null },
        posts: { data: [], error: null },
      },
    });
  }

  it("is three table reads and no RPC for a signed-out reader on Posts", async () => {
    const { client, tables, rpcNames } = viewWith(null);
    await loadProfileView({ supabase: client, username: "student1" });
    expect([...tables].sort()).toEqual(["follows", "follows", "posts"]);
    expect(rpcNames).toEqual([]);
  });

  it("is the same three for the owner", async () => {
    const { client, tables } = viewWith({ id: "author-1" });
    await loadProfileView({ supabase: client, username: "student1", tab: "articles" });
    expect([...tables].sort()).toEqual(["follows", "follows", "posts"]);
  });

  it("adds the viewer's follow and block state for a signed-in visitor", async () => {
    const { client, tables } = viewWith({ id: "reader-1" });
    await loadProfileView({ supabase: client, username: "student1" });
    expect([...tables].sort()).toEqual([
      "follows",
      "follows",
      "follows",
      "posts",
      "user_blocks",
    ]);
  });

  it("pages no publications for About", async () => {
    const { client, tables, rpcNames } = viewWith(null);
    const data = await loadProfileView({ supabase: client, username: "student1", tab: "about" });
    expect(data?.publications).toBeNull();
    expect([...tables].sort()).toEqual(["follows", "follows"]);
    expect(rpcNames).toEqual([]);
  });

  it("reads no co-author credits for any tab", async () => {
    for (const tab of ["posts", "articles", "about"] as const) {
      const { client, tables } = viewWith({ id: "reader-1" });
      await loadProfileView({ supabase: client, username: "student1", tab });
      expect(tables).not.toContain("post_authors");
    }
  });

  it("loads no record, featured work, citation edge or researcher profile", async () => {
    const { client, tables } = viewWith({ id: "reader-1" });
    await loadProfileView({ supabase: client, username: "student1", tab: "articles" });
    for (const retired of [
      "profile_record_entries",
      "profile_featured_posts",
      "post_citation_edges",
      "profile_recognitions",
      "researcher_profiles",
      "post_reference_counts",
    ]) {
      expect(tables).not.toContain(retired);
    }
  });
});

describe("the owner's Drafts tab", () => {
  const DRAFT_ROWS = [
    // Shaped like any posts row, because a visitor forcing Drafts gets the
    // Posts tab from the same stubbed table.
    row({ id: "draft-2", title: "Second thoughts", content_kind: "article", updated_at: "2026-02-02T00:00:00Z" }),
    row({ id: "draft-1", title: null, content_kind: "post", updated_at: "2026-02-01T00:00:00Z" }),
  ];

  function viewWith(viewer: { id: string } | null) {
    currentUser.value = viewer;
    findIdentityByUsername.mockResolvedValue(PROFILE_ROW);
    return makeClient({
      routes: {
        follows: { count: 1, data: null, error: null },
        posts: { data: DRAFT_ROWS, error: null },
      },
    });
  }

  function draftQueries(queries: Array<{ table: string; eq: Array<[string, unknown]> }>) {
    return queries.filter(
      (query) =>
        query.table === "posts" &&
        query.eq.some(([column, value]) => column === "status" && value === "draft")
    );
  }

  it("shows the owner their drafts, scoped to their own id, and pages no publications", async () => {
    const { client, tables, queries } = viewWith({ id: "author-1" });
    const data = await loadProfileView({ supabase: client, username: "student1", tab: "drafts" });

    expect(data?.tab).toBe("drafts");
    expect(data?.publications).toBeNull();
    expect(data?.drafts).toEqual([
      { id: "draft-2", title: "Second thoughts", kind: "article", updatedAt: "2026-02-02T00:00:00Z" },
      { id: "draft-1", title: null, kind: "post", updatedAt: "2026-02-01T00:00:00Z" },
    ]);
    expect([...tables].sort()).toEqual(["follows", "follows", "posts"]);

    const drafts = draftQueries(queries);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.eq).toContainEqual(["author_id", "author-1"]);
  });

  it("gives a signed-in visitor forcing Drafts the Posts tab, and never asks for drafts", async () => {
    const { client, queries } = viewWith({ id: "reader-1" });
    const data = await loadProfileView({ supabase: client, username: "student1", tab: "drafts" });

    expect(data?.tab).toBe("posts");
    expect(data?.drafts).toBeNull();
    expect(data?.publications?.kind).toBe("post");
    expect(draftQueries(queries)).toEqual([]);
  });

  it("gives a signed-out reader forcing Drafts the Posts tab, and never asks for drafts", async () => {
    const { client, queries } = viewWith(null);
    const data = await loadProfileView({ supabase: client, username: "student1", tab: "drafts" });

    expect(data?.tab).toBe("posts");
    expect(data?.drafts).toBeNull();
    expect(draftQueries(queries)).toEqual([]);
  });

  it("does not load drafts on any other tab, even for the owner", async () => {
    for (const tab of ["posts", "articles", "about"] as const) {
      const { client, queries } = viewWith({ id: "author-1" });
      const data = await loadProfileView({ supabase: client, username: "student1", tab });
      expect(data?.drafts).toBeNull();
      expect(draftQueries(queries)).toEqual([]);
    }
  });

  it("answers empty without a query when the viewer is not the profile", async () => {
    const { client, tables } = viewWith(null);
    await expect(
      loadProfileDrafts({ supabase: client, profileId: "author-1", viewerId: "reader-1" })
    ).resolves.toEqual([]);
    expect(tables).toEqual([]);
  });

  it("throws rather than showing an empty Drafts tab when the query fails", async () => {
    const { client } = makeClient({
      routes: { posts: { data: null, error: { message: "timeout" } } },
    });

    await expect(
      loadProfileDrafts({ supabase: client, profileId: "author-1", viewerId: "author-1" })
    ).rejects.toThrow(/drafts failed/);
  });
});
