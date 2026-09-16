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

  const chainFor = (table: string) => {
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
    for (const method of ["select", "eq", "neq", "in", "or", "not", "order", "limit", "range"]) {
      chain[method] = () => chain;
    }
    return chain;
  };

  return {
    tables,
    rpcNames,
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
  it("files legacy Essays, Policy Briefs and Research as Articles, and a legacy blog as a Post", async () => {
    const { client } = makeClient({
      routes: {
        posts: { data: [row({ id: "own-article", content_kind: "article" })], error: null },
        post_authors: {
          data: [
            // What a legacy Policy Brief and a legacy Research paper carry
            // after 20260915000005: content_kind "article", like any other.
            { posts: row({ id: "legacy-brief", author_id: "someone-else", content_kind: "article", status: "published" }) },
            { posts: row({ id: "legacy-research", author_id: "someone-else", content_kind: "article", status: "published" }) },
            { posts: row({ id: "legacy-blog", author_id: "someone-else", content_kind: "post", status: "published" }) },
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

    const ids = page.items.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(["own-article", "legacy-brief", "legacy-research"]));
    expect(ids).not.toContain("legacy-blog");
    expect(page.items.every((item) => item.kind === "article")).toBe(true);
    expect(page.items.find((item) => item.id === "legacy-brief")?.isCoAuthor).toBe(true);
  });

  it("gives a Response the tab its own content kind names", async () => {
    const { client } = makeClient({
      routes: {
        posts: { data: [], error: null },
        post_authors: {
          data: [
            { posts: row({ id: "response-post", author_id: "someone-else", type: "blog", content_kind: "post", status: "published" }) },
            { posts: row({ id: "response-article", author_id: "someone-else", type: "essay", content_kind: "article", status: "published" }) },
          ],
          error: null,
        },
      },
    });

    const posts = await loadProfilePublications({ supabase: client, profileId: "author-1", kind: "post" });
    expect(posts.items.map((item) => item.id)).toEqual(["response-post"]);
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
        post_authors: { data: [], error: null },
      },
    });
  }

  it("is four table reads and no RPC for a signed-out reader on Posts", async () => {
    const { client, tables, rpcNames } = viewWith(null);
    await loadProfileView({ supabase: client, username: "student1" });
    expect([...tables].sort()).toEqual(["follows", "follows", "post_authors", "posts"]);
    expect(rpcNames).toEqual([]);
  });

  it("is the same four for the owner", async () => {
    const { client, tables } = viewWith({ id: "author-1" });
    await loadProfileView({ supabase: client, username: "student1", tab: "articles" });
    expect([...tables].sort()).toEqual(["follows", "follows", "post_authors", "posts"]);
  });

  it("adds the viewer's follow and block state for a signed-in visitor", async () => {
    const { client, tables } = viewWith({ id: "reader-1" });
    await loadProfileView({ supabase: client, username: "student1" });
    expect([...tables].sort()).toEqual([
      "follows",
      "follows",
      "follows",
      "post_authors",
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
