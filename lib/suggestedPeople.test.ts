import { describe, expect, it } from "vitest";
import { getRecentWriters, getSuggestedPeople } from "./suggestedPeople";

interface ProfileRow {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  interests: string[] | null;
}

interface PostRow {
  author_id: string;
  published_at: string;
}

function profile(id: string, overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id,
    username: `user-${id}`,
    full_name: `User ${id}`,
    avatar_url: null,
    interests: [],
    ...overrides,
  };
}

/**
 * A client that answers `profiles` with the rows given, narrowed by `in` and
 * `overlaps` the way PostgREST would, and `posts` with the publications given.
 */
function createSupabase(profiles: ProfileRow[], posts: PostRow[] = []) {
  const tablesQueried: string[] = [];
  const notCalls: Array<[string, string, string]> = [];
  const selects: string[] = [];
  const orders: Array<[string, string]> = [];

  const supabase = {
    from(table: string) {
      tablesQueried.push(table);
      let rows: unknown[] = table === "posts" ? posts : profiles;

      const builder: Record<string, unknown> = {
        select(columns: string) {
          selects.push(columns);
          return builder;
        },
        eq() {
          return builder;
        },
        neq() {
          return builder;
        },
        in(_column: string, values: string[]) {
          rows = (rows as ProfileRow[]).filter((row) => values.includes(row.id));
          return builder;
        },
        overlaps(_column: string, values: string[]) {
          rows = (rows as ProfileRow[]).filter((row) =>
            (row.interests ?? []).some((interest) => values.includes(interest))
          );
          return builder;
        },
        order(column: string) {
          orders.push([table, column]);
          return builder;
        },
        not(column: string, operator: string, value: string) {
          notCalls.push([column, operator, value]);
          return builder;
        },
        limit(count: number) {
          return Promise.resolve({ data: rows.slice(0, count) });
        },
      };

      return builder;
    },
  };

  return { supabase, tablesQueried, notCalls, selects, orders };
}

describe("getSuggestedPeople exclusion filters", () => {
  it("sends one not-in clause instead of one neq per excluded id", async () => {
    const followedIds = Array.from({ length: 40 }, (_, index) => `f${index}`);
    const { supabase, notCalls } = createSupabase([profile("a", { interests: ["Law"] })]);

    await getSuggestedPeople(supabase, {
      currentUserId: "me",
      interests: ["Law"],
      followedIds,
      excludedUserIds: [],
      limit: 1,
    });

    // 41 ids (40 follows + self) fit in a single chunked clause. The old
    // implementation chained one `id=neq.<uuid>` param per id, so the request
    // line grew with the viewer's follow graph until it overran.
    expect(notCalls).toHaveLength(1);
    const [column, operator, value] = notCalls[0];
    expect(column).toBe("id");
    expect(operator).toBe("in");
    expect(value).toContain("me");
    expect(value).toContain("f39");
  });

  it("chunks very large exclusion lists rather than emitting one huge clause", async () => {
    const followedIds = Array.from({ length: 250 }, (_, index) => `f${index}`);
    const { supabase, notCalls } = createSupabase([profile("a", { interests: ["Law"] })]);

    await getSuggestedPeople(supabase, {
      currentUserId: "me",
      interests: ["Law"],
      followedIds,
      excludedUserIds: [],
      limit: 1,
    });

    // 251 ids at 100 per clause.
    expect(notCalls).toHaveLength(3);
    expect(notCalls.every(([column, operator]) => column === "id" && operator === "in")).toBe(true);
  });

  it("de-duplicates ids that appear in both the follow and block lists", async () => {
    const { supabase, notCalls } = createSupabase([profile("a", { interests: ["Law"] })]);

    await getSuggestedPeople(supabase, {
      currentUserId: "me",
      interests: ["Law"],
      followedIds: ["shared", "only-followed"],
      excludedUserIds: ["shared", "only-blocked"],
      limit: 1,
    });

    const ids = notCalls[0][2].replace(/^\(|\)$/g, "").split(",");
    expect(ids).toEqual(["me", "shared", "only-followed", "only-blocked"]);
  });

  it("never suggests a followed, blocked or recently publishing excluded writer", async () => {
    const { supabase } = createSupabase(
      [profile("followed"), profile("blocked"), profile("fresh")],
      [
        { author_id: "followed", published_at: "2026-09-10T00:00:00Z" },
        { author_id: "blocked", published_at: "2026-09-09T00:00:00Z" },
        { author_id: "me", published_at: "2026-09-08T00:00:00Z" },
        { author_id: "fresh", published_at: "2026-09-07T00:00:00Z" },
      ]
    );

    const { suggestions } = await getSuggestedPeople(supabase, {
      currentUserId: "me",
      followedIds: ["followed"],
      excludedUserIds: ["blocked"],
      limit: 1,
    });

    expect(suggestions.map((person) => person.id)).toEqual(["fresh"]);
  });
});

describe("getSuggestedPeople query reuse", () => {
  it("does not re-query follows or user_blocks when the caller supplies both graphs", async () => {
    const { supabase, tablesQueried } = createSupabase([profile("a")]);

    await getSuggestedPeople(supabase, {
      currentUserId: "me",
      followedIds: ["f1"],
      excludedUserIds: ["b1"],
      limit: 8,
    });

    expect(tablesQueried).not.toContain("follows");
    expect(tablesQueried).not.toContain("user_blocks");
    expect(tablesQueried).toContain("profiles");
  });

  it("still loads both graphs itself when the caller has not got them", async () => {
    const { supabase, tablesQueried } = createSupabase([profile("a")]);

    await getSuggestedPeople(supabase, {
      currentUserId: "me",
      limit: 8,
    });

    expect(tablesQueried).toContain("follows");
    expect(tablesQueried).toContain("user_blocks");
  });
});

describe("getSuggestedPeople ranking", () => {
  it("puts shared topics first, then recent publication, then the username", async () => {
    const { supabase } = createSupabase(
      [
        profile("recent", { username: "zed" }),
        profile("topic", { username: "yan", interests: ["Governance & Policy"] }),
        profile("quiet", { username: "abe" }),
        profile("older", { username: "bea" }),
      ],
      [
        { author_id: "recent", published_at: "2026-09-12T00:00:00Z" },
        { author_id: "older", published_at: "2026-08-01T00:00:00Z" },
      ]
    );

    const { suggestions, reason } = await getSuggestedPeople(supabase, {
      currentUserId: "me",
      interests: ["Governance & Policy"],
      followedIds: [],
      excludedUserIds: [],
      limit: 4,
    });

    expect(suggestions.map((person) => person.id)).toEqual(["topic", "recent", "older", "quiet"]);
    expect(suggestions[0].sharedTopic).toBe("Governance & Policy");
    expect(suggestions[1].lastPublishedAt).toBe("2026-09-12T00:00:00Z");
    expect(reason).toBe("Writing about your topics");
  });

  it("says Published recently when no shared topic leads the list", async () => {
    const { supabase } = createSupabase(
      [profile("a")],
      [{ author_id: "a", published_at: "2026-09-12T00:00:00Z" }]
    );

    const { reason } = await getSuggestedPeople(supabase, {
      currentUserId: "me",
      followedIds: [],
      excludedUserIds: [],
      limit: 1,
    });

    expect(reason).toBe("Published recently");
  });

  it("falls back to a stable list when nobody has published or shares a topic", async () => {
    const { supabase, orders } = createSupabase([
      profile("b", { username: "bola" }),
      profile("a", { username: "ade" }),
    ]);

    const { suggestions, reason } = await getSuggestedPeople(supabase, {
      currentUserId: "me",
      followedIds: [],
      excludedUserIds: [],
      limit: 2,
    });

    expect(suggestions.map((person) => person.username)).toEqual(["ade", "bola"]);
    expect(reason).toBe("Writers on Indegenius");
    expect(orders).toContainEqual(["profiles", "username"]);
  });
});

describe("getSuggestedPeople and the retired signals", () => {
  it("selects, orders and matches on no points, university, field or profile type", async () => {
    const { supabase, selects, orders } = createSupabase(
      [profile("a", { interests: ["Law"] })],
      [{ author_id: "a", published_at: "2026-09-12T00:00:00Z" }]
    );

    await getSuggestedPeople(supabase, {
      currentUserId: "me",
      interests: ["Law"],
      followedIds: [],
      excludedUserIds: [],
      limit: 8,
    });

    for (const columns of [...selects, ...orders.map(([, column]) => column)]) {
      expect(columns).not.toMatch(/points|university|field_of_study|profile_type/);
    }
  });
});

describe("getRecentWriters", () => {
  it("lists the newest publishers once each, newest first", async () => {
    const { supabase } = createSupabase(
      [profile("a"), profile("b")],
      [
        { author_id: "b", published_at: "2026-09-12T00:00:00Z" },
        { author_id: "a", published_at: "2026-09-11T00:00:00Z" },
        { author_id: "b", published_at: "2026-09-10T00:00:00Z" },
      ]
    );

    const { suggestions, reason } = await getRecentWriters(supabase, { limit: 8 });

    expect(suggestions.map((person) => person.id)).toEqual(["b", "a"]);
    expect(suggestions[0].lastPublishedAt).toBe("2026-09-12T00:00:00Z");
    expect(reason).toBe("Published recently");
  });
});
