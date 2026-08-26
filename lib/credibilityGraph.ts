/**
 * The credibility graph: person → work → topic → evidence → recognition.
 *
 * Every public claim on a profile is one of these signals, and every signal
 * names the canonical record it was derived from. Nothing here is awarded,
 * scored, or ranked. There is no total, because a total would invite the
 * comparison the product refuses to make.
 *
 * The rules a signal has to satisfy to exist:
 *
 * - **Derived or verified.** It comes from a canonical platform record, or a
 *   named authority verified it.
 * - **Inspectable.** It carries a URL a reader can open to check it.
 * - **Attributable.** It names its source type and source id.
 * - **Revocable.** When its source is unpublished, withdrawn or disputed, the
 *   signal disappears from public aggregates rather than lingering.
 */

export const CREDIBILITY_SIGNAL_KINDS = [
  "authored",
  "accepted_coauthor",
  "responded_to",
  "cited_by",
  "reviewed",
  "debate_participation",
  "debate_completion",
  "verified_opportunity_selection",
  "verified_opportunity_completion",
  "verified_external_recognition",
] as const;

export type CredibilitySignalKind = (typeof CREDIBILITY_SIGNAL_KINDS)[number];

/**
 * Deliberately absent: `debate_winner`.
 *
 * Debate ballots exist in the schema but are private, and the migration that
 * introduced them states that a public aggregate-results function is deferred.
 * Until a canonical judged result exists, a winner could only be inferred from
 * votes, likes or follower counts, and inferring intellectual outcomes from
 * popularity is the thing this graph exists to avoid. Participation and
 * completion are facts; a winner is not yet one.
 */
export const UNSUPPORTED_SIGNAL_KINDS = ["debate_winner"] as const;

export const CREDIBILITY_SOURCE_TYPES = [
  "post",
  "post_author",
  "post_reference",
  "post_review",
  "post_editor_decision",
  "debate",
  "debate_argument",
  "opportunity_outcome",
  "external_recognition",
] as const;

export type CredibilitySourceType = (typeof CREDIBILITY_SOURCE_TYPES)[number];

/**
 * How a signal came to be trusted.
 *
 * `derived` means the platform computed it from its own records and nobody
 * asserted it. `verified_*` means a named party attested to something the
 * platform cannot observe. Self-assertion alone is never a provenance: a
 * claim with no verifier does not reach a public projection.
 */
export const CREDIBILITY_PROVENANCE = [
  "derived_platform_record",
  "verified_by_provider",
  "verified_by_admin",
] as const;

export type CredibilityProvenance = (typeof CREDIBILITY_PROVENANCE)[number];

export type CredibilityVisibility = "public" | "private";

export interface CredibilitySignal {
  /** Stable across reloads: `${kind}:${sourceType}:${sourceId}`. */
  id: string;
  kind: CredibilitySignalKind;
  /** Whose profile this signal belongs to. */
  subjectProfileId: string;
  sourceType: CredibilitySourceType;
  sourceId: string;
  occurredAt: string;
  /** Controlled label. Never free text from a user. */
  label: string;
  /** One sentence explaining what the signal means and where it came from. */
  explanation: string;
  /** Where a reader goes to check it. */
  sourceUrl: string | null;
  provenance: CredibilityProvenance;
  visibility: CredibilityVisibility;
  revokedAt: string | null;
  relatedWorkId?: string | null;
  relatedWorkTitle?: string | null;
  relatedActorId?: string | null;
  relatedTopicKey?: string | null;
  /** Only ever a name the subject consented to display. */
  relatedOrganization?: string | null;
}

/**
 * Public copy for each signal kind, in one table.
 *
 * Labels are generated from the kind rather than stored per row, which is
 * what stops a metadata field from smuggling an arbitrary claim onto a
 * profile. A new label requires a code change and a review.
 */
export const CREDIBILITY_SIGNAL_COPY: Record<
  CredibilitySignalKind,
  { label: string; explanation: string }
> = {
  authored: {
    label: "Published work",
    explanation: "A publication on this platform, authored by this person.",
  },
  accepted_coauthor: {
    label: "Accepted collaboration",
    explanation:
      "A co-author credit on a published work, which this person accepted.",
  },
  responded_to: {
    label: "Published response",
    explanation: "A published response to another person's work.",
  },
  cited_by: {
    label: "Cited by an Indegenius publication",
    explanation:
      "Another published work on this platform lists this work as a source.",
  },
  reviewed: {
    label: "Reviewed contribution",
    explanation:
      "A publication that completed a review workflow on this platform.",
  },
  debate_participation: {
    label: "Structured debate contribution",
    explanation: "A published argument in a public structured debate.",
  },
  debate_completion: {
    label: "Completed structured debate",
    explanation:
      "Took part in a public structured debate that ran to completion.",
  },
  verified_opportunity_selection: {
    label: "Verified selection",
    explanation:
      "Selected for an opportunity, confirmed by the provider and by this person.",
  },
  verified_opportunity_completion: {
    label: "Verified completion",
    explanation:
      "Completed an opportunity, confirmed by the provider and by this person.",
  },
  verified_external_recognition: {
    label: "Verified recognition",
    explanation:
      "Recognition awarded off the platform, verified by an administrator.",
  },
};

/**
 * Review recognition distinguishes the workflow that produced it.
 *
 * A moderation approval is not a peer review, and calling it one would be the
 * clearest possible way to make every review label worthless. The label comes
 * from which canonical table the decision lives in.
 */
export const REVIEW_KINDS = ["peer_reviewed", "editorially_reviewed"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

export const REVIEW_KIND_COPY: Record<ReviewKind, { label: string; explanation: string }> =
  {
    peer_reviewed: {
      label: "Peer reviewed",
      explanation:
        "At least one assigned reviewer submitted a completed review of this work.",
    },
    editorially_reviewed: {
      label: "Editorially reviewed",
      explanation: "An editor accepted this work through the editorial workflow.",
    },
  };

export function buildSignalId(
  kind: CredibilitySignalKind,
  sourceType: CredibilitySourceType,
  sourceId: string
) {
  return `${kind}:${sourceType}:${sourceId}`;
}

function isRevoked(signal: Pick<CredibilitySignal, "revokedAt">) {
  return Boolean(signal.revokedAt);
}

/**
 * What a visitor may see.
 *
 * Three filters, in order: revoked signals disappear, private signals
 * disappear, and anything whose source is gone disappears. A signal with no
 * inspectable source is not shown, because an unverifiable claim on a public
 * profile is exactly what this system exists to prevent.
 */
export function toPublicSignals(signals: CredibilitySignal[]): CredibilitySignal[] {
  return signals.filter(
    (signal) =>
      !isRevoked(signal) &&
      signal.visibility === "public" &&
      Boolean(signal.sourceUrl)
  );
}

/**
 * Collapses signals that share a kind and a source, which happens whenever a
 * view unions the same underlying fact from two directions (an author who is
 * also an accepted co-author of their own piece, say).
 */
export function dedupeSignals(signals: CredibilitySignal[]): CredibilitySignal[] {
  const byId = new Map<string, CredibilitySignal>();
  for (const signal of signals) {
    const existing = byId.get(signal.id);
    // Keep the earliest occurrence: a fact is dated by when it happened, not
    // by when it was last recomputed.
    if (!existing || signal.occurredAt < existing.occurredAt) byId.set(signal.id, signal);
  }
  return [...byId.values()];
}

export function sortSignalsByRecency(signals: CredibilitySignal[]) {
  return [...signals].sort((left, right) => {
    if (left.occurredAt !== right.occurredAt) {
      return left.occurredAt < right.occurredAt ? 1 : -1;
    }
    return left.id.localeCompare(right.id);
  });
}

/**
 * The recognition kinds a profile surfaces. Authorship and responses are the
 * Intellectual Record's job; recognition is about what other people and
 * processes did with that work.
 */
export const RECOGNITION_SIGNAL_KINDS: CredibilitySignalKind[] = [
  "cited_by",
  "reviewed",
  "accepted_coauthor",
  "debate_completion",
  "verified_opportunity_selection",
  "verified_opportunity_completion",
  "verified_external_recognition",
];

export function isRecognitionSignal(signal: CredibilitySignal) {
  return RECOGNITION_SIGNAL_KINDS.includes(signal.kind);
}

export interface RecognitionGroup {
  kind: CredibilitySignalKind;
  label: string;
  explanation: string;
  count: number;
  /** Most recent first, bounded by the caller. */
  signals: CredibilitySignal[];
}

/**
 * Groups public recognition by kind, so a profile shows "Cited by 3
 * publications" rather than three separate rows saying the same thing.
 */
export function groupRecognitionSignals(
  signals: CredibilitySignal[],
  perGroupLimit = 3
): RecognitionGroup[] {
  const groups = new Map<CredibilitySignalKind, CredibilitySignal[]>();

  for (const signal of sortSignalsByRecency(toPublicSignals(dedupeSignals(signals)))) {
    if (!isRecognitionSignal(signal)) continue;
    const bucket = groups.get(signal.kind);
    if (bucket) bucket.push(signal);
    else groups.set(signal.kind, [signal]);
  }

  return RECOGNITION_SIGNAL_KINDS.flatMap((kind) => {
    const bucket = groups.get(kind);
    if (!bucket || bucket.length === 0) return [];
    return [
      {
        kind,
        label: CREDIBILITY_SIGNAL_COPY[kind].label,
        explanation: CREDIBILITY_SIGNAL_COPY[kind].explanation,
        count: bucket.length,
        signals: bucket.slice(0, perGroupLimit),
      },
    ];
  });
}
