/**
 * Shared shape and ordering for the follower and following lists.
 *
 * These two pages ask `follows` the same question from opposite ends, so the
 * one thing they must agree on is how the answer is ordered.
 */
export interface RelationshipProfile {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  avatar_url: string | null;
}

/**
 * Orders by display name, case-insensitively, with the username as the
 * tiebreak so the sequence is stable across requests.
 *
 * `follows` stores no timestamp, so recency is not available to sort by, and
 * inventing an order that looks chronological would say something about the
 * relationships that the table does not know. Alphabetical claims nothing:
 * it is a way to find a name in a long list, which is what these pages are
 * for.
 */
export function sortRelationshipProfiles<T extends RelationshipProfile>(
  profiles: T[]
): T[] {
  return [...profiles].sort((a, b) => {
    const left = (a.full_name ?? a.username).trim();
    const right = (b.full_name ?? b.username).trim();
    const byName = left.localeCompare(right, undefined, { sensitivity: "base" });
    return byName !== 0 ? byName : a.username.localeCompare(b.username);
  });
}
