import "server-only";

import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";
import { BRAND_PROMISE, BRAND_TAGLINE } from "@/lib/brand";
import {
  emailSenderReplyTo,
  formatEmailSenderFrom,
  resolveEmailSender,
  type EmailSenderKey,
} from "@/lib/emailSenders";
import { escapeHtml, renderEmailShell } from "@/lib/emailShell";

// Re-exported so every existing caller keeps importing these from "@/lib/email".
export { escapeHtml, renderEmailShell };

export type NotificationPreferenceKey =
  | "email_comments"
  | "email_follows"
  | "email_likes"
  | "email_responses"
  | "email_messages"
  | "email_published"
  | "email_digest"
  | "email_account_security"
  | "email_profile_reminders"
  | "email_announcements"
  | "email_review_assigned"
  | "email_review_started"
  | "email_review_reminder"
  | "email_co_author_invite"
  | "email_co_author_accepted"
  | "email_co_author_declined"
  | "email_opportunity_inquiry"
  | "email_author_publications"
  | "email_debate_updates";

export type EmailSendResult =
  | { ok: true; id: string | null }
  | { skipped: true; reason: string }
  | { ok: false; error: string };

type EmailRecipient = {
  id: string;
  email: string;
  displayName: string;
  notificationPrefs: Record<string, unknown>;
  lastCommentEmailNotifiedAt: string | null;
};

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  sender?: EmailSenderKey;
};

type UserEmailInput = {
  recipientId: string;
  subject: string;
  preview: string;
  title: string;
  intro?: string;
  bodyHtml?: string;
  bodyTextLines?: string[];
  ctaLabel?: string;
  ctaPath?: string;
  footerNote?: string;
  idempotencyKey: string;
  preferenceKey?: NotificationPreferenceKey;
  cooldownMs?: number;
  sender?: EmailSenderKey;
};

type DirectEmailInput = Omit<UserEmailInput, "recipientId" | "preferenceKey"> & {
  to: string;
};

let resendClient: Resend | null = null;

function getResendClient() {
  if (!process.env.RESEND_API_KEY) return null;
  resendClient ??= new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

export function getAppUrl() {
  const configuredUrl = process.env.EMAIL_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  const emailUrl =
    configuredUrl && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(configuredUrl)
      ? configuredUrl
      // TODO(gratitude): confirm production domain — SITE_URL is a placeholder until then.
      : SITE_URL;

  return emailUrl.replace(/\/+$/, "");
}

export function absoluteUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${getAppUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function preferenceEnabled(
  prefs: Record<string, unknown>,
  preferenceKey?: NotificationPreferenceKey
) {
  if (!preferenceKey) return true;
  return prefs[preferenceKey] !== false;
}

export async function sendEmail(input: SendEmailInput): Promise<EmailSendResult> {
  const resend = getResendClient();

  if (!resend) {
    return { skipped: true, reason: "missing_email_configuration" };
  }

  const sender = resolveEmailSender(input.sender);
  const from = formatEmailSenderFrom(sender);
  const replyTo = emailSenderReplyTo(sender);

  try {
    const { data, error } = await resend.emails.send(
      {
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(replyTo ? { replyTo } : {}),
      },
      {
        headers: {
          "Idempotency-Key": input.idempotencyKey,
        },
      }
    );

    if (error) {
      return {
        ok: false,
        error:
          typeof error === "object" && "message" in error
            ? String(error.message)
            : String(error),
      };
    }

    return { ok: true, id: data?.id ?? null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown email send failure.",
    };
  }
}

export async function getEmailRecipient(userId: string): Promise<EmailRecipient | null> {
  const admin = createAdminClient();
  const [{ data: profile, error: profileError }, { data: userData, error: userError }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, username, signup_email, notification_prefs, last_comment_email_notified_at")
        .eq("id", userId)
        .maybeSingle(),
      admin.auth.admin.getUserById(userId),
    ]);

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (userError) {
    throw new Error(userError.message);
  }

  const email = userData.user?.email ?? profile?.signup_email ?? null;
  if (!email) return null;

  const displayName =
    profile?.full_name?.trim() || profile?.username?.trim() || email.split("@")[0];

  return {
    id: userId,
    email,
    displayName,
    notificationPrefs: isRecord(profile?.notification_prefs)
      ? profile.notification_prefs
      : {},
    lastCommentEmailNotifiedAt:
      (profile?.last_comment_email_notified_at as string | null) ?? null,
  };
}

export async function sendUserEmail(input: UserEmailInput): Promise<EmailSendResult> {
  try {
    const recipient = await getEmailRecipient(input.recipientId);
    if (!recipient) {
      return { skipped: true, reason: "recipient_has_no_email" };
    }

    if (!preferenceEnabled(recipient.notificationPrefs, input.preferenceKey)) {
      return { skipped: true, reason: "recipient_preference_disabled" };
    }

    if (input.cooldownMs && recipient.lastCommentEmailNotifiedAt) {
      const elapsed = Date.now() - new Date(recipient.lastCommentEmailNotifiedAt).getTime();
      if (!Number.isNaN(elapsed) && elapsed < input.cooldownMs) {
        return { skipped: true, reason: "cooldown_active" };
      }
    }

    const sender = resolveEmailSender(input.sender);
    const ctaHref = input.ctaPath ? absoluteUrl(input.ctaPath) : undefined;
    const html = renderEmailShell({
      preview: input.preview,
      title: input.title,
      intro: input.intro,
      bodyHtml: input.bodyHtml,
      ctaLabel: input.ctaLabel,
      ctaHref,
      footerNote: input.footerNote,
      sender: input.sender,
    });
    const text = [
      input.title,
      "",
      ...(input.intro ? [input.intro] : []),
      ...(input.bodyTextLines ?? []),
      ...(input.ctaLabel && ctaHref ? ["", `${input.ctaLabel}: ${ctaHref}`] : []),
      "",
      BRAND_PROMISE,
      BRAND_TAGLINE,
      "",
      input.footerNote ?? sender.footerNote,
    ].join("\n");

    const result = await sendEmail({
      to: recipient.email,
      subject: input.subject,
      html,
      text,
      idempotencyKey: input.idempotencyKey,
      sender: input.sender,
    });

    if (input.cooldownMs && "ok" in result && result.ok) {
      await createAdminClient()
        .from("profiles")
        .update({ last_comment_email_notified_at: new Date().toISOString() })
        .eq("id", input.recipientId);
    }

    return result;
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to prepare recipient email.",
    };
  }
}

export async function sendDirectEmail(input: DirectEmailInput): Promise<EmailSendResult> {
  const normalizedEmail = input.to.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { skipped: true, reason: "invalid_email_address" };
  }

  const sender = resolveEmailSender(input.sender);
  const ctaHref = input.ctaPath ? absoluteUrl(input.ctaPath) : undefined;
  const html = renderEmailShell({
    preview: input.preview,
    title: input.title,
    intro: input.intro,
    bodyHtml: input.bodyHtml,
    ctaLabel: input.ctaLabel,
    ctaHref,
    footerNote: input.footerNote,
    sender: input.sender,
  });
  const text = [
    input.title,
    "",
    ...(input.intro ? [input.intro] : []),
    ...(input.bodyTextLines ?? []),
    ...(input.ctaLabel && ctaHref ? ["", `${input.ctaLabel}: ${ctaHref}`] : []),
    "",
    BRAND_PROMISE,
    BRAND_TAGLINE,
    "",
    input.footerNote ?? sender.footerNote,
  ].join("\n");

  return sendEmail({
    to: normalizedEmail,
    subject: input.subject,
    html,
    text,
    idempotencyKey: input.idempotencyKey,
    sender: input.sender,
  });
}

export function logEmailResult(context: string, result: EmailSendResult) {
  if ("ok" in result && result.ok) return;
  if ("skipped" in result) {
    console.info(`Email skipped for ${context}: ${result.reason}`);
    return;
  }
  console.error(`Email failed for ${context}: ${result.error}`);
}
