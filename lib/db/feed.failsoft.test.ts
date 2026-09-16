import { describe, expect, it, vi } from "vitest";
import { createSupabaseFeedRepository } from "@/lib/db/feed";
import { makeBuilder } from "@/lib/testUtils/supabaseMock";

function fakeClient() {
  const from = vi.fn((table: string) => {
    if (table === "post_like_counts") {
      return makeBuilder({
        data: null,
        error: { code: "PGRST002", message: "schema cache unavailable" },
      });
    }
    if (table === "post_bookmark_counts") {
      return makeBuilder({
        data: null,
        error: { code: "PGRST002", message: "schema cache unavailable" },
      });
    }
    if (table === "profiles") {
      return makeBuilder({
        data: [
          {
            id: "author-1",
            username: "writer",
            full_name: "Writer",
            university: null,
            avatar_url: null,
            verified: false,
            verified_type: null,
          },
        ],
        error: null,
      });
    }
    return makeBuilder({ data: [], error: null });
  });

  return {
    from,
    rpc: vi.fn(async () => ({
      data: null,
      error: { code: "PGRST002", message: "schema cache unavailable" },
    })),
  };
}

describe("Supabase feed hydration outage tolerance", () => {
  it("renders the already-loaded posts even when engagement hydration is unavailable", async () => {
    const supabase = fakeClient();
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const hydration = await createSupabaseFeedRepository(supabase as never).hydrate({
      postIds: ["post-1"],
      authorIds: ["author-1"],
      viewer: { id: null },
    });

    expect(hydration.counts).toEqual([
      {
        postId: "post-1",
        likeCount: 0,
        bookmarkCount: 0,
        commentCount: 0,
        viewerLiked: false,
        viewerBookmarked: false,
      },
    ]);
    expect(hydration.profiles).toHaveLength(1);
    // A failed aggregate must not immediately fall back to the raw bookmarks
    // table during an outage.
    expect(supabase.from).not.toHaveBeenCalledWith("bookmarks");
  });
});
