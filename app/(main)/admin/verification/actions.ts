"use server";

import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isBootstrapAdmin = user.email === process.env.ADMIN_EMAIL;
  const isRoleAdmin = currentProfile?.role === "admin";

  if (!isBootstrapAdmin && !isRoleAdmin) {
    return { error: "You do not have permission to update verification." };
  }

  const nextVerifiedType = input.verified ? input.verifiedType : null;
  const nextRole = input.verified
    ? normalizeRole(nextVerifiedType, input.role)
    : "student";

  const { error } = await supabase
    .from("profiles")
    .update({
      verified: input.verified,
      verified_type: nextVerifiedType,
      role: nextRole,
    })
    .eq("id", input.userId);

  return { error: error?.message ?? null };
}
