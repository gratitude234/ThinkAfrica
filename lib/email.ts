import "server-only";

import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";

export type NotificationPreferenceKey =
  | "email_comments"
  | "email_follows"
  | "email_likes"
  | "email_responses"
  | "email_messages"
  | "email_published"
  | "email_digest"
  | "email_account_security"
  | "email_profile_reminders";

export type EmailSendResult =
  | { ok: true; id: string | null }
  | { skipped: true; reason: string }
  | { ok: false; error: string };

type EmailRecipient = {
  id: string;
  email: string;
  displayName: string;
  notificationPrefs: Record<string, unknown>;
};

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

const DEFAULT_FOOTER_NOTE =
  "You are receiving this because you have an Indegenius account. Manage email preferences in your notification settings.";

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

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

export function renderEmailShell(input: {
  preview: string;
  title: string;
  intro?: string;
  bodyHtml?: string;
  ctaLabel?: string;
  ctaHref?: string;
  footerNote?: string;
}) {
  const preview = escapeHtml(input.preview);
  const title = escapeHtml(input.title);
  const introHtml = input.intro
    ? `<p class="email-text" style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">${escapeHtml(input.intro)}</p>`
    : "";
  const footerNote = escapeHtml(input.footerNote ?? DEFAULT_FOOTER_NOTE);
  const ctaHtml =
    input.ctaLabel && input.ctaHref
      ? `<div style="margin:28px 0 18px;">
                  <a href="${escapeHtml(input.ctaHref)}" style="display:inline-block;border-radius:10px;background:#073929;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 18px;">${escapeHtml(input.ctaLabel)}</a>
                </div>
                <p class="email-muted" style="margin:0 0 18px;font-size:12px;line-height:1.6;color:#6b7280;">If the button does not work, open this link:<br><a href="${escapeHtml(input.ctaHref)}" style="color:#073929;">${escapeHtml(input.ctaHref)}</a></p>`
      : "";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${title}</title>
    <style>
      @media (prefers-color-scheme: dark) {
        .email-bg { background-color: #101613 !important; }
        .email-card { background-color: #171d1a !important; border-color: #2a332e !important; }
        .email-title { color: #f3f4f6 !important; }
        .email-text { color: #d1d5db !important; }
        .email-muted { color: #9ca3af !important; }
        .email-footer { background-color: #131815 !important; border-color: #2a332e !important; }
        .code-box { background-color: #0d1f16 !important; border-color: #234b36 !important; }
        .code-text { color: #7fe0b3 !important; }
      }
    </style>
  </head>
  <body class="email-bg" style="margin:0;background:#f6f7f5;color:#1f2937;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preview}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="email-bg" style="background:#f6f7f5;padding:28px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="email-card" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:22px 26px;border-bottom:1px solid #eef2f0;">
                <div style="font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;color:#073929;">Indegenius</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 26px 8px;">
                <h1 class="email-title" style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#111827;">${title}</h1>
                ${introHtml}
                ${input.bodyHtml ?? ""}
                ${ctaHtml}
              </td>
            </tr>
            <tr>
              <td class="email-footer" style="padding:18px 26px;background:#f9fafb;border-top:1px solid #eef2f0;font-size:12px;line-height:1.6;color:#6b7280;">
                ${footerNote}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendEmail(input: SendEmailInput): Promise<EmailSendResult> {
  const resend = getResendClient();
  const from = process.env.EMAIL_FROM;

  if (!resend || !from) {
    return { skipped: true, reason: "missing_email_configuration" };
  }

  try {
    const { data, error } = await resend.emails.send(
      {
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
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
        .select("id, full_name, username, signup_email, notification_prefs")
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

    const ctaHref = input.ctaPath ? absoluteUrl(input.ctaPath) : undefined;
    const html = renderEmailShell({
      preview: input.preview,
      title: input.title,
      intro: input.intro,
      bodyHtml: input.bodyHtml,
      ctaLabel: input.ctaLabel,
      ctaHref,
      footerNote: input.footerNote,
    });
    const text = [
      input.title,
      "",
      ...(input.intro ? [input.intro] : []),
      ...(input.bodyTextLines ?? []),
      ...(input.ctaLabel && ctaHref ? ["", `${input.ctaLabel}: ${ctaHref}`] : []),
      "",
      input.footerNote ?? "Manage email preferences in Indegenius notification settings.",
    ].join("\n");

    return sendEmail({
      to: recipient.email,
      subject: input.subject,
      html,
      text,
      idempotencyKey: input.idempotencyKey,
    });
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

  const ctaHref = input.ctaPath ? absoluteUrl(input.ctaPath) : undefined;
  const html = renderEmailShell({
    preview: input.preview,
    title: input.title,
    intro: input.intro,
    bodyHtml: input.bodyHtml,
    ctaLabel: input.ctaLabel,
    ctaHref,
    footerNote: input.footerNote,
  });
  const text = [
    input.title,
    "",
    ...(input.intro ? [input.intro] : []),
    ...(input.bodyTextLines ?? []),
    ...(input.ctaLabel && ctaHref ? ["", `${input.ctaLabel}: ${ctaHref}`] : []),
    "",
    input.footerNote ?? "Manage email preferences in Indegenius notification settings.",
  ].join("\n");

  return sendEmail({
    to: normalizedEmail,
    subject: input.subject,
    html,
    text,
    idempotencyKey: input.idempotencyKey,
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
