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

    // The single hydration RPC is optional decoration. An operational failure
    // must not trigger the six-query compatibility fan-out during an outage.
    expect(hydration).toEqual({ counts: [], profiles: [] });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
