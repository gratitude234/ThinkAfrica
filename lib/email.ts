import "server-only";

import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

export type NotificationPreferenceKey =
  | "email_comments"
  | "email_follows"
  | "email_published"
  | "email_digest";

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

type UserEmailInput = {
  recipientId: string;
  subject: string;
  preview: string;
  title: string;
  intro: string;
  bodyHtml?: string;
  bodyTextLines?: string[];
  ctaLabel: string;
  ctaPath: string;
  idempotencyKey: string;
  preferenceKey?: NotificationPreferenceKey;
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
      : "https://www.thinkafrica.africa";

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
  intro: string;
  bodyHtml?: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  const preview = escapeHtml(input.preview);
  const title = escapeHtml(input.title);
  const intro = escapeHtml(input.intro);
  const ctaLabel = escapeHtml(input.ctaLabel);
  const ctaHref = escapeHtml(input.ctaHref);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
  </head>
  <body style="margin:0;background:#f6f7f5;color:#1f2937;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preview}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7f5;padding:28px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:22px 26px;border-bottom:1px solid #eef2f0;">
                <div style="font-size:18px;font-weight:700;color:#047857;">ThinkAfrica</div>
                <div style="margin-top:4px;font-size:12px;color:#6b7280;">Africa's intellectual network</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 26px 8px;">
                <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#111827;">${title}</h1>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;">${intro}</p>
                ${input.bodyHtml ?? ""}
                <div style="margin:28px 0 18px;">
                  <a href="${ctaHref}" style="display:inline-block;border-radius:10px;background:#047857;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 18px;">${ctaLabel}</a>
                </div>
                <p style="margin:0 0 18px;font-size:12px;line-height:1.6;color:#6b7280;">If the button does not work, open this link:<br><a href="${ctaHref}" style="color:#047857;">${ctaHref}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 26px;background:#f9fafb;border-top:1px solid #eef2f0;font-size:12px;line-height:1.6;color:#6b7280;">
                You are receiving this because you have a ThinkAfrica account. Manage email preferences in your notification settings.
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

    const ctaHref = absoluteUrl(input.ctaPath);
    const html = renderEmailShell({
      preview: input.preview,
      title: input.title,
      intro: input.intro,
      bodyHtml: input.bodyHtml,
      ctaLabel: input.ctaLabel,
      ctaHref,
    });
    const text = [
      input.title,
      "",
      input.intro,
      ...(input.bodyTextLines ?? []),
      "",
      `${input.ctaLabel}: ${ctaHref}`,
      "",
      "Manage email preferences in ThinkAfrica notification settings.",
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

export function logEmailResult(context: string, result: EmailSendResult) {
  if ("ok" in result && result.ok) return;
  if ("skipped" in result) {
    console.info(`Email skipped for ${context}: ${result.reason}`);
    return;
  }
  console.error(`Email failed for ${context}: ${result.error}`);
}
