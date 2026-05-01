"use server";

import { revalidatePath } from "next/cache";
import {
  getOpportunityShortLabel,
  isOpportunityType,
} from "@/lib/opportunities";
import { createClient } from "@/lib/supabase/server";

interface SubmitOpportunityInquiryInput {
  talentProfileId: string;
  organizationName: string;
  contactEmail: string;
  opportunityType: string;
  roleTitle: string;
  message: string;
}

interface TalentInquiryTarget {
  id: string;
  user_id: string;
  open_to_opportunities: boolean;
  visibility: string;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function submitOpportunityInquiry(
  input: SubmitOpportunityInquiryInput
): Promise<{ ok: boolean; error?: string }> {
  const organizationName = input.organizationName.trim();
  const contactEmail = normalizeEmail(input.contactEmail);
  const roleTitle = input.roleTitle.trim();
  const message = input.message.trim();
  const opportunityType = input.opportunityType.trim();

  if (!organizationName) {
    return { ok: false, error: "Add the organization name." };
  }

  if (!isValidEmail(contactEmail)) {
    return { ok: false, error: "Add a valid reply email." };
  }

  if (!roleTitle) {
    return { ok: false, error: "Add the role or opportunity title." };
  }

  if (!isOpportunityType(opportunityType)) {
    return { ok: false, error: "Choose an opportunity type." };
  }

  if (message.length < 40) {
    return {
      ok: false,
      error: "Add a substantive message so the student can evaluate the opportunity.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Sign in to send an opportunity inquiry." };
  }

  const { data: target, error: targetError } = await supabase
    .from("talent_profiles")
    .select("id, user_id, open_to_opportunities, visibility")
    .eq("id", input.talentProfileId)
    .maybeSingle<TalentInquiryTarget>();

  if (targetError) {
    return { ok: false, error: targetError.message };
  }

  if (!target?.open_to_opportunities || target.visibility === "private") {
    return { ok: false, error: "This profile is not accepting opportunity inquiries." };
  }

  if (target.user_id === user.id) {
    return { ok: false, error: "You cannot send an opportunity inquiry to yourself." };
  }

  const { error: insertError } = await supabase.from("talent_inquiries").insert({
    talent_id: input.talentProfileId,
    sender_id: user.id,
    organization_name: organizationName,
    contact_email: contactEmail,
    opportunity_type: opportunityType,
    role_title: roleTitle,
    message,
    status: "new",
  });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  const typeLabel = getOpportunityShortLabel(opportunityType);
  await supabase.from("notifications").insert({
    user_id: target.user_id,
    actor_id: user.id,
    type: "opportunity_inquiry",
    message: `${organizationName} sent you a ${typeLabel.toLowerCase()} inquiry for ${roleTitle}.`,
    link: "/dashboard#opportunity-interest",
  });

  revalidatePath("/dashboard");
  return { ok: true };
}
