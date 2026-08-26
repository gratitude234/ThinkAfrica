/**
 * Topic derivation, shared by the profile and its full record.
 *
 * The two views have to agree on the list and on its order: the profile
 * renders the leading topics as chips that link into the record's topic
 * filter, and a chip that resolves to a filter the record does not offer is a
 * dead link. This lived inline in the profile page while only that page used
 * it.
 */

export interface TaggedPost {
  in_response_to?: string | null;
  tags?: string[] | null;
}

/** How many topics a surface offers before it stops being a filter row. */
export const PROFILE_TOPIC_LIMIT = 8;

/**
 * Tags are author-entered free text, so "Poetry" and "poetry" are one topic
 * with two spellings. Grouping is by this key and the label shown is the
 * first spelling encountered.
 */
export function profileTopicKey(label: string) {
  return label.trim().toLowerCase();
}

/**
 * Ranks an author's topics by how often they tag their own work, then appends
 * any declared interest that their published work does not already cover.
 *
 * Responses are skipped: a reply carries the tags of the conversation it joins
 * rather than a claim about what its author works on.
 */
export function deriveProfileTopics(
  posts: TaggedPost[],
  declared: string[] | null | undefined,
  limit: number = PROFILE_TOPIC_LIMIT
) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const post of posts) {
    if (post.in_response_to) continue;
    for (const rawTag of post.tags ?? []) {
      const label = rawTag.trim();
      if (!label) continue;
      const key = profileTopicKey(label);
      const existing = counts.get(key);
      counts.set(key, {
        label: existing?.label ?? label,
        count: (existing?.count ?? 0) + 1,
      });
    }
  }

  const topics = [...counts.values()]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .map((topic) => topic.label);
  const seen = new Set(topics.map(profileTopicKey));
  for (const rawInterest of declared ?? []) {
    const interest = rawInterest.trim();
    if (!interest || seen.has(profileTopicKey(interest))) continue;
    topics.push(interest);
    seen.add(profileTopicKey(interest));
  }
  return topics.slice(0, limit);
}
