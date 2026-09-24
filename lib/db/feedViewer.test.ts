import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  createPostgresFeedViewerRepository,
  createSupabaseFeedViewerRepository,
} = await import("./feedViewer");

describe("feed viewer repositories", () => {
  it("maps the Supabase RPC into the shared viewer-context shape", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          user_interests: ["Climate"],
          followed_ids: ["writer-1"],
          excluded_author_ids: ["blocked-1"],
        },
      ],
      error: null,
    });

    const repository = createSupabaseFeedViewerRepository({ rpc } as never);

    await expect(
      repository.load({ userId: "user-1", personalized: true })
    ).resolves.toEqual({
      userInterests: ["Climate"],
      followedIds: ["writer-1"],
      excludedAuthorIds: ["blocked-1"],
    });
    expect(rpc).toHaveBeenCalledWith("get_feed_viewer_context", {
      p_user_id: "user-1",
      p_personalized: true,
    });
  });

  it("preserves Supabase error codes so the caller can distinguish migration lag", async () => {
    const repository = createSupabaseFeedViewerRepository({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST202", message: "missing function" },
      }),
    } as never);

    await expect(
      repository.load({ userId: "user-1", personalized: true })
    ).rejects.toMatchObject({ code: "PGRST202", message: "missing function" });
  });

  it("loads personalization and both block directions in one PostgreSQL statement", async () => {
    const query = vi.fn().mockResolvedValue([
      {
        user_interests: JSON.stringify(["Climate"]),
        followed_ids: JSON.stringify(["writer-1"]),
        excluded_author_ids: JSON.stringify(["blocked-1", "blocked-2"]),
      },
    ]);
    const repository = createPostgresFeedViewerRepository({ query } as never);

    await expect(
      repository.load({ userId: "00000000-0000-0000-0000-000000000001", personalized: true })
    ).resolves.toEqual({
      userInterests: ["Climate"],
      followedIds: ["writer-1"],
      excludedAuthorIds: ["blocked-1", "blocked-2"],
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("public.profiles");
    expect(sql).toContain("public.follows");
    expect(sql).toContain("public.user_blocks");
    expect(params).toEqual([
      "00000000-0000-0000-0000-000000000001",
      true,
    ]);
  });

  it("keeps block exclusions while depersonalized", async () => {
    const query = vi.fn().mockResolvedValue([
      {
        user_interests: [],
        followed_ids: [],
        excluded_author_ids: ["blocked-1"],
      },
    ]);
    const repository = createPostgresFeedViewerRepository({ query } as never);

    await expect(
      repository.load({ userId: "00000000-0000-0000-0000-000000000001", personalized: false })
    ).resolves.toEqual({
      userInterests: [],
      followedIds: [],
      excludedAuthorIds: ["blocked-1"],
    });
  });
});
