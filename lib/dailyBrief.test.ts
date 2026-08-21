import { describe, expect, it, vi } from "vitest";
import { getEngagementCounts } from "./dailyBrief";

function resultBuilder(data: unknown[], error: unknown = null) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "in", "eq"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise.resolve({ data, error }).then(resolve, reject);
  return builder;
}

describe("getEngagementCounts", () => {
  it("counts only published Responses for featured posts", async () => {
    const references = resultBuilder([{ post_id: "post-1" }]);
    const bookmarks = resultBuilder([]);
    const responses = resultBuilder([
      { in_response_to: "post-1" },
      { in_response_to: "post-1" },
    ]);
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "post_references") return references;
        if (table === "bookmarks") return bookmarks;
        return responses;
      }),
    };

    const counts = await getEngagementCounts(supabase as never, ["post-1"]);

    expect(responses.eq).toHaveBeenCalledWith("status", "published");
    expect(counts.responseCounts).toEqual({ "post-1": 2 });
  });

  it("propagates count-query failures instead of returning zeroes", async () => {
    const supabase = {
      from: vi.fn((table: string) =>
        resultBuilder([], table === "bookmarks" ? { message: "failed" } : null)
      ),
    };

    // The aggregate table is unreadable here too, so this is the row-count
    // fallback failing, and its own error is what surfaces. What matters is
    // that a broken count reaches the caller rather than being rounded to zero
    // and quietly changing which post the digest leads with.
    await expect(
      getEngagementCounts(supabase as never, ["post-1"])
    ).rejects.toMatchObject({ operation: "count bookmarks" });
  });

  it("propagates a failed response query", async () => {
    const supabase = {
      from: vi.fn((table: string) =>
        resultBuilder([], table === "posts" ? { message: "failed" } : null)
      ),
    };

    await expect(
      getEngagementCounts(supabase as never, ["post-1"])
    ).rejects.toThrow("Unable to load featured-post engagement counts");
  });
});
