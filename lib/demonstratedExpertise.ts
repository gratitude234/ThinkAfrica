import { profileTopicKey } from "@/lib/profileTopics";

/**
 * Demonstrated expertise: what an author's published work shows they work on.
 *
 * This is the Phase 1 demonstrated-topic separation carried further. A topic
 * still comes only from tags on published work, never from a declared
 * interest. What is new is that each topic now carries the evidence behind
 * it, and a rule for when there is enough evidence to call it demonstrated at
 * all.
 *
 * There is no expertise score. A number between 0 and 100 would be a ranking
 * with extra steps, and nobody could say what it meant. The output is a
 * sentence made of counts a reader can go and check.
 */

export interface TopicEvidence {
  key: string;
  label: string;
  /** Published authored or accepted co-authored work carrying this tag. */
  contributionCount: number;
  sourceBackedCount: number;
  citableCount: number;
  /** Inbound citations from other Indegenius publications, self excluded. */
  inboundCitationCount: number;
  reviewedCount: number;
  coAuthoredCount: number;
  debateContributionCount: number;
  lastContributionAt: string | null;
  representativeWorks: Array<{
    postId: string;
    slug: string;
    title: string;
    occurredAt: string;
  }>;
}

/**
 * A topic qualifies on either of two grounds:
 *
 * - **Repetition.** Two or more substantive public contributions. One piece
 *   is a subject someone wrote about once; two is a subject they return to.
 * - **Strength.** A single contribution that carries a stronger signal than
 *   its own existence: a completed review, an inbound citation, or a stable
 *   citation record. Someone with one peer-reviewed paper on a subject has
 *   demonstrated more than someone with two untagged blog posts.
 *
 * Deliberately not a threshold on a weighted score. Both grounds are
 * inspectable facts, and an author can read this rule and know exactly why a
 * topic does or does not appear.
 */
export const EXPERTISE_MIN_CONTRIBUTIONS = 2;

export function qualifiesAsDemonstratedExpertise(evidence: TopicEvidence): boolean {
  if (evidence.contributionCount >= EXPERTISE_MIN_CONTRIBUTIONS) return true;
  if (evidence.contributionCount < 1) return false;
  return (
    evidence.reviewedCount > 0 ||
    evidence.inboundCitationCount > 0 ||
    evidence.citableCount > 0
  );
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * The sentence a profile prints for a topic.
 *
 * Assembled from counts, in a fixed order, with no adjectives. Nothing here
 * can say "leading", "expert" or "top", because there is no clause in this
 * function that could produce one. The strongest available evidence goes
 * first, and at most two supporting clauses follow, so the sentence stays a
 * sentence.
 */
export function buildExpertiseSummary(evidence: TopicEvidence): string {
  const opening = `${plural(evidence.contributionCount, "contribution")} on ${evidence.label}`;

  const clauses: string[] = [];
  if (evidence.reviewedCount > 0) {
    clauses.push(plural(evidence.reviewedCount, "reviewed contribution"));
  }
  if (evidence.inboundCitationCount > 0) {
    clauses.push(
      `${plural(evidence.inboundCitationCount, "inbound citation")} from other publications`
    );
  }
  if (evidence.sourceBackedCount > 0) {
    clauses.push(plural(evidence.sourceBackedCount, "source-backed publication"));
  }
  if (evidence.citableCount > 0) {
    clauses.push(plural(evidence.citableCount, "citable record"));
  }
  if (evidence.coAuthoredCount > 0) {
    clauses.push(plural(evidence.coAuthoredCount, "accepted collaboration"));
  }
  if (evidence.debateContributionCount > 0) {
    clauses.push(
      plural(evidence.debateContributionCount, "structured debate contribution")
    );
  }

  if (clauses.length === 0) return `${opening}.`;

  const shown = clauses.slice(0, 2);
  const tail =
    shown.length === 1 ? shown[0] : `${shown[0]} and ${shown[1]}`;
  return `${opening}, including ${tail}.`;
}

/**
 * Orders topics by how much evidence stands behind them, then by recency,
 * then by label. Fully deterministic: the same evidence always produces the
 * same order, so a profile does not reshuffle between requests.
 *
 * The weights order a list; they are never shown and never summed into a
 * score a reader could mistake for a rating.
 */
function evidenceRank(evidence: TopicEvidence) {
  return (
    evidence.inboundCitationCount * 4 +
    evidence.reviewedCount * 3 +
    evidence.citableCount * 2 +
    evidence.sourceBackedCount * 2 +
    evidence.contributionCount
  );
}

export function rankDemonstratedExpertise(
  topics: TopicEvidence[],
  limit?: number
): TopicEvidence[] {
  const qualified = topics
    .filter(qualifiesAsDemonstratedExpertise)
    .sort((left, right) => {
      const byRank = evidenceRank(right) - evidenceRank(left);
      if (byRank !== 0) return byRank;
      const leftDate = left.lastContributionAt ?? "";
      const rightDate = right.lastContributionAt ?? "";
      if (leftDate !== rightDate) return leftDate < rightDate ? 1 : -1;
      return left.label.localeCompare(right.label);
    });

  return typeof limit === "number" ? qualified.slice(0, limit) : qualified;
}

/** How many topics the public profile section shows before offering the rest. */
export const PROFILE_EXPERTISE_LIMIT = 3;

/** How many representative works a topic carries. */
export const REPRESENTATIVE_WORK_LIMIT = 2;

/**
 * Picks the works that best show a topic, deterministically.
 *
 * Strength first, so a reviewed or cited piece represents the topic ahead of
 * a more recent but weaker one, and the post id breaks any remaining tie so
 * two equally strong works never swap places between renders.
 */
export function selectRepresentativeWorks<
  T extends {
    postId: string;
    slug: string;
    title: string;
    occurredAt: string;
    reviewed?: boolean;
    citable?: boolean;
    sourceBacked?: boolean;
    inboundCitations?: number;
  },
>(works: T[], limit = REPRESENTATIVE_WORK_LIMIT) {
  const strength = (work: T) =>
    (work.inboundCitations ?? 0) * 4 +
    (work.reviewed ? 3 : 0) +
    (work.citable ? 2 : 0) +
    (work.sourceBacked ? 1 : 0);

  return [...works]
    .sort((left, right) => {
      const byStrength = strength(right) - strength(left);
      if (byStrength !== 0) return byStrength;
      if (left.occurredAt !== right.occurredAt) {
        return left.occurredAt < right.occurredAt ? 1 : -1;
      }
      return left.postId.localeCompare(right.postId);
    })
    .slice(0, limit)
    .map((work) => ({
      postId: work.postId,
      slug: work.slug,
      title: work.title,
      occurredAt: work.occurredAt,
    }));
}

export interface ExpertiseTopicInput {
  tags?: string[] | null;
  postId: string;
  slug: string;
  title: string;
  occurredAt: string;
  isCoAuthor?: boolean;
  sourceBacked?: boolean;
  citable?: boolean;
  reviewed?: boolean;
  inboundCitations?: number;
  /** A debate argument rather than a publication. */
  isDebateContribution?: boolean;
}

/**
 * Builds every topic's evidence in a single pass over the author's work.
 *
 * One pass rather than a query per topic: an author with twenty topics would
 * otherwise cost twenty round trips on every profile render, and the counts
 * are all derivable from work that has already been loaded.
 */
export function buildTopicEvidence(
  contributions: ExpertiseTopicInput[]
): TopicEvidence[] {
  const byTopic = new Map<
    string,
    TopicEvidence & { works: ExpertiseTopicInput[] }
  >();

  for (const contribution of contributions) {
    for (const rawTag of contribution.tags ?? []) {
      const label = rawTag.trim();
      if (!label) continue;
      const key = profileTopicKey(label);
      if (!key) continue;

      let entry = byTopic.get(key);
      if (!entry) {
        entry = {
          key,
          // First spelling encountered wins, so the author's own casing shows.
          label,
          contributionCount: 0,
          sourceBackedCount: 0,
          citableCount: 0,
          inboundCitationCount: 0,
          reviewedCount: 0,
          coAuthoredCount: 0,
          debateContributionCount: 0,
          lastContributionAt: null,
          representativeWorks: [],
          works: [],
        };
        byTopic.set(key, entry);
      }

      if (contribution.isDebateContribution) {
        entry.debateContributionCount += 1;
      } else {
        entry.contributionCount += 1;
        if (contribution.sourceBacked) entry.sourceBackedCount += 1;
        if (contribution.citable) entry.citableCount += 1;
        if (contribution.reviewed) entry.reviewedCount += 1;
        if (contribution.isCoAuthor) entry.coAuthoredCount += 1;
        entry.inboundCitationCount += contribution.inboundCitations ?? 0;
        entry.works.push(contribution);
      }

      if (!entry.lastContributionAt || contribution.occurredAt > entry.lastContributionAt) {
        entry.lastContributionAt = contribution.occurredAt;
      }
    }
  }

  return [...byTopic.values()].map(({ works, ...evidence }) => ({
    ...evidence,
    representativeWorks: selectRepresentativeWorks(works),
  }));
}
