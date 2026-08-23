import slugify from "slugify";

const URL_LIKE_PATTERN =
  /https?:\/\/|www\.[a-z0-9-]+\.[a-z]{2,}|\b[a-z0-9-]{2,}\.(?:com|net|org|io|co|app|dev|africa|link|gg|ly|me|google)(?:\/|\b)/i;

export function looksLikeUrl(value: string): boolean {
  return URL_LIKE_PATTERN.test(value.trim());
}

export function stripUrlFragments(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\bwww\.\S+/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * The readable stem a title contributes to a slug, with no unique suffix. Split
 * out so callers can ask "does this slug already come from this title?" without
 * minting a throwaway slug to compare against.
 */
export function slugBaseFromTitle(rawTitle: string) {
  return slugify(stripUrlFragments(rawTitle || ""), { lower: true, strict: true });
}

export function buildSlugFromTitle(rawTitle: string, fallback: string, uniqueSuffix: string) {
  return `${slugBaseFromTitle(rawTitle) || fallback}-${uniqueSuffix}`;
}
