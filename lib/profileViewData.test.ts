import { beforeEach, describe, expect, it, vi } from "vitest";

const getMessageEligibility = vi.hoisted(() => vi.fn());
vi.mock("@/lib/messaging", () => ({ getMessageEligibility }));

import {
  contentKindFilter,
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
 * tables a loader touches and how it treats an error, which is what these
 * tests are about.
 */
function makeClient({
  routes = {},
  rpc = {},
  user = null,
}: {
  routes?: Routes;
  rpc?: Record<string, StubResult>;
  user?: { id: string } | null;
} = {}) {
  const tables: string[] = [];
  const rpcNames: string[] = [];

  const chainFor = (table: string) => {
    const resolve = () => {
      const route = routes[table] ?? { data: null, error: null };
      return Promise.resolve({
        data: null,
        error: null,
        count: 0,
        ...route,
      });
    };
    const chain: Record<string, unknown> = {
      maybeSingle: resolve,
      single: resolve,
      then: (onOk: unknown, onErr: unknown) =>
        resolve().then(onOk as never, onErr as never),
    };
    for (const method of [
      "select",
      "eq",
      "neq",
      "in",
      "or",
      "not",
      "order",
      "limit",
      "range",
    ]) {
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
        const route = rpc[name] ?? {
          data: null,
          error: { message: `no function ${name}`, code: "PGRST202" },
        };
        return Promise.resolve({ data: null, error: null, ...route });
      },
      auth: {
        getUser: async () => ({ data: { user }, error: null }),
      },
    } as never,
  };
}

const PROFILE_ROW = {
  id: "author-1",
  username: "student1",
  full_name: "A Student",
  country: "Nigeria",
  university: "University of Lagos",
  field_of_study: "Political Science",
  graduation_year: 2028,
  is_alumni: false,
  bio: null,
  avatar_url: null,
  cover_image_url: null,
  verified: false,
  verified_type: null,
  interests: null,
  profile_type: "student",
  professional_title: null,
  organization_name: null,
  organization_website: null,
};

beforeEach(() => {
  getMessageEligibility.mockReset();
  getMessageEligibility.mockResolvedValue({ eligible: true, reason: null });
});

describe("loadProfileIdentity: an absent profile and a broken database", () => {
  it("returns null when the query succeeded and matched nothing", async () => {
    const { client } = makeClient({ routes: { profiles: { data: null, error: null } } });

    await expect(loadProfileIdentity(client, "nobody")).resolves.toBeNull();
  });

  /**
   * The distinction this whole loader exists to preserve. A null row with no
   * error is an answer; a null row with an error is a failure wearing the
   * same clothes. Reading the second as the first is what told every visitor
   * that every member's profile did not exist while Supabase was down.
   */
  it("throws when the query itself failed", async () => {
    const { client } = makeClient({
      routes: {
        profiles: { data: null, error: { message: "connection timed out" } },
      },
    });

    await expect(loadProfileIdentity(client, "student1")).rejects.toThrow(
      /profile lookup failed/
    );
  });

  it("does not leak the database message into the thrown surface text", async () => {
    const { client } = makeClient({
      routes: {
        profiles: {
          data: null,
          error: { message: 'relation "profiles" does not exist' },
        },
      },
    });

    // The message is for the server log. What the reader sees is the route's
    // error boundary, which never prints this.
    await expect(loadProfileIdentity(client, "student1")).rejects.toThrow(
      /profile lookup failed/
    );
  });
});

describe("loadProfileView: not-found versus failure", () => {
  it("returns null for a username that does not exist", async () => {
    const { client } = makeClient({ routes: { profiles: { data: null, error: null } } });

    await expect(
      loadProfileView({ supabase: client, username: "nobody" })
    ).resolves.toBeNull();
  });

  it("propagates a query failure instead of reporting an absence", async () => {
    const { client } = makeClient({
      routes: { profiles: { data: null, error: { message: "502 bad gateway" } } },
    });

    await expect(
      loadProfileView({ supabase: client, username: "student1" })
    ).rejects.toThrow();
  });

  it("throws when a relationship count fails rather than printing zero", async () => {
    const { client } = makeClient({
      routes: {
        profiles: { data: PROFILE_ROW, error: null },
        follows: { data: null, error: { message: "statement timeout" }, count: 0 },
      },
    });

    await expect(
      loadProfileView({ supabase: client, username: "student1", view: "about" })
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
    expect(viewer.messaging).toBeNull();
    // Anonymous readers follow nobody, subscribe to nobody and block nobody.
    expect(tables).not.toContain("author_subscriptions");
    expect(tables).not.toContain("user_blocks");
    expect(getMessageEligibility).not.toHaveBeenCalled();
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
    expect(getMessageEligibility).not.toHaveBeenCalled();
  });

  /**
   * Message eligibility used to be awaited on its own after everything else
   * had settled, which cost the page a whole serial round trip. It belongs in
   * the same wave: it needs the viewer id and the profile id, both of which
   * are known before the wave opens.
   */
  it("resolves message eligibility inside the same wave as the counts", async () => {
    const { client } = makeClient({
      routes: { follows: { count: 2, data: null, error: null } },
      user: { id: "viewer-9" },
    });

    const viewer = await loadProfileViewerContext({
      supabase: client,
      profileId: "author-1",
      viewerId: "viewer-9",
    });

    expect(getMessageEligibility).toHaveBeenCalledWith(client, "viewer-9", "author-1");
    expect(viewer.messaging).toEqual({ eligible: true, reason: null });
  });
});

describe("the Article and Post split", () => {
  it("selects modern rows by their declared kind", () => {
    expect(contentKindFilter("article")).toContain("content_kind.eq.article");
    expect(contentKindFilter("post")).toContain("content_kind.eq.post");
  });

  /**
   * The legacy half of the filter is generated from the same mapping the
   * resolver uses, so it cannot drift: essay and policy_brief are Articles,
   * blog is a Post.
   */
  it("selects legacy rows through the shared mapping", () => {
    const articles = contentKindFilter("article");
    expect(articles).toContain("content_kind.is.null");
    expect(articles).toContain("type.in.(essay,policy_brief)");

    const posts = contentKindFilter("post");
    expect(posts).toContain("type.in.(blog)");
    expect(posts).not.toContain("essay");
  });

  it("classifies co-authored work with the resolver rather than a second copy", async () => {
    const rows = {
      posts: {
        data: [
          {
            id: "own-article",
            author_id: "author-1",
            title: "A modern article",
            slug: "modern-article",
            in_response_to: null,
            excerpt: null,
            type: "essay",
            content_kind: "article",
            article_format: null,
            tags: [],
            citation_id: null,
            created_at: "2026-01-01T00:00:00Z",
            published_at: "2026-01-01T00:00:00Z",
            cover_image_url: null,
          },
        ],
        error: null,
      },
      post_authors: {
        data: [
          {
            posts: {
              id: "coauthored-legacy-brief",
              author_id: "someone-else",
              title: "A legacy policy brief",
              slug: "legacy-brief",
              in_response_to: null,
              excerpt: null,
              type: "policy_brief",
              content_kind: null,
              article_format: null,
              tags: [],
              citation_id: null,
              created_at: "2025-06-01T00:00:00Z",
              published_at: "2025-06-01T00:00:00Z",
              cover_image_url: null,
              status: "published",
            },
          },
          {
            posts: {
              id: "coauthored-blog",
              author_id: "someone-else",
              title: null,
              slug: "legacy-blog",
              in_response_to: null,
              excerpt: null,
              type: "blog",
              content_kind: null,
              article_format: null,
              tags: [],
              citation_id: null,
              created_at: "2025-05-01T00:00:00Z",
              published_at: "2025-05-01T00:00:00Z",
              cover_image_url: null,
              status: "published",
            },
          },
        ],
        error: null,
      },
    };
    const { client } = makeClient({ routes: rows });

    const page = await loadProfilePublications({
      supabase: client,
      profileId: "author-1",
      contentKind: "article",
    });

    const ids = page.items.map((item) => item.id);
    expect(ids).toContain("own-article");
    // A legacy policy brief is an Article.
    expect(ids).toContain("coauthored-legacy-brief");
    // A legacy blog is not.
    expect(ids).not.toContain("coauthored-blog");
    expect(
      page.items.find((item) => item.id === "coauthored-legacy-brief")?.isCoAuthor
    ).toBe(true);
    expect(page.items.every((item) => item.contentKind === "article")).toBe(true);
  });

  it("reports a further page without counting the whole table", async () => {
    const many = Array.from({ length: 21 }, (_, index) => ({
      id: `post-${index}`,
      author_id: "author-1",
      title: `Post ${index}`,
      slug: `post-${index}`,
      in_response_to: null,
      excerpt: null,
      type: "blog",
      content_kind: null,
      article_format: null,
      tags: [],
      citation_id: null,
      created_at: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
      published_at: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
      cover_image_url: null,
    }));
    const { client } = makeClient({ routes: { posts: { data: many, error: null } } });

    const page = await loadProfilePublications({
      supabase: client,
      profileId: "author-1",
      contentKind: "post",
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
      loadProfilePublications({
        supabase: client,
        profileId: "author-1",
        contentKind: "article",
      })
    ).rejects.toThrow(/publications failed/);
  });
});

describe("what the public profile no longer loads", () => {
  it("asks for no researcher profile and no citation edges", async () => {
    const { client, tables } = makeClient({
      routes: {
        profiles: { data: PROFILE_ROW, error: null },
        follows: { count: 0, data: null, error: null },
      },
    });

    await loadProfileView({ supabase: client, username: "student1", view: "about" });

    expect(tables).not.toContain("researcher_profiles");
    expect(tables).not.toContain("post_citation_edges");
    expect(tables).not.toContain("profile_recognitions");
  });

  /**
   * About shows profile metadata. Paging somebody's publications to render a
   * page that lists none of them is the cost this loader exists to avoid.
   */
  it("does not page publications for a view that shows none", async () => {
    const { client, tables, rpcNames } = makeClient({
      routes: {
        profiles: { data: PROFILE_ROW, error: null },
        follows: { count: 0, data: null, error: null },
      },
    });

    const data = await loadProfileView({
      supabase: client,
      username: "student1",
      view: "about",
    });

    expect(data?.publications).toBeNull();
    expect(data?.overview).toBeNull();
    expect(tables).not.toContain("profile_record_entries");
    expect(tables).not.toContain("profile_featured_posts");
    expect(rpcNames).toHaveLength(0);
  });

  it("loads only the list an Articles view renders", async () => {
    const { client, tables } = makeClient({
      routes: {
        profiles: { data: PROFILE_ROW, error: null },
        follows: { count: 0, data: null, error: null },
        posts: { data: [], error: null },
        post_authors: { data: [], error: null },
      },
    });

    const data = await loadProfileView({
      supabase: client,
      username: "student1",
      view: "articles",
    });

    expect(data?.publications).not.toBeNull();
    expect(data?.overview).toBeNull();
    expect(tables).not.toContain("profile_featured_posts");
  });
});
