import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Conversation membership and message ownership, now that MessageThread no
 * longer decides either.
 *
 * The three writes this covers used to run in the browser with
 * `.eq("sender_id", currentUserId)` built from a prop. RLS is what made a
 * forged prop harmless; on a direct PostgreSQL connection nothing would.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/email", () => ({
  escapeHtml: (value: string) => value,
  logEmailResult: vi.fn(),
  sendUserEmail: vi.fn(),
}));
vi.mock("@/lib/blocking", () => ({ isBlockedPair: async () => false }));
vi.mock("@/lib/suspension", () => ({ requireNotSuspended: async () => null }));
vi.mock("@/lib/push", () => ({
  logPushResult: vi.fn(),
  sendPushNotification: vi.fn(),
}));

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  deleted_at: string | null;
}

const state = {
  user: null as { id: string } | null,
  participants: [] as Array<{ conversation_id: string; user_id: string }>,
  messages: [] as MessageRow[],
  writes: [] as Array<{ table: string; patch: Record<string, unknown>; filters: Record<string, unknown> }>,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from(table: string) {
      let patch: Record<string, unknown> | null = null;
      const filters: Record<string, unknown> = {};
      let nullFilter: string | null = null;

      function rows() {
        if (table === "conversation_participants") {
          return state.participants.filter(
            (row) =>
              (filters.conversation_id === undefined ||
                row.conversation_id === filters.conversation_id) &&
              (filters.user_id === undefined || row.user_id === filters.user_id)
          );
        }
        return state.messages.filter(
          (row) =>
            (filters.id === undefined || row.id === filters.id) &&
            (filters.sender_id === undefined || row.sender_id === filters.sender_id) &&
            (nullFilter !== "deleted_at" || row.deleted_at === null)
        );
      }

      const builder = {
        select: () => builder,
        update(value: Record<string, unknown>) {
          patch = value;
          return builder;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        is(column: string, value: unknown) {
          if (value === null) nullFilter = column;
          return builder;
        },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then(
          onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) {
          const matched = rows();
          if (patch) {
            state.writes.push({ table, patch, filters: { ...filters } });
          }
          return Promise.resolve({ data: matched, error: null }).then(
            onFulfilled,
            onRejected
          );
        },
      };
      return builder as never;
    },
  }),
}));

const { markConversationRead, deleteConversationMessage, editConversationMessage } =
  await import("@/app/(main)/messages/[id]/actions");

const CONVERSATION = "conversation-1";

beforeEach(() => {
  state.user = { id: "member-a" };
  state.participants = [
    { conversation_id: CONVERSATION, user_id: "member-a" },
    { conversation_id: CONVERSATION, user_id: "member-b" },
  ];
  state.messages = [
    {
      id: "message-1",
      conversation_id: CONVERSATION,
      sender_id: "member-a",
      deleted_at: null,
    },
    {
      id: "message-2",
      conversation_id: CONVERSATION,
      sender_id: "member-b",
      deleted_at: null,
    },
  ];
  state.writes = [];
});

describe("markConversationRead", () => {
  it("marks the viewer's own participation row", async () => {
    const result = await markConversationRead({ conversationId: CONVERSATION });

    expect(result).toEqual({ error: null });
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].filters).toEqual({
      conversation_id: CONVERSATION,
      user_id: "member-a",
    });
  });

  it("refuses a conversation the viewer is not in", async () => {
    state.participants = [{ conversation_id: CONVERSATION, user_id: "member-b" }];

    const result = await markConversationRead({ conversationId: CONVERSATION });

    expect(result).toEqual({ error: "You cannot read this conversation." });
    expect(state.writes).toEqual([]);
  });

  it("gives the same answer for a conversation that does not exist", async () => {
    // Otherwise the endpoint is an oracle for which conversation ids are real.
    const result = await markConversationRead({ conversationId: "no-such-thing" });
    expect(result).toEqual({ error: "You cannot read this conversation." });
  });

  it("refuses a signed-out caller", async () => {
    state.user = null;
    const result = await markConversationRead({ conversationId: CONVERSATION });
    expect(result).toEqual({ error: "You must be signed in." });
    expect(state.writes).toEqual([]);
  });
});

describe("deleteConversationMessage", () => {
  it("lets a sender delete their own message", async () => {
    const result = await deleteConversationMessage({ messageId: "message-1" });

    expect(result.error).toBeNull();
    expect(result.deletedAt).toEqual(expect.any(String));
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].filters.sender_id).toBe("member-a");
  });

  it("refuses a message sent by someone else", async () => {
    const result = await deleteConversationMessage({ messageId: "message-2" });

    expect(result).toEqual({ error: "You cannot change that message." });
    expect(state.writes).toEqual([]);
  });

  it("refuses a sender who has left the conversation", async () => {
    // Having written a message once does not keep write access to what is now
    // someone else's thread.
    state.participants = [{ conversation_id: CONVERSATION, user_id: "member-b" }];

    const result = await deleteConversationMessage({ messageId: "message-1" });

    expect(result).toEqual({ error: "You cannot change that message." });
    expect(state.writes).toEqual([]);
  });

  it("treats a second delete as already done rather than as an error", async () => {
    state.messages[0].deleted_at = "2026-09-01T00:00:00.000Z";

    const result = await deleteConversationMessage({ messageId: "message-1" });

    expect(result).toEqual({
      error: null,
      deletedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(state.writes).toEqual([]);
  });

  it("refuses a signed-out caller", async () => {
    state.user = null;
    expect(await deleteConversationMessage({ messageId: "message-1" })).toEqual({
      error: "You must be signed in.",
    });
  });
});

describe("editConversationMessage", () => {
  it("lets a sender edit their own message", async () => {
    const result = await editConversationMessage({
      messageId: "message-1",
      content: "A revised sentence.",
    });

    expect(result.error).toBeNull();
    expect(state.writes[0].patch.content).toBe("A revised sentence.");
    expect(state.writes[0].patch.edited_at).toEqual(expect.any(String));
  });

  it("refuses a message sent by someone else", async () => {
    const result = await editConversationMessage({
      messageId: "message-2",
      content: "Words I did not write.",
    });

    expect(result).toEqual({ error: "You cannot change that message." });
    expect(state.writes).toEqual([]);
  });

  it("enforces the same bounds the insert path does", async () => {
    expect(
      await editConversationMessage({ messageId: "message-1", content: "   " })
    ).toEqual({ error: "Message cannot be empty." });

    expect(
      await editConversationMessage({
        messageId: "message-1",
        content: "x".repeat(2001),
      })
    ).toEqual({ error: "Message cannot exceed 2000 characters." });

    expect(state.writes).toEqual([]);
  });

  it("will not resurrect a deleted message", async () => {
    state.messages[0].deleted_at = "2026-09-01T00:00:00.000Z";

    const result = await editConversationMessage({
      messageId: "message-1",
      content: "Back from the dead.",
    });

    expect(result).toEqual({ error: "That message has been deleted." });
    expect(state.writes).toEqual([]);
  });
});
