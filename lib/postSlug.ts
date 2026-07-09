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

export function buildSlugFromTitle(rawTitle: string, fallback: string, uniqueSuffix: string) {
  const cleanedTitle = stripUrlFragments(rawTitle || "");
  const base = slugify(cleanedTitle, { lower: true, strict: true });
  return `${base || fallback}-${uniqueSuffix}`;
}
