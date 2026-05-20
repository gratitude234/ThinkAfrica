"use server";

import { createClient } from "@/lib/supabase/server";
import {
  logEmailResult,
  sendDirectEmail,
  sendUserEmail,
} from "@/lib/email";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
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
