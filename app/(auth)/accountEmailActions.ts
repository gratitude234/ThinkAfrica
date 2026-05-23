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

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function getAuthCallbackUrl(nextPath: string) {
  const configuredUrl = process.env.EMAIL_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  const appUrl =
    configuredUrl && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(configuredUrl)
      ? configuredUrl
      : "https://www.thinkafrica.africa";

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
      : "https://www.thinkafrica.africa";

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

function isPrivacySafeResendRecipientError(error: unknown) {
  const message = getEmailErrorMessage(error).toLowerCase();
  return (
    message.includes("user not found") ||
    message.includes("not found") ||
    message.includes("does not exist") ||
    message.includes("already confirmed") ||
    message.includes("already been confirmed") ||
    message.includes("email confirmed")
  );
}

function isRateLimitError(error: unknown) {
  const message = getEmailErrorMessage(error).toLowerCase();
  return (
    message.includes("rate limit") ||
    message.includes("too many") ||
    message.includes("over_email_send_rate_limit")
  );
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
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      password: input.password,
      options: {
        data: {
          full_name: fullName,
        },
        redirectTo: getAuthCallbackUrl("/onboarding"),
      },
    });

    if (error) {
      return { ok: false, error: error.message } as const;
    }

    const actionLink = data.properties?.action_link;
    if (!actionLink) {
      return { ok: false, error: "Unable to create confirmation link." } as const;
    }
    const safeActionLink = data.properties.hashed_token
      ? getAuthConfirmUrl({
          tokenHash: data.properties.hashed_token,
          type: "signup",
          nextPath: "/onboarding",
        })
      : getSafeAuthActionLink(actionLink, "/onboarding");

    const displayName = fullName || "there";
    const result = await sendDirectEmail({
      to: email,
      subject: "Confirm your ThinkAfrica account",
      preview: "Confirm your email to finish creating your ThinkAfrica profile.",
      title: "Confirm your ThinkAfrica account",
      intro: `Hi ${displayName}. Confirm your email to activate your ThinkAfrica profile and continue onboarding.`,
      bodyHtml: `<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#4b5563;">This link protects your account and keeps your byline, drafts, follows, and notifications tied to ${escapeHtml(email)}.</p>`,
      bodyTextLines: [
        "This link protects your account and keeps your byline, drafts, follows, and notifications tied to your email.",
      ],
      ctaLabel: "Confirm account",
      ctaPath: safeActionLink,
      idempotencyKey: `signup-confirm:${email}:${data.properties.hashed_token}`,
    });

    logEmailResult(`signup_confirm:${email}`, result);
    if ("ok" in result && result.ok) return { ok: true } as const;
    if ("skipped" in result) {
      return { ok: false, error: "Email delivery is not configured." } as const;
    }
    return { ok: false, error: result.error } as const;
  } catch (error) {
    return { ok: false, error: getEmailErrorMessage(error) } as const;
  }
}

export async function resendSignupConfirmationEmail(input: { email: string }) {
  const email = normalizeEmail(input.email);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Add a valid email address." } as const;
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: getAuthCallbackUrl("/onboarding"),
      },
    });

    if (error) {
      if (isRateLimitError(error)) {
        return { ok: false, error: error.message } as const;
      }

      if (isPrivacySafeResendRecipientError(error)) {
        return { ok: true } as const;
      }

      return { ok: false, error: error.message } as const;
    }

    return { ok: true } as const;
  } catch (error) {
    if (isRateLimitError(error)) {
      return { ok: false, error: getEmailErrorMessage(error) } as const;
    }

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
        return { ok: true } as const;
      }
      return { ok: false, error: error.message } as const;
    }

    const actionLink = data.properties?.action_link;
    if (!actionLink) {
      return { ok: false, error: "Unable to create reset link." } as const;
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
      subject: "Reset your ThinkAfrica password",
      preview: "Use this secure link to reset your ThinkAfrica password.",
      title: "Reset your password",
      intro:
        "We received a request to reset your ThinkAfrica password. Use this secure link to choose a new password.",
      bodyTextLines: [
        "If you did not request this, you can ignore this email and your password will stay unchanged.",
      ],
      ctaLabel: "Reset password",
      ctaPath: safeActionLink,
      idempotencyKey: `password-reset:${email}:${data.properties.hashed_token}`,
    });

    logEmailResult(`password_reset:${email}`, result);
    if ("ok" in result && result.ok) return { ok: true } as const;
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
    ? `Welcome to ThinkAfrica, ${name}. Finish your profile so your writing, comments, and follows carry a credible academic identity.`
    : "Welcome to ThinkAfrica. Finish your profile so your writing, comments, and follows carry a credible academic identity.";

  const result = await sendDirectEmail({
    to: email,
    subject: "Welcome to ThinkAfrica",
    preview: "Finish setting up your ThinkAfrica profile.",
    title: "Welcome to ThinkAfrica",
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
    subject: "Your ThinkAfrica password was changed",
    preview: "Your ThinkAfrica password was changed.",
    title: "Password changed",
    intro:
      "Your ThinkAfrica password was changed. If you made this change, no further action is needed. If this was not you, reset your password immediately.",
    ctaLabel: "Review account settings",
    ctaPath: "/settings?tab=account",
    idempotencyKey: `password-changed:${user.id}:${new Date().toISOString()}`,
  });

  logEmailResult(`password_changed:${user.id}`, result);
  return result;
}
