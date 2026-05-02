"use server";

import { createAdminClient, requireAdmin } from "@/lib/supabase/admin";
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
  try {
    await requireAdmin();
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

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      verified: input.verified,
      verified_type: nextVerifiedType,
      role: nextRole,
    })
    .eq("id", input.userId);

  return { error: error?.message ?? null };
}
