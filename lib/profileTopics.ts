/**
 * Topic derivation, shared by the profile and its full record.
 *
 * Two different things used to be one list. `deriveProfileTopics` ranked the
 * tags on an author's published work, then appended any declared interest the
 * work did not already cover, and the profile printed the result under
 * "Topics and expertise". So a reader could not tell a subject someone has
 * published on from a checkbox they ticked during onboarding, and the record's
 * topic filter offered chips seeded from interests that matched no entry at
 * all: every one of those was a link to "Nothing here yet".
 *
 * The two are now separate all the way through:
 *
 * - **Demonstrated topics** come only from tags on published authored or
 *   accepted co-authored work. Every one of them resolves to at least one
 *   record entry, so every chip is a live filter.
 * - **Interests** are what the author declared. They are a statement of
 *   direction, never evidence, and they never seed a record filter.
 *
 * The two views still have to agree on the demonstrated list and its order:
 * the profile renders the leading topics as chips that link into the record's
 * topic filter, and a chip resolving to a filter the record does not offer is
 * a dead link.
 */

export interface TaggedPost {
  in_response_to?: string | null;
  tags?: string[] | null;
}

/** How many topics a surface offers before it stops being a filter row. */
export const PROFILE_TOPIC_LIMIT = 8;

/** How many demonstrated topics the header carries beside the identity. */
export const PROFILE_HEADER_TOPIC_LIMIT = 3;

export interface DemonstratedTopic {
  /** Case-insensitive grouping key; also the record filter's URL value. */
  key: string;
  /** First spelling encountered, so the display keeps the author's casing. */
  label: string;
  /** Published entries tagged with this topic, for a count beside the chip. */
  count: number;
}

/**
 * Tags are author-entered free text, so "Poetry" and "poetry" are one topic
 * with two spellings. Grouping is by this key and the label shown is the
 * first spelling encountered.
 */
export function profileTopicKey(label: string) {
  return label.trim().toLowerCase();
}

/**
 * Ranks the topics an author has actually published on, most-tagged first.
 *
 * Responses are skipped: a reply carries the tags of the conversation it joins
 * rather than a claim about what its author works on. Note that the record's
 * topic *filter* still matches tagged responses, because a reader who asked
 * for a topic should see everything on it; this function decides only what an
 * author's work is about, which is a narrower question.
 */
export function deriveDemonstratedTopics(
  posts: TaggedPost[],
  limit: number = PROFILE_TOPIC_LIMIT
): DemonstratedTopic[] {
  const counts = new Map<string, DemonstratedTopic>();

  for (const post of posts) {
    if (post.in_response_to) continue;
    for (const rawTag of post.tags ?? []) {
      const label = rawTag.trim();
      if (!label) continue;
      const key = profileTopicKey(label);
      const existing = counts.get(key);
      counts.set(key, {
        key,
        label: existing?.label ?? label,
        count: (existing?.count ?? 0) + 1,
      });
    }
  }

  return [...counts.values()]
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label)
    )
    .slice(0, Math.max(0, limit));
}

/**
 * Display casing for one declared interest.
 *
 * Interests reach a profile from two places: a curated onboarding list that is
 * already title-cased ("Politics & Governance"), and free text an author types
 * ("law", "public policy"). Both land in the same row of chips, so the row
 * carried two casings at once. Anything already holding a capital comes back
 * untouched, because recasing "ORCID" or "pan-African" to a rule would be
 * worse than the inconsistency this fixes.
 */
export function formatInterestLabel(interest: string) {
  const label = interest.trim();
  if (/[A-Z]/.test(label)) return label;
  // The hyphen leads the class so it reads as a literal, not a range.
  return label.replace(
    /(^|[- /])([a-z])/g,
    (_match, prefix: string, letter: string) => prefix + letter.toUpperCase()
  );
}

/**
 * The interests an author declared, deduplicated case-insensitively and
 * trimmed of any that their published work already demonstrates.
 *
 * Dropping the overlap is what keeps the distinction readable: a topic printed
 * in both places would invite exactly the reading the split exists to prevent,
 * that a declared interest is a weaker kind of evidence rather than a
 * different kind of statement.
 */
export function deriveDeclaredInterests(
  declared: string[] | null | undefined,
  demonstrated: DemonstratedTopic[] = [],
  limit: number = PROFILE_TOPIC_LIMIT
): string[] {
  const seen = new Set(demonstrated.map((topic) => topic.key));
  const interests: string[] = [];

  for (const rawInterest of declared ?? []) {
    const label = rawInterest.trim();
    if (!label) continue;
    const key = profileTopicKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    interests.push(label);
    if (interests.length >= limit) break;
  }

  return interests;
}
