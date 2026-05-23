"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  escapeHtml,
  logEmailResult,
  sendUserEmail,
  type EmailSendResult,
} from "@/lib/email";

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
  return profile?.full_name?.trim() || profile?.username?.trim() || "A ThinkAfrica member";
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
      subject: `${senderName} sent you a message on ThinkAfrica`,
      preview: `${senderName} sent you a new message.`,
      title: "New message on ThinkAfrica",
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

  return { error: null, message };
}
