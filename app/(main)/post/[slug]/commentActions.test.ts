import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeSupabase, queueResults } from "@/lib/testUtils/supabaseMock";
import { COMMENT_MAX_CHARACTERS } from "@/lib/commentContent";

const { fakeSupabase, adminSupabase, mocks } = vi.hoisted(() => ({
  fakeSupabase: { current: null as ReturnType<typeof makeFakeSupabase> | null },
  adminSupabase: { current: null as ReturnType<typeof makeFakeSupabase> | null },
  mocks: {
    requireNotSuspended: vi.fn(async () => null as string | null),
    recordActivationEvent: vi.fn(async () => {}),
    sendUserEmail: vi.fn(async () => ({ ok: true })),
    sendPushNotification: vi.fn(async () => ({ ok: true })),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => fakeSupabase.current),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminSupabase.current ?? makeFakeSupabase({})),
}));
vi.mock("@/lib/suspension", () => ({
  requireNotSuspended: mocks.requireNotSuspended,
}));
vi.mock("@/lib/activationServer", () => ({
  recordActivationEvent: mocks.recordActivationEvent,
}));
vi.mock("@/lib/email", () => ({
  sendUserEmail: mocks.sendUserEmail,
  logEmailResult: vi.fn(),
  escapeHtml: (value: string) => value,
}));
vi.mock("@/lib/push", () => ({
  sendPushNotification: mocks.sendPushNotification,
  logPushResult: vi.fn(),
  ENGAGEMENT_PUSH_COOLDOWN_MS: 1000,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteComment, submitComment } from "./commentActions";

const POST = { author_id: "post-author", title: "A Post", slug: "a-post" };
const INSERTED = {
  id: "comment-1",
  content: "Considered point.",
  created_at: "2026-08-02T10:00:00.000Z",
  updated_at: null,
  upvotes: 0,
  parent_id: null,
  author_id: "user-1",
  profiles: { username: "amara", full_name: "Amara Okafor", avatar_url: null },
};

function commentsRoute(...results: Array<{ data?: unknown; error?: unknown }>) {
  return queueResults(...results);
}

beforeEach(() => {
  fakeSupabase.current = null;
  adminSupabase.current = null;
  mocks.requireNotSuspended.mockResolvedValue(null);
  mocks.recordActivationEvent.mockClear();
  mocks.sendUserEmail.mockClear();
  mocks.sendPushNotification.mockClear();
});

describe("submitComment", () => {
  it("rejects an empty body before touching the database", async () => {
    const result = await submitComment({ postId: "post-1", content: "   " });
    expect(result.error).toBe("Write something before posting.");
    expect(fakeSupabase.current).toBeNull();
  });

  it("rejects a body over the limit, reporting the real length", async () => {
    const result = await submitComment({
      postId: "post-1",
      content: "a".repeat(COMMENT_MAX_CHARACTERS + 1),
    });
    expect(result.error).toContain(`${COMMENT_MAX_CHARACTERS + 1}`);
  });

  it("refuses a suspended account", async () => {
    mocks.requireNotSuspended.mockResolvedValue("Your account is currently suspended.");
    fakeSupabase.current = makeFakeSupabase({});

    const result = await submitComment({ postId: "post-1", content: "hello" });
    expect(result.error).toBe("Your account is currently suspended.");
  });

  it("stores the comment and notifies the post author", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({ data: POST, error: null }),
      profiles: queueResults({
        data: { username: "amara", full_name: "Amara Okafor", avatar_url: null },
        error: null,
      }),
      comments: commentsRoute({ data: INSERTED, error: null }),
    });
    adminSupabase.current = makeFakeSupabase({
      notifications: queueResults({ data: null, error: null }),
    });

    const result = await submitComment({ postId: "post-1", content: "  Considered point.  " });

    expect(result.error).toBeNull();
    const inserted = fakeSupabase.current!.builders.comments[0].insertedWith as Record<string, unknown>;
    // Stored normalized and as plain text -- no HTML pipeline.
    expect(inserted.content).toBe("Considered point.");
    expect(inserted.parent_id).toBeNull();
    expect(inserted.post_id).toBe("post-1");

    const notification = adminSupabase.current!.builders.notifications[0].insertedWith as Record<string, unknown>;
    expect(notification.type).toBe("comment");
    expect(notification.user_id).toBe("post-author");
    // The moderation queue deep-links to this anchor.
    expect(notification.link).toBe("/post/a-post#comments");
    expect(mocks.recordActivationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "comment_submitted" })
    );
  });

  it("does not notify anyone when you comment on your own post", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({ data: { ...POST, author_id: "user-1" }, error: null }),
      profiles: queueResults({ data: { username: "amara", full_name: null, avatar_url: null }, error: null }),
      comments: commentsRoute({ data: INSERTED, error: null }),
    });
    adminSupabase.current = makeFakeSupabase({});

    const result = await submitComment({ postId: "post-1", content: "Adding context." });

    expect(result.error).toBeNull();
    expect(adminSupabase.current!.builders.notifications).toBeUndefined();
    expect(mocks.sendUserEmail).not.toHaveBeenCalled();
  });

  it("rejects a parent comment that belongs to another post", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({ data: POST, error: null }),
      profiles: queueResults({ data: null, error: null }),
      comments: commentsRoute({ data: null, error: null }),
    });

    const result = await submitComment({
      postId: "post-1",
      content: "hi",
      parentId: "comment-from-elsewhere",
    });

    expect(result.error).toBe("Parent comment not found.");
  });

  it("attaches a reply-to-a-reply to the thread root instead of nesting deeper", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({ data: POST, error: null }),
      profiles: queueResults({ data: null, error: null }),
      comments: commentsRoute(
        // The parent being replied to is itself a reply.
        { data: { id: "reply-9", author_id: "replier", post_id: "post-1", parent_id: "root-1" }, error: null },
        { data: { ...INSERTED, parent_id: "root-1" }, error: null }
      ),
    });
    adminSupabase.current = makeFakeSupabase({
      notifications: queueResults({ data: null, error: null }),
    });

    const result = await submitComment({ postId: "post-1", content: "hi", parentId: "reply-9" });

    expect(result.error).toBeNull();
    const inserted = fakeSupabase.current!.builders.comments[1].insertedWith as Record<string, unknown>;
    expect(inserted.parent_id).toBe("root-1");
    // The person being answered is still the one told about it.
    const notification = adminSupabase.current!.builders.notifications[0].insertedWith as Record<string, unknown>;
    expect(notification.user_id).toBe("replier");
  });
});

describe("deleteComment", () => {
  it("hard-deletes a comment nobody replied to", async () => {
    fakeSupabase.current = makeFakeSupabase({
      comments: commentsRoute(
        { data: { id: "comment-1", author_id: "user-1", posts: { slug: "a-post" } }, error: null },
        { data: null, error: null, count: 0 } as never,
        { data: null, error: null }
      ),
    });

    const result = await deleteComment({ commentId: "comment-1" });

    expect(result.error).toBeNull();
    expect(result.tombstoned).toBe(false);
    expect(fakeSupabase.current!.builders.comments[2].delete).toHaveBeenCalled();
  });

  it("tombstones instead of deleting when replies would be cascaded away", async () => {
    fakeSupabase.current = makeFakeSupabase({
      comments: commentsRoute(
        { data: { id: "comment-1", author_id: "user-1", posts: { slug: "a-post" } }, error: null },
        { data: null, error: null, count: 2 } as never,
        { data: null, error: null }
      ),
    });

    const result = await deleteComment({ commentId: "comment-1" });

    expect(result.error).toBeNull();
    expect(result.tombstoned).toBe(true);
    // parent_id is ON DELETE CASCADE, so a real delete here would take two
    // other people's replies with it.
    expect(fakeSupabase.current!.builders.comments[2].delete).not.toHaveBeenCalled();
    expect(
      (fakeSupabase.current!.builders.comments[2].updatedWith as Record<string, unknown>).content
    ).toBe("[deleted]");
  });

  it("refuses to delete somebody else's comment", async () => {
    fakeSupabase.current = makeFakeSupabase({
      comments: commentsRoute({
        data: { id: "comment-1", author_id: "someone-else", posts: { slug: "a-post" } },
        error: null,
      }),
    });

    const result = await deleteComment({ commentId: "comment-1" });
    expect(result.error).toBe("You can only delete your own comment.");
  });
});
