"use server";

import { revalidatePath } from "next/cache";
import { recordActivationEvent } from "@/lib/activationServer";
import { createClient } from "@/lib/supabase/server";

const INQUIRY_STATUSES = ["new", "read", "archived"] as const;
type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

interface InquiryOwnerRow {
  id: string;
  talent_profiles:
    | {
        user_id: string;
      }
    | {
        user_id: string;
      }[]
    | null;
}

function isInquiryStatus(value: string): value is InquiryStatus {
  return INQUIRY_STATUSES.includes(value as InquiryStatus);
}

function getOwnerId(row: InquiryOwnerRow) {
  const talentProfile = Array.isArray(row.talent_profiles)
    ? row.talent_profiles[0] ?? null
    : row.talent_profiles;

  return talentProfile?.user_id ?? null;
}

export async function updateOpportunityInquiryStatus(formData: FormData) {
  const inquiryId = String(formData.get("inquiryId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!inquiryId || !isInquiryStatus(status)) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const { data: inquiry } = await supabase
    .from("talent_inquiries")
    .select("id, talent_profiles!inner(user_id)")
    .eq("id", inquiryId)
    .maybeSingle<InquiryOwnerRow>();

  if (!inquiry || getOwnerId(inquiry) !== user.id) {
    return;
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("talent_inquiries")
    .update({
      status,
      read_at: status === "new" ? null : now,
      updated_at: now,
    })
    .eq("id", inquiryId);

  if (!error) {
    await recordActivationEvent({
      supabase,
      event: "opportunity_inquiry_status_updated",
      userId: user.id,
      metadata: {
        inquiryId,
        status,
      },
      source: "server",
      route: "/dashboard",
    });
    revalidatePath("/dashboard");
  }
}
