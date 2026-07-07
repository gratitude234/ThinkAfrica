"use server";

import {
  createAdminActionClient,
  recordAdminAuditEvent,
} from "@/lib/adminAccess";
import { logEmailResult, sendUserEmail } from "@/lib/email";
import type { AppRole, VerificationType } from "@/lib/types";

function normalizeRole(
  verifiedType: VerificationType | null,
  role: AppRole
): AppRole {
  if (verifiedType === "faculty" || verifiedType === "institution") {
    return role === "reviewer" || role === "editor" ? role : "student";
  }

  return "student";
}

export async function updateVerificationStatus(input: {
  userId: string;
  verified: boolean;
  verifiedType: VerificationType | null;
  role: AppRole;
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

  const nextVerifiedType = input.verified ? input.verifiedType : null;
  const nextRole = input.verified
    ? normalizeRole(nextVerifiedType, input.role)
    : "student";

  const { admin, context } = actionClient;
  const { data: previousProfile } = await admin
    .from("profiles")
    .select("verified, verified_type, role")
    .eq("id", input.userId)
    .maybeSingle();

  const { error } = await admin
    .from("profiles")
    .update({
      verified: input.verified,
      verified_type: nextVerifiedType,
      role: nextRole,
    })
    .eq("id", input.userId);

  if (!error) {
    if (previousProfile && previousProfile.verified !== input.verified) {
      const result = await sendUserEmail({
        recipientId: input.userId,
        subject: input.verified
          ? "Your Indegenius profile has been verified"
          : "Your Indegenius verification status changed",
        preview: input.verified
          ? "Your Indegenius profile is now verified."
          : "Your Indegenius verification status was updated.",
        title: input.verified ? "Profile verified" : "Verification status updated",
        intro: input.verified
          ? `Your Indegenius profile has been verified${
              nextVerifiedType ? ` as ${nextVerifiedType}` : ""
            }. This trust signal now appears on your public profile and byline.`
          : "Your Indegenius profile verification was revoked or changed. Review your profile details if you need to update your academic identity.",
        ctaLabel: "Open profile settings",
        ctaPath: "/settings?tab=profile",
        preferenceKey: "email_account_security",
        idempotencyKey: `verification-status:${input.userId}:${input.verified}:${nextVerifiedType ?? "none"}`,
      });
      logEmailResult(`verification_status:${input.userId}`, result);
    } else if (previousProfile?.verified_type !== nextVerifiedType && input.verified) {
      const result = await sendUserEmail({
        recipientId: input.userId,
        subject: "Your Indegenius verification type changed",
        preview: "Your Indegenius verification type was updated.",
        title: "Verification type updated",
        intro: `Your Indegenius verification type is now ${nextVerifiedType ?? "updated"}.`,
        ctaLabel: "Open profile settings",
        ctaPath: "/settings?tab=profile",
        preferenceKey: "email_account_security",
        idempotencyKey: `verification-type:${input.userId}:${nextVerifiedType ?? "none"}`,
      });
      logEmailResult(`verification_type:${input.userId}`, result);
    }

    if (previousProfile && previousProfile.role !== nextRole) {
      const roleCtaPath =
        nextRole === "admin" ? "/admin" : nextRole === "editor" || nextRole === "reviewer" ? "/review" : "/settings?tab=profile";
      const result = await sendUserEmail({
        recipientId: input.userId,
        subject: "Your Indegenius account role changed",
        preview: `Your Indegenius role is now ${nextRole}.`,
        title: "Account role updated",
        intro: `Your Indegenius account role changed from ${
          previousProfile?.role ?? "student"
        } to ${nextRole}.`,
        ctaLabel:
          nextRole === "admin"
            ? "Open admin"
            : nextRole === "editor" || nextRole === "reviewer"
              ? "Open reviews"
              : "Open profile settings",
        ctaPath: roleCtaPath,
        preferenceKey: "email_account_security",
        idempotencyKey: `role-change:${input.userId}:${previousProfile?.role ?? "none"}:${nextRole}`,
      });
      logEmailResult(`role_change:${input.userId}`, result);
    }

    await recordAdminAuditEvent({
      admin,
      context,
      action: "profile.verification_updated",
      targetTable: "profiles",
      targetId: input.userId,
      metadata: {
        verified: input.verified,
        verifiedType: nextVerifiedType,
        role: nextRole,
      },
    });
  }

  return { error: error?.message ?? null };
}
