"use server";

import { revalidatePath } from "next/cache";
import {
  getOpportunityShortLabel,
  isOpportunityType,
} from "@/lib/opportunities";
import { logEmailResult, sendUserEmail } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface SubmitOpportunityInquiryInput {
  talentProfileId: string;
  organizationName: string;
  contactEmail: string;
  opportunityType: string;
  roleTitle: string;
  timeline?: string;
  commitment?: string;
  fitReason?: string;
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
  const timeline = input.timeline?.trim() ?? "";
  const commitment = input.commitment?.trim() ?? "";
  const fitReason = input.fitReason?.trim() ?? "";
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

  if (!timeline) {
    return { ok: false, error: "Add the expected timeline." };
  }

  if (!commitment) {
    return { ok: false, error: "Add the expected commitment." };
  }

  if (fitReason.length < 30) {
    return {
      ok: false,
      error: "Explain why this specific student is a fit.",
    };
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

  const { data: inquiry, error: insertError } = await supabase
    .from("talent_inquiries")
    .insert({
      talent_id: input.talentProfileId,
      sender_id: user.id,
      organization_name: organizationName,
      contact_email: contactEmail,
      opportunity_type: opportunityType,
      role_title: roleTitle,
      timeline,
      commitment,
      fit_reason: fitReason,
      message,
      status: "new",
    })
    .select("id")
    .single();

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  const typeLabel = getOpportunityShortLabel(opportunityType);
  const admin = createAdminClient();
  const { error: notificationError } = await admin.from("notifications").insert({
    user_id: target.user_id,
    actor_id: user.id,
    type: "opportunity_inquiry",
    message: `${organizationName} sent you a ${typeLabel.toLowerCase()} inquiry for ${roleTitle}.`,
    link: "/dashboard#opportunity-interest",
  });
  if (!notificationError) {
    const emailResult = await sendUserEmail({
      recipientId: target.user_id,
      subject: `${organizationName} sent you an opportunity inquiry`,
      preview: `${organizationName} sent you a ${typeLabel.toLowerCase()} inquiry for ${roleTitle}.`,
      title: "New opportunity inquiry",
      intro: `${organizationName} sent you a ${typeLabel.toLowerCase()} inquiry for ${roleTitle}. Review the inquiry from your dashboard and reply using ${contactEmail}.`,
      ctaLabel: "Open dashboard",
      ctaPath: "/dashboard#opportunity-interest",
      idempotencyKey: `opportunity-inquiry:${inquiry?.id ?? input.talentProfileId}:${target.user_id}`,
      preferenceKey: "email_opportunity_inquiry",
    });
    logEmailResult(`opportunity_inquiry:${input.talentProfileId}:${target.user_id}`, emailResult);
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
