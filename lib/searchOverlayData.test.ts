import { describe, expect, it, vi } from "vitest";
const repository = vi.hoisted(() => ({ posts: vi.fn().mockResolvedValue([]), people: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/db/readAdapter", () => ({ searchRepository: () => repository }));
import { searchOverlayPosts, searchOverlayPeople } from "./searchData";
import type { SupabaseClient } from "@supabase/supabase-js";
describe("bounded overlay data", () => {
  it("reuses excerpt-aware publication search with six results and the server viewer", async () => {
    await searchOverlayPosts({} as SupabaseClient, "thought", { viewerId: "viewer" });
    expect(repository.posts).toHaveBeenCalledWith("thought", { viewerId: "viewer", limit: 6 });
  });
  it("bounds visibility-aware writer search to three results", async () => {
    await searchOverlayPeople({} as SupabaseClient, "amara", { viewerId: null });
    expect(repository.people).toHaveBeenCalledWith("amara", { viewerId: null, limit: 3 });
  });
});
