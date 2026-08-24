import { describe, expect, it } from "vitest";
import { getSuggestedPeople } from "./suggestedPeople";

interface ProfileRow {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  field_of_study: string | null;
  avatar_url: string | null;
  points: number | null;
  interests: string[] | null;
  profile_type: string | null;
}

function profile(id: string, overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id,
    username: `user-${id}`,
    full_name: `User ${id}`,
    university: "Ibadan",
    field_of_study: "Economics",
    avatar_url: null,
    points: 120,
    interests: [],
    profile_type: "professional",
    ...overrides,
  };
}

function createSupabase(profiles: ProfileRow[]) {
  const tablesQueried: string[] = [];
  const notCalls: Array<[string, string, string]> = [];
  const selects: string[] = [];

  const supabase = {
    from(table: string) {
      tablesQueried.push(table);

      const builder: Record<string, unknown> = {
        select(columns: string) {
          selects.push(columns);
          return builder;
        },
        eq() {
          return builder;
        },
        in() {
          return builder;
        },
        overlaps() {
          return builder;
        },
        order() {
          return builder;
        },
        not(column: string, operator: string, value: string) {
          notCalls.push([column, operator, value]);
          return builder;
        },
        limit(count: number) {
          return Promise.resolve({ data: profiles.slice(0, count) });
        },
      };

      return builder;
    },
  };

  return { supabase, tablesQueried, notCalls, selects };
}

describe("getSuggestedPeople exclusion filters", () => {
  it("sends one not-in clause instead of one neq per excluded id", async () => {
    const followedIds = Array.from({ length: 40 }, (_, index) => `f${index}`);
    const { supabase, notCalls } = createSupabase([profile("a")]);

    await getSuggestedPeople(supabase, {
      currentUserId: "me",
      university: null,
      fieldOfStudy: null,
      followedIds,
      excludedUserIds: [],
      limit: 8,
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
    const { supabase, notCalls } = createSupabase([profile("a")]);

    await getSuggestedPeople(supabase, {
      currentUserId: "me",
      university: null,
      fieldOfStudy: null,
      followedIds,
      excludedUserIds: [],
      limit: 8,
    });

    // 251 ids at 100 per clause.
    expect(notCalls).toHaveLength(3);
    expect(notCalls.every(([column, operator]) => column === "id" && operator === "in")).toBe(true);
  });

  it("de-duplicates ids that appear in both the follow and block lists", async () => {
    const { supabase, notCalls } = createSupabase([profile("a")]);

    await getSuggestedPeople(supabase, {
      currentUserId: "me",
      university: null,
      fieldOfStudy: null,
      followedIds: ["shared", "only-followed"],
      excludedUserIds: ["shared", "only-blocked"],
      limit: 8,
    });

    const ids = notCalls[0][2].replace(/^\(|\)$/g, "").split(",");
    expect(ids).toEqual(["me", "shared", "only-followed", "only-blocked"]);
  });
});

describe("getSuggestedPeople query reuse", () => {
  it("does not re-query follows or user_blocks when the caller supplies both graphs", async () => {
    const { supabase, tablesQueried } = createSupabase([profile("a")]);

    await getSuggestedPeople(supabase, {
      currentUserId: "me",
      university: null,
      fieldOfStudy: null,
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
      university: null,
      fieldOfStudy: null,
      limit: 8,
    });

    expect(tablesQueried).toContain("follows");
    expect(tablesQueried).toContain("user_blocks");
  });
});

describe("getSuggestedPeople result shape", () => {
  it("carries field_of_study and points so a suggestion has a reason to follow", async () => {
    const { supabase, selects } = createSupabase([
      profile("a", { field_of_study: "Public Health", points: 980 }),
    ]);

    const { suggestions } = await getSuggestedPeople(supabase, {
      currentUserId: "me",
      university: null,
      fieldOfStudy: null,
      followedIds: [],
      excludedUserIds: [],
      limit: 8,
    });

    // These two used to be dropped from the select and re-stubbed as null by
    // callers, which left a signed-in viewer with a less informative person
    // card than a signed-out one.
    expect(selects[0]).toContain("field_of_study");
    expect(selects[0]).toContain("points");
    expect(suggestions[0].field_of_study).toBe("Public Health");
    expect(suggestions[0].points).toBe(980);
  });

  it("reports the university-and-field match as the reason when one is found", async () => {
    const { supabase } = createSupabase([profile("a")]);

    const { reason } = await getSuggestedPeople(supabase, {
      currentUserId: "me",
      university: "Ibadan",
      fieldOfStudy: "Economics",
      followedIds: [],
      excludedUserIds: [],
      limit: 8,
    });

    expect(reason).toBe("From your university and field");
  });

  it("puts topic relevance ahead of points", async () => {
    const { supabase } = createSupabase([
      profile("popular", { points: 5000, interests: ["Agriculture & Food Systems"] }),
      profile("relevant", { points: 25, interests: ["Governance & Policy"] }),
    ]);

    const { suggestions, reason } = await getSuggestedPeople(supabase, {
      currentUserId: "me",
      university: null,
      fieldOfStudy: null,
      interests: ["Governance & Policy"],
      currentPath: "non_student",
      workCategory: "policy_community",
      followedIds: [],
      excludedUserIds: [],
      limit: 2,
    });

    expect(suggestions[0].id).toBe("relevant");
    expect(reason).toBe("Writing about your topics");
  });

  it("combines school and topic relevance for students", async () => {
    const { supabase } = createSupabase([
      profile("topic-only", {
        university: "Lagos",
        interests: ["Economics & Development"],
      }),
      profile("school-topic", {
        university: "Ibadan",
        interests: ["Economics & Development"],
      }),
    ]);

    const { suggestions, reason } = await getSuggestedPeople(supabase, {
      currentUserId: "me",
      university: "Ibadan",
      fieldOfStudy: "Economics",
      interests: ["Economics & Development"],
      currentPath: "student",
      followedIds: [],
      excludedUserIds: [],
      limit: 2,
    });

    expect(suggestions[0].id).toBe("school-topic");
    expect(reason).toBe("From your school and topics");
  });
});
