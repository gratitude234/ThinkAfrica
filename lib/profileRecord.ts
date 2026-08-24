export const PROFILE_RECORD_PAGE_SIZE = 20;

export const PROFILE_RECORD_ENTRY_KINDS = [
  "publication",
  "response",
  "debate",
  "research",
] as const;

export type ProfileRecordEntryKind =
  (typeof PROFILE_RECORD_ENTRY_KINDS)[number];

export const PROFILE_RECORD_FILTERS = [
  "all",
  "publications",
  "responses",
  "debates",
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
  debateCount: number;
  researchCount: number;
}

export const EMPTY_PROFILE_RECORD_SUMMARY: ProfileRecordSummary = {
  publicationCount: 0,
  sourceBackedCount: 0,
  citableCount: 0,
  responseCount: 0,
  debateCount: 0,
  researchCount: 0,
};

export interface ProfileRecordQuery {
  filter: ProfileRecordFilter;
  quality: ProfileRecordQuality;
  page: number;
}

type RawSummary = {
  publication_count?: unknown;
  source_backed_count?: unknown;
  citable_count?: unknown;
  response_count?: unknown;
  debate_count?: unknown;
  research_count?: unknown;
};

function toCount(value: unknown) {
  const count = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
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
    debateCount: toCount(row.debate_count),
    researchCount: toCount(row.research_count),
  };
}

function isRecordFilter(value: unknown): value is ProfileRecordFilter {
  return PROFILE_RECORD_FILTERS.includes(value as ProfileRecordFilter);
}

function isRecordQuality(value: unknown): value is ProfileRecordQuality {
  return PROFILE_RECORD_QUALITIES.includes(value as ProfileRecordQuality);
}

export function parseProfileRecordQuery(
  input: { type?: string; quality?: string; page?: string },
  includeResearch: boolean
): ProfileRecordQuery {
  let filter = isRecordFilter(input.type) ? input.type : "all";
  let quality = isRecordQuality(input.quality) ? input.quality : "all";
  const rawPage = input.page?.trim() ?? "1";
  const parsedPage = /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  if (!includeResearch && filter === "research") filter = "all";
  if (quality !== "all" && filter !== "publications" && filter !== "research") {
    filter = "publications";
  }

  return { filter, quality, page };
}

export function buildProfileRecordHref({
  username,
  filter = "all",
  quality = "all",
  page = 1,
}: {
  username: string;
  filter?: ProfileRecordFilter;
  quality?: ProfileRecordQuality;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("type", filter);
  if (quality !== "all") params.set("quality", quality);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/${username}/record${query ? `?${query}` : ""}`;
}

export function profileRecordFilterLabel(filter: ProfileRecordFilter) {
  const labels: Record<ProfileRecordFilter, string> = {
    all: "All",
    publications: "Publications",
    responses: "Responses",
    debates: "Debates",
    research: "Research",
  };
  return labels[filter];
}
