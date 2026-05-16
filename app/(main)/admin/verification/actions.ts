"use server";

import {
  createAdminActionClient,
  recordAdminAuditEvent,
} from "@/lib/adminAccess";
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
  const { error } = await admin
    .from("profiles")
    .update({
      verified: input.verified,
      verified_type: nextVerifiedType,
      role: nextRole,
    })
    .eq("id", input.userId);

  if (!error) {
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
