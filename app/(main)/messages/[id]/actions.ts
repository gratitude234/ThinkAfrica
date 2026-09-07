"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  escapeHtml,
  logEmailResult,
  sendUserEmail,
  type EmailSendResult,
} from "@/lib/email";
import { isBlockedPair } from "@/lib/blocking";
import { requireNotSuspended } from "@/lib/suspension";
import { logPushResult, sendPushNotification } from "@/lib/push";

const MESSAGE_EMAIL_COOLDOWN_MS = 30 * 60 * 1000;

type SendConversationMessageInput = {
  conversationId: string;
  content: string;
};

type SentMessage = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  deleted_at: string | null;
  edited_at: string | null;
};

type ParticipantRow = {
  user_id: string;
  last_email_notified_at: string | null;
};

type ProfileSummary = {
  username: string | null;
  full_name: string | null;
};

function displayName(profile: ProfileSummary | null) {
  return profile?.full_name?.trim() || profile?.username?.trim() || "An Indegenius member";
}

function excerpt(value: string, maxLength = 180) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function isEmailCooldownActive(lastEmailNotifiedAt: string | null) {
  if (!lastEmailNotifiedAt) return false;
  const lastNotifiedTime = new Date(lastEmailNotifiedAt).getTime();
  if (Number.isNaN(lastNotifiedTime)) return false;
  return Date.now() - lastNotifiedTime < MESSAGE_EMAIL_COOLDOWN_MS;
}

function shouldRecordEmailAttempt(result: EmailSendResult) {
  if (!("skipped" in result)) return true;
  return !["recipient_has_no_email", "recipient_preference_disabled"].includes(result.reason);
}

async function recordRecipientEmailAttempt(input: {
  conversationId: string;
  recipientId: string;
}) {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("conversation_participants")
      .update({ last_email_notified_at: new Date().toISOString() })
      .eq("conversation_id", input.conversationId)
      .eq("user_id", input.recipientId);

    if (error) {
      console.error(`Failed to record message email attempt: ${error.message}`);
    }
  } catch (error) {
    console.error(
      `Failed to record message email attempt: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export async function sendConversationMessage(
  input: SendConversationMessageInput
): Promise<{ error: string | null; message?: SentMessage }> {
  const content = input.content.trim();
  if (!content) return { error: "Message cannot be empty." };
  if (content.length > 2000) return { error: "Message cannot exceed 2000 characters." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to send messages." };
  }

  const { data: senderParticipant, error: participantError } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", input.conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (participantError) return { error: participantError.message };
  if (!senderParticipant) return { error: "You cannot send messages in this conversation." };

  const suspensionError = await requireNotSuspended(user.id);
  if (suspensionError) {
    return { error: suspensionError };
  }

  const [{ data: recipient }, { data: senderProfile }] = await Promise.all([
    supabase
      .from("conversation_participants")
      .select("user_id, last_email_notified_at")
      .eq("conversation_id", input.conversationId)
      .neq("user_id", user.id)
      .maybeSingle<ParticipantRow>(),
    supabase
      .from("profiles")
      .select("username, full_name")
      .eq("id", user.id)
      .maybeSingle<ProfileSummary>(),
  ]);

  if (recipient && (await isBlockedPair(user.id, recipient.user_id))) {
    return { error: "You cannot send messages in this conversation." };
  }

  const { data: message, error: messageError } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      sender_id: user.id,
      content,
    })
    .select("id, sender_id, content, created_at, deleted_at, edited_at")
    .single<SentMessage>();

  if (messageError) return { error: messageError.message };

  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", input.conversationId)
    .eq("user_id", user.id);

  if (recipient && !isEmailCooldownActive(recipient.last_email_notified_at)) {
    const senderName = displayName(senderProfile);
    const messagePreview = excerpt(content);
    const emailResult = await sendUserEmail({
      recipientId: recipient.user_id,
      subject: `${senderName} sent you a message on Indegenius`,
      preview: `${senderName} sent you a new message.`,
      title: "New message on Indegenius",
      intro: `${senderName} sent you a message. Open the conversation to reply.`,
      bodyHtml: `<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#4b5563;border-left:3px solid #10b981;padding-left:14px;">${escapeHtml(messagePreview)}</p>`,
      bodyTextLines: [`Message: ${messagePreview}`],
      ctaLabel: "Open conversation",
      ctaPath: `/messages/${input.conversationId}`,
      idempotencyKey: `message:${message.id}:${recipient.user_id}`,
      preferenceKey: "email_messages",
    });

    logEmailResult(`message:${message.id}:${recipient.user_id}`, emailResult);

    if (shouldRecordEmailAttempt(emailResult)) {
      await recordRecipientEmailAttempt({
        conversationId: input.conversationId,
        recipientId: recipient.user_id,
      });
    }
  }

  if (recipient) {
    const senderName = displayName(senderProfile);
    const pushResult = await sendPushNotification({
      recipientId: recipient.user_id,
      title: `${senderName} sent you a message`,
      body: excerpt(content),
      path: `/messages/${input.conversationId}`,
      preferenceKey: "push_messages",
    });
    logPushResult(`message:${message.id}:${recipient.user_id}`, pushResult);
  }

  return { error: null, message };
}

// ---------------------------------------------------------------------------
// Mutations migrated out of MessageThread
// ---------------------------------------------------------------------------

/**
 * Three writes used to leave the browser directly: marking a conversation
 * read, soft-deleting a message, and editing one. Each carried its own
 * predicate (`.eq("sender_id", currentUserId)`) built from a prop, and each
 * relied on RLS to refuse a conversation the viewer was not in.
 *
 * They are the same three operations here, with membership and ownership
 * established before the statement rather than alongside it. None of them
 * takes a user id: `currentUserId` was a prop, and a prop is something a
 * browser chooses.
 */

/** Membership is the gate for everything in a conversation. Asked once,
 *  the same way `sendConversationMessage` asks it. */
async function isConversationParticipant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[messages] participant lookup failed", error);
    return false;
  }
  return Boolean(data);
}

export async function markConversationRead(input: {
  conversationId: string;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  if (!(await isConversationParticipant(supabase, input.conversationId, user.id))) {
    // Same sentence whether the conversation is missing or not theirs: the
    // difference would let anyone probe for conversation ids.
    return { error: "You cannot read this conversation." };
  }

  const { error } = await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", input.conversationId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[messages] mark read failed", error);
    return { error: "Could not update this conversation." };
  }
  return { error: null };
}

/**
 * The row a mutation is about to touch, loaded before it is touched.
 *
 * Both the edit and the delete need the same three facts, and neither can get
 * them from a filtered update: `UPDATE ... WHERE id = $1 AND sender_id = $2`
 * cannot tell "someone else's message" from "no such message", and the
 * difference decides whether the caller is refused or told nothing happened.
 */
async function loadOwnMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  messageId: string,
  userId: string
): Promise<
  | { ok: true; message: { id: string; conversation_id: string; deleted_at: string | null } }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, deleted_at")
    .eq("id", messageId)
    .maybeSingle<{
      id: string;
      conversation_id: string;
      sender_id: string;
      deleted_at: string | null;
    }>();

  if (error) {
    console.error("[messages] message lookup failed", error);
    return { ok: false, error: "Could not load that message." };
  }
  if (!data || data.sender_id !== userId) {
    return { ok: false, error: "You cannot change that message." };
  }
  if (!(await isConversationParticipant(supabase, data.conversation_id, userId))) {
    // A sender who has since left the conversation does not keep write access
    // to what is now someone else's thread.
    return { ok: false, error: "You cannot change that message." };
  }

  return {
    ok: true,
    message: {
      id: data.id,
      conversation_id: data.conversation_id,
      deleted_at: data.deleted_at,
    },
  };
}

export async function deleteConversationMessage(input: {
  messageId: string;
}): Promise<{ error: string | null; deletedAt?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const loaded = await loadOwnMessage(supabase, input.messageId, user.id);
  if (!loaded.ok) return { error: loaded.error };
  if (loaded.message.deleted_at) {
    // Already gone. Reported as success so a double click is not an error.
    return { error: null, deletedAt: loaded.message.deleted_at };
  }

  const deletedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("messages")
    .update({ deleted_at: deletedAt })
    .eq("id", input.messageId)
    .eq("sender_id", user.id)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    console.error("[messages] delete failed", error);
    return { error: "Could not delete that message." };
  }
  if (((data ?? []) as unknown[]).length === 0) {
    return { error: "Could not delete that message." };
  }

  return { error: null, deletedAt };
}

export async function editConversationMessage(input: {
  messageId: string;
  content: string;
}): Promise<{ error: string | null; editedAt?: string }> {
  const content = input.content.trim();
  // The same bounds the insert path enforces, and the same bounds the column's
  // own CHECK enforces. Stated here so the failure is a sentence rather than a
  // constraint violation.
  if (!content) return { error: "Message cannot be empty." };
  if (content.length > 2000) return { error: "Message cannot exceed 2000 characters." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const loaded = await loadOwnMessage(supabase, input.messageId, user.id);
  if (!loaded.ok) return { error: loaded.error };
  if (loaded.message.deleted_at) {
    return { error: "That message has been deleted." };
  }

  const editedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("messages")
    .update({ content, edited_at: editedAt })
    .eq("id", input.messageId)
    .eq("sender_id", user.id)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    console.error("[messages] edit failed", error);
    return { error: "Could not save that edit." };
  }
  if (((data ?? []) as unknown[]).length === 0) {
    return { error: "Could not save that edit." };
  }

  return { error: null, editedAt };
}
