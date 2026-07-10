"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  escapeHtml,
  logEmailResult,
  sendDirectEmail,
  sendUserEmail,
} from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import { isAlreadyRegisteredAuthError } from "./authMessages";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function getAuthCallbackUrl(nextPath: string) {
  const configuredUrl = process.env.EMAIL_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  const appUrl =
    configuredUrl && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(configuredUrl)
      ? configuredUrl
      // TODO(gratitude): confirm production domain — SITE_URL is a placeholder until then.
      : SITE_URL;

  const url = new URL("/auth/callback", appUrl.replace(/\/+$/, ""));
  url.searchParams.set("next", nextPath);
  return url.toString();
}

function getAuthConfirmUrl(input: {
  tokenHash: string;
  type: EmailOtpType;
  nextPath: string;
}) {
  const configuredUrl = process.env.EMAIL_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  const appUrl =
    configuredUrl && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(configuredUrl)
      ? configuredUrl
      // TODO(gratitude): confirm production domain — SITE_URL is a placeholder until then.
      : SITE_URL;

  const url = new URL("/auth/confirm", appUrl.replace(/\/+$/, ""));
  url.searchParams.set("token_hash", input.tokenHash);
  url.searchParams.set("type", input.type);
  url.searchParams.set("next", input.nextPath);
  return url.toString();
}

function getSafeAuthActionLink(actionLink: string, nextPath: string) {
  const callbackUrl = getAuthCallbackUrl(nextPath);

  try {
    const url = new URL(actionLink);
    const redirectTo = url.searchParams.get("redirect_to");

    if (
      !redirectTo ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i.test(redirectTo)
    ) {
      url.searchParams.set("redirect_to", callbackUrl);
    }

    return url.toString();
  } catch {
    return actionLink;
  }
}

function getEmailErrorMessage(error: unknown) {
  if (!error) return "Unable to send email.";
  return error instanceof Error ? error.message : String(error);
}

function isUnknownRecoveryRecipient(error: unknown) {
  const message = getEmailErrorMessage(error).toLowerCase();
  return (
    message.includes("user not found") ||
    message.includes("not found") ||
    message.includes("does not exist")
  );
}

type ConfirmationType = Extract<EmailOtpType, "signup" | "magiclink">;

function getConfirmationTypeFromLink(type: "signup" | "magiclink"): ConfirmationType {
  return type;
}

// Supabase Auth's "Email OTP expiration" is a project-level dashboard
// setting (like sender name and OTP length), not something generateLink()
// returns, so this can't be pulled dynamically. Keep this in sync by hand
// if that setting ever changes.
const OTP_EXPIRY_LABEL = "1 hour";

function renderCodeBoxHtml(code: string) {
  const escapedCode = escapeHtml(code);
  return `
    <div class="code-box" style="margin:0 0 16px;border:1px solid #bcdfcb;background:#eaf6ef;border-radius:12px;padding:22px;text-align:center;">
      <div class="code-text" style="font-size:34px;line-height:1.2;letter-spacing:10px;font-weight:800;color:#073929;font-family:Arial,Helvetica,sans-serif;">${escapedCode}</div>
    </div>
  `;
}

function renderConfirmationCodeHtml(code: string) {
  return `
    ${renderCodeBoxHtml(code)}
    <p class="email-text" style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#374151;text-align:center;">Enter this code to confirm your account.</p>
    <p class="email-muted" style="margin:0 0 18px;font-size:12px;line-height:1.5;color:#6b7280;text-align:center;">Expires in ${OTP_EXPIRY_LABEL}.</p>
  `;
}

function renderPasswordResetCodeHtml(code: string) {
  return `
    ${renderCodeBoxHtml(code)}
    <p class="email-text" style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#374151;text-align:center;">Enter this code to reset your password, or use the button below.</p>
    <p class="email-muted" style="margin:0 0 18px;font-size:12px;line-height:1.5;color:#6b7280;text-align:center;">Expires in ${OTP_EXPIRY_LABEL}.</p>
  `;
}

async function sendGeneratedConfirmationEmail(input: {
  email: string;
  fullName?: string | null;
  password?: string;
  linkType: "signup" | "magiclink";
}) {
  const admin = createAdminClient();
  const linkOptions = {
    options: {
      data: {
        full_name: input.fullName?.trim() ?? "",
      },
      redirectTo: getAuthCallbackUrl("/onboarding"),
    },
  };

  let effectiveType: "signup" | "magiclink" = input.linkType;
  let { data, error } =
    effectiveType === "signup"
      ? await admin.auth.admin.generateLink({
          type: "signup",
          email: input.email,
          password: input.password ?? "",
          ...linkOptions,
        })
      : await admin.auth.admin.generateLink({
          type: "magiclink",
          email: input.email,
          ...linkOptions,
        });

  // A previous attempt for this email may have already created the account,
  // e.g. the client gave up waiting on a slow response even though the
  // server finished the job. The Admin API's "signup" link type treats an
  // existing unconfirmed user as an error instead of just reissuing a code
  // the way client-side signUp() does, so fall back to a magic link, which
  // works for any existing account and reissues a fresh code without
  // touching the password already on file.
  if (error && effectiveType === "signup" && isAlreadyRegisteredAuthError(error.message)) {
    effectiveType = "magiclink";
    ({ data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: input.email,
      ...linkOptions,
    }));
  }

  if (error) {
    return { ok: false, error: error.message } as const;
  }

  const emailOtp = data.properties?.email_otp;
  if (!emailOtp) {
    return { ok: false, error: "Unable to create confirmation code." } as const;
  }

  const verificationType = getConfirmationTypeFromLink(effectiveType);

  const result = await sendDirectEmail({
    to: input.email,
    subject: "Confirm your Indegenius account",
    preview: `Your Indegenius code: ${emailOtp}. Use it to confirm your account.`,
    title: "Confirm your account",
    bodyHtml: renderConfirmationCodeHtml(emailOtp),
    bodyTextLines: [
      `Verification code: ${emailOtp}`,
      "Enter this code to confirm your account.",
      `Expires in ${OTP_EXPIRY_LABEL}.`,
    ],
    footerNote: "Didn't request this? You can ignore this email.",
    idempotencyKey: `signup-confirm:${input.email}:${emailOtp}`,
  });

  logEmailResult(`signup_confirm:${input.email}`, result);
  if ("ok" in result && result.ok) {
    return { ok: true, type: verificationType } as const;
  }
  if ("skipped" in result) {
    return { ok: false, error: "Email delivery is not configured." } as const;
  }
  return { ok: false, error: result.error } as const;
}

export async function sendSignupConfirmationEmail(input: {
  email: string;
  password: string;
  fullName?: string | null;
}) {
  const email = normalizeEmail(input.email);
  const fullName = input.fullName?.trim() ?? "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Add a valid email address." } as const;
  }

  try {
    return await sendGeneratedConfirmationEmail({
      email,
      password: input.password,
      fullName,
      linkType: "signup",
    });
  } catch (error) {
    return { ok: false, error: getEmailErrorMessage(error) } as const;
  }
}

export async function resendSignupConfirmationEmail(input: {
  email: string;
  fullName?: string | null;
}) {
  const email = normalizeEmail(input.email);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Add a valid email address." } as const;
  }

  // Every real caller only shows a "resend" affordance once an account is
  // already known to exist (signup's already-registered banner, login's
  // email-not-confirmed banner), so this never needs to create anything,
  // just reissue a fresh code without touching the password on file.
  try {
    return await sendGeneratedConfirmationEmail({
      email,
      fullName: input.fullName,
      linkType: "magiclink",
    });
  } catch (error) {
    return { ok: false, error: getEmailErrorMessage(error) } as const;
  }
}

export async function sendPasswordResetEmail(input: { email: string }) {
  const email = normalizeEmail(input.email);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Add a valid email address." } as const;
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: getAuthCallbackUrl("/reset-password"),
      },
    });

    if (error) {
      if (isUnknownRecoveryRecipient(error)) {
        logEmailResult(`password_reset:${email}`, {
          skipped: true,
          reason: "recipient_not_found",
        });
        return { ok: true, type: "recovery" } as const;
      }
      return { ok: false, error: error.message } as const;
    }

    const actionLink = data.properties?.action_link;
    const emailOtp = data.properties?.email_otp;
    if (!actionLink || !emailOtp) {
      return { ok: false, error: "Unable to create reset code." } as const;
    }
    const safeActionLink = data.properties.hashed_token
      ? getAuthConfirmUrl({
          tokenHash: data.properties.hashed_token,
          type: "recovery",
          nextPath: "/reset-password",
        })
      : getSafeAuthActionLink(actionLink, "/reset-password");

    const result = await sendDirectEmail({
      to: email,
      subject: "Reset your Indegenius password",
      preview: `Your Indegenius reset code: ${emailOtp}. Use it to reset your password.`,
      title: "Reset your password",
      bodyHtml: renderPasswordResetCodeHtml(emailOtp),
      bodyTextLines: [
        `Password reset code: ${emailOtp}`,
        "Enter this code to reset your password, or use the link below.",
        `Expires in ${OTP_EXPIRY_LABEL}.`,
      ],
      ctaLabel: "Reset password",
      ctaPath: safeActionLink,
      footerNote: "Didn't request this? You can ignore this email.",
      idempotencyKey: `password-reset:${email}:${data.properties.hashed_token}`,
    });

    logEmailResult(`password_reset:${email}`, result);
    if ("ok" in result && result.ok) return { ok: true, type: "recovery" } as const;
    if ("skipped" in result) {
      return { ok: false, error: "Email delivery is not configured." } as const;
    }
    return { ok: false, error: result.error } as const;
  } catch (error) {
    return { ok: false, error: getEmailErrorMessage(error) } as const;
  }
}

export async function sendWelcomeEmail(input: {
  email: string;
  fullName?: string | null;
}) {
  const email = normalizeEmail(input.email);
  const name = input.fullName?.trim();
  const intro = name
    ? `Welcome to Indegenius, ${name}. Finish your profile so your writing, comments, and follows carry a credible academic identity.`
    : "Welcome to Indegenius. Finish your profile so your writing, comments, and follows carry a credible academic identity.";

  const result = await sendDirectEmail({
    to: email,
    subject: "Welcome to Indegenius",
    preview: "Finish setting up your Indegenius profile.",
    title: "Welcome to Indegenius",
    intro,
    ctaLabel: "Complete your profile",
    ctaPath: "/onboarding",
    idempotencyKey: `welcome:${email}`,
  });

  logEmailResult(`welcome:${email}`, result);
  return result;
}

export async function sendPasswordChangedEmail() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const result = { skipped: true, reason: "missing_authenticated_user" } as const;
    logEmailResult("password_changed:unknown", result);
    return result;
  }

  const result = await sendUserEmail({
    recipientId: user.id,
    subject: "Your Indegenius password was changed",
    preview: "Your Indegenius password was changed.",
    title: "Password changed",
    intro:
      "Your Indegenius password was changed. If you made this change, no further action is needed. If this was not you, reset your password immediately.",
    ctaLabel: "Review account settings",
    ctaPath: "/settings?tab=account",
    idempotencyKey: `password-changed:${user.id}:${new Date().toISOString()}`,
  });

  logEmailResult(`password_changed:${user.id}`, result);
  return result;
}
