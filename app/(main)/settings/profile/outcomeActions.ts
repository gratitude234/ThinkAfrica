"use server";

import { revalidatePath } from "next/cache";
import { isCredibilityGraphEnabled } from "@/lib/featureFlags";
import { createClient } from "@/lib/supabase/server";
import type { SectionSaveResult } from "./actions";

/**
 * The owner's side of the opportunity-outcome workflow.
 *
 * Every one of these calls an RPC rather than writing the table: the table
 * grants no INSERT or UPDATE to authenticated, so authorization, the
 * anti-self-award rules and the audit trail live in the database where a
 * client cannot route around them. These actions are a thin, typed way in.
 */

export interface OwnerOutcome {
  id: string;
  status: string;
  opportunityTitle: string;
  organizationName: string | null;
  occurredOn: string | null;
  sourceType: string;
  submittedRole: string;
  verifiedAt: string | null;
  verificationSource: string | null;
  ownerConfirmedAt: string | null;
  isPublic: boolean;
  revokedAt: string | null;
  evidenceUrl: string | null;
}

/**
 * What the owner sees about their own outcomes, in every state.
 *
 * Private evidence notes, dispute reasons, verifier identity and the
 * submitter's identity are deliberately not selected: the owner needs to know
 * an outcome was verified and by what kind of party, not who at that party
 * pressed the button.
 */
export async function loadMyOpportunityOutcomes(): Promise<OwnerOutcome[]> {
  if (!isCredibilityGraphEnabled()) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("opportunity_outcomes")
    .select(
      "id, status, opportunity_title, organization_name, occurred_on, source_type, submitted_role, verified_at, verification_source, owner_confirmed_at, is_public, revoked_at, evidence_url"
    )
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id as string,
    status: row.status as string,
    opportunityTitle: row.opportunity_title as string,
    organizationName: (row.organization_name as string | null) ?? null,
    occurredOn: (row.occurred_on as string | null) ?? null,
    sourceType: row.source_type as string,
    submittedRole: row.submitted_role as string,
    verifiedAt: (row.verified_at as string | null) ?? null,
    verificationSource: (row.verification_source as string | null) ?? null,
    ownerConfirmedAt: (row.owner_confirmed_at as string | null) ?? null,
    isPublic: Boolean(row.is_public),
    revokedAt: (row.revoked_at as string | null) ?? null,
    evidenceUrl: (row.evidence_url as string | null) ?? null,
  }));
}

export async function submitMyOpportunityOutcome(input: {
  status: string;
  opportunityTitle: string;
  organizationName: string;
  occurredOn: string;
  evidenceUrl: string;
  privateEvidenceNote: string;
}): Promise<SectionSaveResult> {
  if (!isCredibilityGraphEnabled()) {
    return { ok: false, error: "Outcomes are not available on this deployment yet." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const title = input.opportunityTitle.trim();
  if (title.length < 2 || title.length > 160) {
    return { ok: false, error: "Add the opportunity title, up to 160 characters." };
  }
  const evidenceUrl = input.evidenceUrl.trim();
  if (evidenceUrl && !evidenceUrl.startsWith("https://")) {
    return { ok: false, error: "Evidence links must start with https://." };
  }

  // Recorded as a private, unverified claim. Nothing about this call can make
  // it public: that needs a verifier and a separate act of consent.
  const { error } = await supabase.rpc("submit_opportunity_outcome", {
    p_profile_id: user.id,
    p_source_type: "external",
    p_source_id: null,
    p_status: input.status,
    p_opportunity_title: title,
    p_organization_name: input.organizationName.trim() || null,
    p_occurred_on: input.occurredOn || null,
    p_evidence_url: evidenceUrl || null,
    p_private_evidence_note: input.privateEvidenceNote.trim() || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/profile");
  return { ok: true };
}

/**
 * The owner's consent gate. Confirming that an outcome is true is separate
 * from choosing to publish it: plenty of true outcomes are nobody's business.
 */
export async function setMyOutcomeVisibility(input: {
  outcomeId: string;
  confirm: boolean;
  isPublic: boolean;
}): Promise<SectionSaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { error } = await supabase.rpc("set_opportunity_outcome_visibility", {
    p_outcome_id: input.outcomeId,
    p_confirm: input.confirm,
    p_public: input.isPublic,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/profile");
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.username) revalidatePath(`/${profile.username}`);
  return { ok: true };
}

export async function disputeMyOutcome(input: {
  outcomeId: string;
  reason: string;
}): Promise<SectionSaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { error } = await supabase.rpc("dispute_opportunity_outcome", {
    p_outcome_id: input.outcomeId,
    p_reason: input.reason.trim() || null,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/profile");
  return { ok: true };
}
