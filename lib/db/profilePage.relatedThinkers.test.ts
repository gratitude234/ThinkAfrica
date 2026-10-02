import { describe, expect, it } from "vitest";

import {
  createPostgresProfilePageRepository,
  createSupabaseProfilePageRepository,
} from "@/lib/db/profilePage";
import type { SqlExecutor } from "@/lib/db/postgres/executor";

function recordingExecutor(rows: Record<string, unknown>[]) {
  const calls: Array<{ text: string; params: readonly unknown[] }> = [];
  const executor: SqlExecutor = {
    async query<Row>(text: string, params: readonly unknown[] = []) {
      calls.push({ text, params });
      return rows as Row[];
    },
  };
  return { executor, calls };
}

function supabaseClient() {
  const tables: string[] = [];
  const overlaps: Array<{ table: string; column: string; values: string[] }> = [];
  let followCall = 0;

  const routes: Record<string, () => { data: unknown[]; error: null }> = {
    posts: () => ({
      data: [
        {
          author_id: "candidate-a",
          topic_keys: ["governance", "education policy"],
          published_at: "2026-10-02T10:00:00Z",
          created_at: "2026-10-02T09:00:00Z",
        },
        {
          author_id: "candidate-b",
          topic_keys: ["governance"],
          published_at: "2026-10-01T10:00:00Z",
          created_at: "2026-10-01T09:00:00Z",
        },
        {
          author_id: "viewer-1",
          topic_keys: ["governance", "education policy"],
          published_at: "2026-10-03T10:00:00Z",
          created_at: "2026-10-03T09:00:00Z",
        },
      ],
      error: null,
    }),
    profile_directory: () => ({
      data: [
        {
          id: "candidate-a",
          username: "amina",
          full_name: "Amina Yusuf",
          avatar_url: null,
          professional_title: "Policy researcher",
        },
        {
          id: "candidate-b",
          username: "tunde",
          full_name: "Tunde Adebayo",
          avatar_url: null,
          professional_title: null,
        },
      ],
      error: null,
    }),
    follows: () => {
      followCall += 1;
      if (followCall === 1) return { data: [{ following_id: "candidate-b" }], error: null };
      if (followCall === 2) return { data: [{ follower_id: "candidate-a" }], error: null };
      return { data: [{ following_id: "candidate-a" }], error: null };
    },
  };

  const client = {
    from(table: string) {
      tables.push(table);
      const route = routes[table] ?? (() => ({ data: [], error: null }));
      const result = route();
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        neq: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        overlaps(column: string, values: string[]) {
          overlaps.push({ table, column, values });
          return chain;
        },
        then(onOk: (value: unknown) => unknown, onErr?: (error: unknown) => unknown) {
          return Promise.resolve(result).then(onOk, onErr);
        },
      };
      return chain;
    },
  } as never;

  return { client, tables, overlaps };
}

describe("relatedThinkers, PostgreSQL", () => {
  it("returns safe public writer context and carries viewer follow state", async () => {
    const { executor, calls } = recordingExecutor([
      {
        id: "candidate-a",
        username: "amina",
        full_name: "Amina Yusuf",
        avatar_url: null,
        professional_title: "Policy researcher",
        shared_topics: ["education policy", "governance"],
        owner_follows: false,
        follows_owner: true,
        viewer_follows: true,
        latest_published_at: "2026-10-02T10:00:00Z",
      },
    ]);
    const repository = createPostgresProfilePageRepository(executor);

    await expect(
      repository.relatedThinkers({
        profileId: "author-1",
        topicKeys: ["Governance", "education policy"],
        viewerId: "viewer-1",
        limit: 3,
      })
    ).resolves.toEqual([
      {
        id: "candidate-a",
        username: "amina",
        fullName: "Amina Yusuf",
        avatarUrl: null,
        professionalTitle: "Policy researcher",
        sharedTopics: ["education policy", "governance"],
        ownerFollows: false,
        followsOwner: true,
        viewerFollows: true,
        latestPublishedAt: "2026-10-02T10:00:00Z",
      },
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.params).toEqual([
      "author-1",
      JSON.stringify(["governance", "education policy"]),
      "viewer-1",
      3,
    ]);
    expect(calls[0]?.text).toContain("recent_matching_posts");
    expect(calls[0]?.text).toContain("public.follows");
    expect(calls[0]?.text).toContain("show_in_directory");
    expect(calls[0]?.text).toContain("profile_visibility");
  });

  it("does not query when the profile has no demonstrated writing topics", async () => {
    const { executor, calls } = recordingExecutor([]);
    const repository = createPostgresProfilePageRepository(executor);

    await expect(
      repository.relatedThinkers({
        profileId: "author-1",
        topicKeys: [],
        viewerId: null,
        limit: 3,
      })
    ).resolves.toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe("relatedThinkers, Supabase", () => {
  it("requires shared published topics, then uses follow edges as context", async () => {
    const { client, tables, overlaps } = supabaseClient();
    const repository = createSupabaseProfilePageRepository(client);

    const result = await repository.relatedThinkers({
      profileId: "author-1",
      topicKeys: ["Governance", "education policy"],
      viewerId: "viewer-1",
      limit: 3,
    });

    expect(result.map((person) => person.id)).toEqual(["candidate-a", "candidate-b"]);
    expect(result[0]).toMatchObject({
      sharedTopics: ["education policy", "governance"],
      followsOwner: true,
      viewerFollows: true,
    });
    expect(result[1]).toMatchObject({
      sharedTopics: ["governance"],
      ownerFollows: true,
    });
    expect(result.some((person) => person.id === "viewer-1")).toBe(false);
    expect(tables).toContain("profile_directory");
    expect(tables).not.toContain("profiles");
    expect(overlaps).toEqual([
      { table: "posts", column: "topic_keys", values: ["governance", "education policy"] },
    ]);
  });
});
