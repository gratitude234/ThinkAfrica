import { describe, expect, it, vi } from "vitest";
import { createSupabaseProfilePageRepository } from "./profilePage";

describe("profile aggregate transport", () => {
  it("uses one small aggregate response, without scanning authored rows", async () => {
    const from = vi.fn();
    const rpc = vi.fn().mockResolvedValue({ data: [{ month: "2026-01", publication_count: "7" }], error: null });
    const repo = createSupabaseProfilePageRepository({ from, rpc } as never);
    expect(await repo.publicationActivity({ profileId: "a", startMonth: "2026-01-01T00:00:00Z", months: 1 })).toEqual([{ month: "2026-01", count: 7 }]);
    expect(rpc).toHaveBeenCalledWith("profile_publication_activity", { p_profile_id: "a", p_start_month: "2026-01-01T00:00:00.000Z", p_months: 1 });
    expect(from).not.toHaveBeenCalled();
  });
  it("does not fallback for permissions, outages, or an incomplete aggregate", async () => {
    const from = vi.fn();
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } });
    const repo = createSupabaseProfilePageRepository({ from, rpc } as never);
    await expect(repo.publicationTopics({ profileId: "a", limit: 6 })).rejects.toThrow(/permission denied/);
    expect(from).not.toHaveBeenCalled();
  });
});
