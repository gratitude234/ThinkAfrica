import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildSignalId,
  CREDIBILITY_SIGNAL_COPY,
  REVIEW_KIND_COPY,
  type CredibilitySignal,
  type ReviewKind,
} from "@/lib/credibilityGraph";
import {
  buildTopicEvidence,
  rankDemonstratedExpertise,
  type ExpertiseTopicInput,
  type TopicEvidence,
} from "@/lib/demonstratedExpertise";
import { FEATURE_FLAGS, isCredibilityGraphEnabled } from "@/lib/featureFlags";

export interface CredibilitySummary {
  inboundCitationCount: number;
  selfCitationCount: number;
  citingWorkCount: number;
  peerReviewedCount: number;
  editoriallyReviewedCount: number;
  acceptedCollaborationCount: number;
  distinctCollaboratorCount: number;
  debateContributionCount: number;
  completedDebateCount: number;
}

export const EMPTY_CREDIBILITY_SUMMARY: CredibilitySummary = {
  inboundCitationCount: 0,
  selfCitationCount: 0,
  citingWorkCount: 0,
  peerReviewedCount: 0,
  editoriallyReviewedCount: 0,
  acceptedCollaborationCount: 0,
  distinctCollaboratorCount: 0,
  debateContributionCount: 0,
  completedDebateCount: 0,
};

function count(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function normalizeCredibilitySummary(value: unknown): CredibilitySummary {
  const row = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null;
  if (!row || typeof row !== "object") return EMPTY_CREDIBILITY_SUMMARY;
  return {
    inboundCitationCount: count(row.inbound_citation_count),
    selfCitationCount: count(row.self_citation_count),
    citingWorkCount: count(row.citing_work_count),
    peerReviewedCount: count(row.peer_reviewed_count),
    editoriallyReviewedCount: count(row.editorially_reviewed_count),
    acceptedCollaborationCount: count(row.accepted_collaboration_count),
    distinctCollaboratorCount: count(row.distinct_collaborator_count),
    debateContributionCount: count(row.debate_contribution_count),
    completedDebateCount: count(row.completed_debate_count),
  };
}

/**
 * One bounded call for a profile's credibility aggregates.
 *
 * The RPC does the counting in the database, so a profile render costs one
 * round trip here rather than one per signal type, and no surface has to scan
 * every post and reference to draw a number.
 */
export async function loadCredibilitySummary(
  supabase: SupabaseClient,
  profileId: string
): Promise<CredibilitySummary> {
  if (!isCredibilityGraphEnabled()) return EMPTY_CREDIBILITY_SUMMARY;
  const { data, error } = await supabase.rpc("get_public_credibility_summary", {
    p_profile_id: profileId,
  });
  if (error) return EMPTY_CREDIBILITY_SUMMARY;
  return normalizeCredibilitySummary(data);
}

interface CitationEdgeRow {
  edge_id: string;
  citing_post_id: string;
  citing_slug: string;
  citing_title: string | null;
  occurred_at: string;
  cited_post_id: string;
  cited_title: string | null;
  is_self_citation: boolean;
}

interface ReviewSignalRow {
  review_kind: ReviewKind;
  post_id: string;
  post_slug: string;
  post_title: string | null;
  occurred_at: string;
}

interface PublicOutcomeRow {
  id: string;
  status: string;
  opportunity_title: string;
  organization_name: string | null;
  occurred_on: string | null;
  verification_source: string | null;
  evidence_url: string | null;
  verified_at: string;
}

export interface ProfileCredibilityGraph {
  summary: CredibilitySummary;
  signals: CredibilitySignal[];
  expertise: TopicEvidence[];
  /** Inbound citations per cited work, for the expertise evidence pass. */
  inboundCitationsByPost: Map<string, number>;
}

export const EMPTY_CREDIBILITY_GRAPH: ProfileCredibilityGraph = {
  summary: EMPTY_CREDIBILITY_SUMMARY,
  signals: [],
  expertise: [],
  inboundCitationsByPost: new Map(),
};

/**
 * Loads every public credibility signal for one profile.
 *
 * Independent domains go out in parallel. Each signal is normalized to the
 * shared shape here rather than in a component, so a surface can only render
 * what the graph says exists, and every label comes from the controlled copy
 * table rather than from a database column an author could write to.
 */
export async function loadProfileCredibilityGraph({
  supabase,
  profileId,
  publishedWork,
}: {
  supabase: SupabaseClient;
  profileId: string;
  /** The author's published work, already loaded by the profile page. */
  publishedWork: Array<{
    postId: string;
    slug: string;
    title: string;
    occurredAt: string;
    tags: string[];
    isCoAuthor: boolean;
    sourceBacked: boolean;
    citable: boolean;
  }>;
}): Promise<ProfileCredibilityGraph> {
  if (!isCredibilityGraphEnabled()) return EMPTY_CREDIBILITY_GRAPH;

  const ownedPostIds = publishedWork.map((work) => work.postId);

  const [summary, citationResult, reviewResult, outcomeResult] = await Promise.all([
    loadCredibilitySummary(supabase, profileId),
    supabase
      .from("public_citation_edges")
      .select(
        "edge_id, citing_post_id, citing_slug, citing_title, occurred_at, cited_post_id, cited_title, is_self_citation"
      )
      .eq("cited_profile_id", profileId)
      .eq("is_self_citation", false)
      .order("occurred_at", { ascending: false })
      .limit(50),
    ownedPostIds.length > 0
      ? supabase
          .from("public_review_signals")
          .select("review_kind, post_id, post_slug, post_title, occurred_at")
          .in("post_id", ownedPostIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("public_opportunity_outcomes")
      .select(
        "id, status, opportunity_title, organization_name, occurred_on, verification_source, evidence_url, verified_at"
      )
      .eq("profile_id", profileId)
      .order("occurred_on", { ascending: false, nullsFirst: false })
      .limit(20),
  ]);

  const signals: CredibilitySignal[] = [];
  const inboundCitationsByPost = new Map<string, number>();

  for (const row of (citationResult.data ?? []) as unknown as CitationEdgeRow[]) {
    inboundCitationsByPost.set(
      row.cited_post_id,
      (inboundCitationsByPost.get(row.cited_post_id) ?? 0) + 1
    );
    signals.push({
      id: buildSignalId("cited_by", "post_reference", row.edge_id),
      kind: "cited_by",
      subjectProfileId: profileId,
      sourceType: "post_reference",
      sourceId: row.edge_id,
      occurredAt: row.occurred_at,
      ...CREDIBILITY_SIGNAL_COPY.cited_by,
      // The evidence is the citing work: a reader checks the claim by reading
      // the piece that made it.
      sourceUrl: `/post/${row.citing_slug}`,
      provenance: "derived_platform_record",
      visibility: "public",
      revokedAt: null,
      relatedWorkId: row.cited_post_id,
      relatedWorkTitle: row.cited_title,
    });
  }

  for (const row of (reviewResult.data ?? []) as unknown as ReviewSignalRow[]) {
    const copy = REVIEW_KIND_COPY[row.review_kind];
    if (!copy) continue;
    signals.push({
      id: buildSignalId("reviewed", "post_review", `${row.review_kind}:${row.post_id}`),
      kind: "reviewed",
      subjectProfileId: profileId,
      sourceType: row.review_kind === "peer_reviewed" ? "post_review" : "post_editor_decision",
      sourceId: row.post_id,
      occurredAt: row.occurred_at,
      // The specific workflow's label, not a generic "reviewed".
      label: copy.label,
      explanation: copy.explanation,
      sourceUrl: `/post/${row.post_slug}`,
      provenance: "derived_platform_record",
      visibility: "public",
      revokedAt: null,
      relatedWorkId: row.post_id,
      relatedWorkTitle: row.post_title,
    });
  }

  for (const row of (outcomeResult.data ?? []) as unknown as PublicOutcomeRow[]) {
    const kind =
      row.status === "completed"
        ? "verified_opportunity_completion"
        : "verified_opportunity_selection";
    signals.push({
      id: buildSignalId(kind, "opportunity_outcome", row.id),
      kind,
      subjectProfileId: profileId,
      sourceType: "opportunity_outcome",
      sourceId: row.id,
      occurredAt: row.occurred_on ?? row.verified_at,
      label: `${CREDIBILITY_SIGNAL_COPY[kind].label}: ${row.opportunity_title}`,
      explanation: row.organization_name
        ? `${CREDIBILITY_SIGNAL_COPY[kind].explanation} Provider: ${row.organization_name}.`
        : CREDIBILITY_SIGNAL_COPY[kind].explanation,
      // Evidence is optional for an outcome; provenance carries the weight.
      sourceUrl: row.evidence_url ?? `#outcome-${row.id}`,
      provenance:
        row.verification_source === "admin" ? "verified_by_admin" : "verified_by_provider",
      visibility: "public",
      revokedAt: null,
      relatedOrganization: row.organization_name,
    });
  }

  // Expertise evidence is built from the work the caller already loaded plus
  // the review and citation facts above, in one pass. No query per topic.
  const reviewedPostIds = new Set(
    ((reviewResult.data ?? []) as unknown as ReviewSignalRow[]).map((row) => row.post_id)
  );

  const contributions: ExpertiseTopicInput[] = publishedWork.map((work) => ({
    tags: work.tags,
    postId: work.postId,
    slug: work.slug,
    title: work.title,
    occurredAt: work.occurredAt,
    isCoAuthor: work.isCoAuthor,
    sourceBacked: work.sourceBacked,
    citable: work.citable,
    reviewed: reviewedPostIds.has(work.postId),
    inboundCitations: inboundCitationsByPost.get(work.postId) ?? 0,
  }));

  return {
    summary,
    signals,
    expertise: rankDemonstratedExpertise(buildTopicEvidence(contributions)),
    inboundCitationsByPost,
  };
}

export { FEATURE_FLAGS };
