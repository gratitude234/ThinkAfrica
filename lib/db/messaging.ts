import "server-only";

/**
 * The message thread's reads, and the unread badge's count.
 *
 * ## The rule this restores
 *
 * `MessageThread` polled two tables from the browser, filtered on a
 * `conversationId` that arrived in the URL. Membership was never checked by
 * the query: `conversation_participants` and `messages` are governed by
 * `is_conversation_participant()`, and that policy was the whole of the access
 * control. A direct connection has no policy and no `auth.uid()`, so
 * membership becomes an explicit predicate here.
 *
 * This is the one domain where getting it wrong is reading somebody else's
 * private correspondence, so every method takes the viewer and every statement
 * carries the membership check. `threadMessages` returns null rather than an
 * empty list when the viewer is not a participant, because "you are not in
 * this conversation" and "this conversation has no new messages" must not look
 * the same to the caller.
 *
 * ## No realtime
 *
 * The component polls every twelve seconds and keeps doing so. Replacing that
 * is out of scope for a read migration, and the polling shape is what makes
 * this migratable at all.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SqlExecutor } from "@/lib/db/postgres/executor";

// ── Shapes ───────────────────────────────────────────────────────────

export interface ThreadMessage {
  id: string;
  sender_id: string;
  content: string | null;
  created_at: string;
  deleted_at: string | null;
  edited_at: string | null;
}

export interface MessagingRepository {
  /**
   * Messages in this conversation newer than `since`, oldest first.
   *
   * Null means the viewer is not a participant. That is deliberately not an
   * empty array: the poller appends what it receives, and an empty array is a
   * normal, frequent answer.
   */
  threadMessages(input: {
    conversationId: string;
    viewerId: string;
    since: string;
  }): Promise<ThreadMessage[] | null>;
  /**
   * When the other participant last read the thread, for the read receipt.
   *
   * Only answered for a viewer who is themselves a participant.
   */
  otherLastReadAt(input: {
    conversationId: string;
    viewerId: string;
    otherUserId: string;
  }): Promise<string | null>;
  /** How many conversations have a message newer than this member read. */
  unreadConversationCount(viewerId: string): Promise<number>;
  readonly backend: "supabase" | "postgres";
}

// ── SQL ──────────────────────────────────────────────────────────────

/** The membership test, written once. It is the whole of the access control
 *  now that the policy is not applying it. */
const IS_PARTICIPANT = `
  exists (
    select 1 from public.conversation_participants member
    where member.conversation_id = $1::uuid
      and member.user_id = $2::uuid
  )`;

const MEMBERSHIP_SQL = `select ${IS_PARTICIPANT} as member`;

const MESSAGES_SQL = `
  select m.id, m.sender_id, m.content, m.created_at, m.deleted_at, m.edited_at
  from public.messages m
  where m.conversation_id = $1::uuid
    and m.created_at > $3::timestamptz
    and ${IS_PARTICIPANT}
  order by m.created_at asc
`;

const OTHER_READ_SQL = `
  select other.last_read_at
  from public.conversation_participants other
  where other.conversation_id = $1::uuid
    and other.user_id = $3::uuid
    and ${IS_PARTICIPANT}
`;

/**
 * The badge. The same shape the dashboard's read cursor uses, counted here
 * rather than returned, because the badge wants a number and the dashboard
 * wants the rows.
 *
 * A conversation with no message is not unread, and a participant who has
 * never read it is unread as soon as there is anything to read.
 */
const UNREAD_COUNT_SQL = `
  select count(*) as total
  from public.conversation_participants cp
  join public.conversations c on c.id = cp.conversation_id
  where cp.user_id = $1::uuid
    and c.last_message_at is not null
    and (cp.last_read_at is null or c.last_message_at > cp.last_read_at)
`;

// ── Supabase ─────────────────────────────────────────────────────────

export function createSupabaseMessagingRepository(
  supabase: SupabaseClient
): MessagingRepository {
  /** The policy answers this on this side, but the caller needs the same
   *  three-way answer from both backends. */
  async function isParticipant(conversationId: string, viewerId: string) {
    const { data, error } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", viewerId)
      .maybeSingle();
    if (error) throw new Error(`conversation membership: ${error.message}`);
    return data !== null;
  }

  return {
    backend: "supabase",

    async threadMessages({ conversationId, viewerId, since }) {
      if (!(await isParticipant(conversationId, viewerId))) return null;

      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_id, content, created_at, deleted_at, edited_at")
        .eq("conversation_id", conversationId)
        .gt("created_at", since)
        .order("created_at", { ascending: true });

      if (error) throw new Error(`thread messages: ${error.message}`);
      return (data ?? []) as ThreadMessage[];
    },

    async otherLastReadAt({ conversationId, viewerId, otherUserId }) {
      if (!(await isParticipant(conversationId, viewerId))) return null;

      const { data, error } = await supabase
        .from("conversation_participants")
        .select("last_read_at")
        .eq("conversation_id", conversationId)
        .eq("user_id", otherUserId)
        .maybeSingle();

      if (error) throw new Error(`read receipt: ${error.message}`);
      return (data?.last_read_at as string | null) ?? null;
    },

    async unreadConversationCount(viewerId) {
      const { data, error } = await supabase
        .from("conversation_participants")
        .select("last_read_at, conversations!inner(last_message_at)")
        .eq("user_id", viewerId);

      if (error) throw new Error(`unread conversations: ${error.message}`);

      return ((data ?? []) as Array<{
        last_read_at: string | null;
        conversations:
          | { last_message_at: string | null }
          | Array<{ last_message_at: string | null }>
          | null;
      }>).filter((row) => {
        const conversation = Array.isArray(row.conversations)
          ? row.conversations[0]
          : row.conversations;
        if (!conversation?.last_message_at) return false;
        if (row.last_read_at === null) return true;
        return (
          new Date(conversation.last_message_at).getTime() >
          new Date(row.last_read_at).getTime()
        );
      }).length;
    },
  };
}

// ── PostgreSQL ───────────────────────────────────────────────────────

export function createPostgresMessagingRepository(
  executor: SqlExecutor
): MessagingRepository {
  async function isParticipant(conversationId: string, viewerId: string) {
    const [row] = await executor.query<{ member: boolean }>(MEMBERSHIP_SQL, [
      conversationId,
      viewerId,
    ]);
    return row?.member === true;
  }

  return {
    backend: "postgres",

    async threadMessages({ conversationId, viewerId, since }) {
      if (!(await isParticipant(conversationId, viewerId))) return null;
      return executor.query<ThreadMessage>(MESSAGES_SQL, [
        conversationId,
        viewerId,
        since,
      ]);
    },

    async otherLastReadAt({ conversationId, viewerId, otherUserId }) {
      if (!(await isParticipant(conversationId, viewerId))) return null;
      const [row] = await executor.query<{ last_read_at: string | null }>(
        OTHER_READ_SQL,
        [conversationId, viewerId, otherUserId]
      );
      return row?.last_read_at ?? null;
    },

    async unreadConversationCount(viewerId) {
      const [row] = await executor.query<{ total: string | number }>(
        UNREAD_COUNT_SQL,
        [viewerId]
      );
      // count(*) is a bigint, which arrives as a string.
      return row ? Number(row.total) : 0;
    },
  };
}
