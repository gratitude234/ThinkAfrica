import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeSupabase, queueResults } from "@/lib/testUtils/supabaseMock";

const { adminInsertMock, sendUserEmailMock, logEmailResultMock } = vi.hoisted(() => ({
  adminInsertMock: vi.fn(async (_payload: Record<string, unknown>) => ({
    error: null as { message: string } | null,
  })),
  sendUserEmailMock: vi.fn(async (_input: Record<string, unknown>) => ({
    ok: true,
    id: "email-1" as string | null,
  })),
  logEmailResultMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({ insert: adminInsertMock })),
  })),
}));

vi.mock("@/lib/email", () => ({
  sendUserEmail: sendUserEmailMock,
  logEmailResult: logEmailResultMock,
}));

import { notifyResponseParentAuthor, validateResponseParent } from "./responsePost";

function fakeSupabaseWithParent(parent: Record<string, unknown> | null) {
  return makeFakeSupabase({
    posts: queueResults({ data: parent, error: null }),
  });
}

describe("validateResponseParent", () => {
  it("rejects a post claiming itself as its own parent, without querying the database", async () => {
    const supabase = fakeSupabaseWithParent(null);

    const result = await validateResponseParent(supabase as never, "post-1", "post-1");

    expect(result).toEqual({
      parent: null,
      error: "A post can't be a response to itself.",
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects a missing/unavailable parent with a clear, safe error", async () => {
    const supabase = fakeSupabaseWithParent(null);

    const result = await validateResponseParent(supabase as never, "missing-id", null);

    expect(result.parent).toBeNull();
    expect(result.error).toBe("That post is no longer available to respond to.");
  });

  it("accepts a currently-published parent and returns the server-read record", async () => {
    const parentRow = {
      id: "parent-1",
      author_id: "author-1",
      slug: "parent-slug",
      title: "A real title",
      content_kind: "article",
      article_format: null,
      type: "essay",
    };
    const supabase = fakeSupabaseWithParent(parentRow);

    const result = await validateResponseParent(supabase as never, "parent-1", "response-1");

    expect(result.error).toBeNull();
    expect(result.parent).toEqual(parentRow);
  });

  it("filters the query to status = published, so a draft/removed/pending parent is never matched", async () => {
    const supabase = fakeSupabaseWithParent(null);

    await validateResponseParent(supabase as never, "some-id", null);

    const postsBuilder = supabase.builders.posts[0];
    expect(postsBuilder.eq).toHaveBeenCalledWith("status", "published");
  });
});

describe("notifyResponseParentAuthor", () => {
  const parent = {
    id: "parent-1",
    author_id: "parent-author",
    slug: "parent-slug",
    title: "A real title",
  };

  beforeEach(() => {
    adminInsertMock.mockClear();
    sendUserEmailMock.mockClear();
    logEmailResultMock.mockClear();
  });

  it("notifies and emails the parent author for a response by someone else", async () => {
    await notifyResponseParentAuthor({
      parent,
      responderId: "responder-1",
      responderName: "A Responder",
      responsePostId: "response-1",
      responseSlug: "response-slug",
    });

    expect(adminInsertMock).toHaveBeenCalledTimes(1);
    const insertedNotification = adminInsertMock.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(insertedNotification).toMatchObject({
      user_id: "parent-author",
      type: "response_post",
      actor_id: "responder-1",
      post_id: "response-1",
      link: "/post/response-slug",
    });
    expect(insertedNotification?.message).not.toContain("null");

    expect(sendUserEmailMock).toHaveBeenCalledTimes(1);
    const emailInput = sendUserEmailMock.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(emailInput?.recipientId).toBe("parent-author");
    expect(emailInput?.preferenceKey).toBe("email_responses");
    expect(emailInput?.idempotencyKey).toBe("response-post:response-1:parent-author");
    expect(emailInput?.intro).not.toContain("null");
  });

  it("does not notify or email when the responder is the parent's own author (self-response)", async () => {
    await notifyResponseParentAuthor({
      parent: { ...parent, author_id: "same-user" },
      responderId: "same-user",
      responderName: "Same User",
      responsePostId: "response-1",
      responseSlug: "response-slug",
    });

    expect(adminInsertMock).not.toHaveBeenCalled();
    expect(sendUserEmailMock).not.toHaveBeenCalled();
  });

  it("does not email when the notification insert fails (no duplicate/partial send)", async () => {
    adminInsertMock.mockResolvedValueOnce({ error: { message: "insert failed" } });

    await notifyResponseParentAuthor({
      parent,
      responderId: "responder-1",
      responderName: "A Responder",
      responsePostId: "response-1",
      responseSlug: "response-slug",
    });

    expect(sendUserEmailMock).not.toHaveBeenCalled();
  });

  it("never exposes a nullable title -- falls back to a quoted 'your post' for a titleless parent", async () => {
    await notifyResponseParentAuthor({
      parent: { ...parent, title: null },
      responderId: "responder-1",
      responderName: "A Responder",
      responsePostId: "response-1",
      responseSlug: "response-slug",
    });

    const emailInput = sendUserEmailMock.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(emailInput?.intro).toContain("your post");
    expect(emailInput?.intro).not.toContain("null");
  });
});
