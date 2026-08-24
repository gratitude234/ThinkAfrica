import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeSupabase, makeBuilder, queueResults } from "@/lib/testUtils/supabaseMock";

const { fakeSupabase } = vi.hoisted(() => ({
  fakeSupabase: { current: null as ReturnType<typeof makeFakeSupabase> | null },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => fakeSupabase.current),
}));

import { createDraftShareLink, getDraftShareLink, revokeDraftShareLink } from "./shareActions";

const draftPost = { id: "post-1", author_id: "user-1", status: "draft" };

describe("createDraftShareLink", () => {
  beforeEach(() => {
    fakeSupabase.current = null;
  });

  it("mints a token for the author's own draft", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: () => makeBuilder({ data: draftPost, error: null }),
      post_draft_shares: queueResults({ data: null, error: null }, { data: null, error: null }),
    });

    const result = await createDraftShareLink({ postId: "post-1" });

    expect(result.error).toBeNull();
    expect(result.token).toBeTruthy();
    // URL-safe, and long enough that guessing is not a strategy.
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
  });

  it("refuses a post that belongs to someone else", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: () => makeBuilder({ data: { ...draftPost, author_id: "someone-else" }, error: null }),
    });

    const result = await createDraftShareLink({ postId: "post-1" });

    expect(result.token).toBeNull();
    expect(result.error).toMatch(/permission/i);
  });

  it("refuses anything that is no longer a draft, which already has a public address", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: () => makeBuilder({ data: { ...draftPost, status: "published" }, error: null }),
    });

    const result = await createDraftShareLink({ postId: "post-1" });

    expect(result.token).toBeNull();
    expect(result.error).toMatch(/already published/i);
  });

  it("returns the live link rather than rotating it on every visit", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: () => makeBuilder({ data: draftPost, error: null }),
      post_draft_shares: () =>
        makeBuilder({ data: { token: "existing-token", revoked_at: null }, error: null }),
    });

    const result = await createDraftShareLink({ postId: "post-1" });

    expect(result.token).toBe("existing-token");
  });

  it("mints a fresh token after a revoke, so a link taken back stays dead", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: () => makeBuilder({ data: draftPost, error: null }),
      post_draft_shares: queueResults(
        { data: { token: "revoked-token", revoked_at: "2026-08-01T00:00:00Z" }, error: null },
        { data: null, error: null }
      ),
    });

    const result = await createDraftShareLink({ postId: "post-1" });

    expect(result.error).toBeNull();
    expect(result.token).not.toBe("revoked-token");
  });

  it("refuses when nobody is signed in", async () => {
    fakeSupabase.current = makeFakeSupabase({}, null);

    const result = await createDraftShareLink({ postId: "post-1" });

    expect(result.token).toBeNull();
    expect(result.error).toMatch(/signed in/i);
  });
});

describe("getDraftShareLink", () => {
  it("reports no link once one has been revoked", async () => {
    fakeSupabase.current = makeFakeSupabase({
      post_draft_shares: () =>
        makeBuilder({ data: { token: "old", revoked_at: "2026-08-01T00:00:00Z" }, error: null }),
    });

    expect(await getDraftShareLink({ postId: "post-1" })).toEqual({ token: null });
  });

  it("returns a live link", async () => {
    fakeSupabase.current = makeFakeSupabase({
      post_draft_shares: () => makeBuilder({ data: { token: "live", revoked_at: null }, error: null }),
    });

    expect(await getDraftShareLink({ postId: "post-1" })).toEqual({ token: "live" });
  });
});

describe("revokeDraftShareLink", () => {
  it("stamps revoked_at rather than deleting the row", async () => {
    const shares = makeBuilder({ data: null, error: null });
    fakeSupabase.current = makeFakeSupabase({ post_draft_shares: () => shares });

    const result = await revokeDraftShareLink({ postId: "post-1" });

    expect(result.error).toBeNull();
    expect(shares.updatedWith).toMatchObject({ revoked_at: expect.any(String) });
    expect(shares.delete).not.toHaveBeenCalled();
  });
});
