"use server";

import {
  createAdminActionClient,
  recordAdminAuditEvent,
} from "@/lib/adminAccess";
import { logEmailResult, sendUserEmail } from "@/lib/email";

export async function updateVerificationStatus(input: {
  userId: string;
  verified: boolean;
}) {
  let actionClient: Awaited<ReturnType<typeof createAdminActionClient>>;
  try {
    actionClient = await createAdminActionClient("users.verify");
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "You do not have permission to update verification.",
    };
  }

  const { admin, context } = actionClient;
  const { data: previousProfile } = await admin
    .from("profiles")
    .select("verified")
    .eq("id", input.userId)
    .maybeSingle();

  const { error } = await admin
    .from("profiles")
    .update({
      verified: input.verified,
      // Verification is now one internal account/security state. Legacy
      // academic verification types are deliberately cleared when touched.
      verified_type: null,
    })
    .eq("id", input.userId);

  if (!error) {
    if (previousProfile && previousProfile.verified !== input.verified) {
      const result = await sendUserEmail({
        recipientId: input.userId,
        subject: input.verified
          ? "Your Indegenius account verification was updated"
          : "Your Indegenius verification status changed",
        preview: "Your account verification state was updated by an administrator.",
        title: input.verified ? "Account verification updated" : "Verification status updated",
        intro:
          "Your account verification state was updated for internal security and administration. It is not displayed as a public badge or ranking signal.",
        ctaLabel: "Open profile settings",
        ctaPath: "/settings/profile",
        preferenceKey: "email_account_security",
        idempotencyKey: `verification-status:${input.userId}:${input.verified}`,
      });
      logEmailResult(`verification_status:${input.userId}`, result);
    }

    await recordAdminAuditEvent({
      admin,
      context,
      action: "profile.verification_updated",
      targetTable: "profiles",
      targetId: input.userId,
      metadata: { verified: input.verified },
    });
  }

  return { error: error?.message ?? null };
}
