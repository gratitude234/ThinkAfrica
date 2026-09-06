export const PROFILE_RECORD_PAGE_SIZE = 20;

export const PROFILE_RECORD_ENTRY_KINDS = [
  "publication",
  "response",
  "research",
] as const;

export type ProfileRecordEntryKind =
  (typeof PROFILE_RECORD_ENTRY_KINDS)[number];

export const PROFILE_RECORD_FILTERS = [
  "all",
  "publications",
  "responses",
  "research",
] as const;

export type ProfileRecordFilter = (typeof PROFILE_RECORD_FILTERS)[number];

export const PROFILE_RECORD_QUALITIES = [
  "all",
  "source_backed",
  "citable",
] as const;

export type ProfileRecordQuality =
  (typeof PROFILE_RECORD_QUALITIES)[number];

export interface ProfileRecordSummary {
  publicationCount: number;
  sourceBackedCount: number;
  citableCount: number;
  responseCount: number;
  researchCount: number;
  /**
   * The Article / Post split, or null when the database answering could not
   * supply it.
   *
   * Null is not zero and the difference matters to what renders: zero means
   * this author has published no Articles, null means the deployment has not
   * applied 20260907000001 yet and nothing is known either way. A surface
   * showing "0 articles" on the strength of a missing migration would be
   * stating a fact about the author that the database never asserted.
   *
   * Both are non-null once that migration is applied everywhere, at which
   * point the fallback in loadProfileRecordSummary and this nullability go
   * together.
   */
  articleCount: number | null;
  postCount: number | null;
}

export const EMPTY_PROFILE_RECORD_SUMMARY: ProfileRecordSummary = {
  publicationCount: 0,
  sourceBackedCount: 0,
  citableCount: 0,
  responseCount: 0,
  researchCount: 0,
  // Zero rather than null: an author with no record has no Articles and no
  // Posts, which is a fact rather than an absence of information.
  articleCount: 0,
  postCount: 0,
};

export interface ProfileRecordQuery {
  filter: ProfileRecordFilter;
  quality: ProfileRecordQuality;
  topic: string | null;
  page: number;
}

/**
 * Topics come from author-entered post tags, so a URL value is untrusted and
 * of unbounded length. Keys are lowercased because `deriveDemonstratedTopics`
 * groups case-insensitively: an author who wrote "Poetry" once and "poetry"
 * twice has one topic, and one filter has to find all three.
 */
export const PROFILE_RECORD_TOPIC_MAX_LENGTH = 60;

export function normalizeProfileRecordTopic(
  value: string | null | undefined
): string | null {
  const topic = value?.trim().toLowerCase() ?? "";
  if (!topic || topic.length > PROFILE_RECORD_TOPIC_MAX_LENGTH) return null;
  return topic;
}

type RawSummary = {
  publication_count?: unknown;
  source_backed_count?: unknown;
  citable_count?: unknown;
  response_count?: unknown;
  research_count?: unknown;
  article_count?: unknown;
  post_count?: unknown;
};

function toCount(value: unknown) {
  const count = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

/**
 * The same coercion, except that a key the row does not carry stays unknown.
 * v1 of the summary function returns no article_count at all, and reading
 * that absence as 0 is what would let a pre-migration deployment claim an
 * author has published nothing.
 */
function toOptionalCount(value: unknown) {
  return value === undefined || value === null ? null : toCount(value);
}

export function normalizeProfileRecordSummary(
  value: unknown
): ProfileRecordSummary {
  const row = (Array.isArray(value) ? value[0] : value) as RawSummary | null;
  if (!row || typeof row !== "object") return EMPTY_PROFILE_RECORD_SUMMARY;

  return {
    publicationCount: toCount(row.publication_count),
    sourceBackedCount: toCount(row.source_backed_count),
    citableCount: toCount(row.citable_count),
    responseCount: toCount(row.response_count),
    researchCount: toCount(row.research_count),
    articleCount: toOptionalCount(row.article_count),
    postCount: toOptionalCount(row.post_count),
  };
}

function isRecordFilter(value: unknown): value is ProfileRecordFilter {
  return PROFILE_RECORD_FILTERS.includes(value as ProfileRecordFilter);
}

function isRecordQuality(value: unknown): value is ProfileRecordQuality {
  return PROFILE_RECORD_QUALITIES.includes(value as ProfileRecordQuality);
}

export function parseProfileRecordQuery(
  input: { type?: string; quality?: string; topic?: string; page?: string },
  includeResearch: boolean
): ProfileRecordQuery {
  let filter = isRecordFilter(input.type) ? input.type : "all";
  let quality = isRecordQuality(input.quality) ? input.quality : "all";
  const topic = normalizeProfileRecordTopic(input.topic);
  const rawPage = input.page?.trim() ?? "1";
  const parsedPage = /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  if (!includeResearch && filter === "research") filter = "all";
  if (quality !== "all" && filter !== "publications" && filter !== "research") {
    filter = "publications";
  }

  return { filter, quality, topic, page };
}

export function buildProfileRecordHref({
  username,
  filter = "all",
  quality = "all",
  topic = null,
  page = 1,
}: {
  username: string;
  filter?: ProfileRecordFilter;
  quality?: ProfileRecordQuality;
  topic?: string | null;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("type", filter);
  if (quality !== "all") params.set("quality", quality);
  // Insertion order has to match the key order the record page uses when it
  // rebuilds the incoming URL to check it is already canonical. A mismatch
  // there is a redirect loop, not a cosmetic difference.
  const normalizedTopic = normalizeProfileRecordTopic(topic);
  if (normalizedTopic) params.set("topic", normalizedTopic);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/${username}/record${query ? `?${query}` : ""}`;
}

export function profileRecordFilterLabel(filter: ProfileRecordFilter) {
  const labels: Record<ProfileRecordFilter, string> = {
    all: "All",
    publications: "Publications",
    responses: "Responses",
    research: "Research",
  };
  return labels[filter];
}
