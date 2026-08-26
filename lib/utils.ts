export type PostType = "blog" | "essay" | "policy_brief" | "research";

export const QUICK_TAKE_MAX_WORDS = 200;

export function isQuickTake(type: string, wordCount: number): boolean {
  return type === "blog" && wordCount > 0 && wordCount < QUICK_TAKE_MAX_WORDS;
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatMonthYear(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
}

/**
 * The named entities an editor body realistically produces. Stored excerpts
 * are cut from Tiptap HTML, so what arrives here is whatever the serializer
 * emitted: `&nbsp;` for a run of spaces, `&amp;` for an ampersand, and the
 * curly quotes a word processor pasted in. Anything outside this list is
 * handled by the numeric branch below or left alone.
 */
const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  shy: "",
  hellip: "…",
  // This is the character `&mdash;` decodes to, not copy. An author who typed
  // an em dash in their own prose is entitled to keep it; the house style
  // governs strings the product writes, and dropping the mapping would leave
  // "&mdash;" printed literally in their excerpt.
  // eslint-disable-next-line no-restricted-syntax
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  laquo: "«",
  raquo: "»",
  middot: "·",
  bull: "•",
  dagger: "†",
  Dagger: "‡",
  prime: "′",
  Prime: "″",
  times: "×",
  divide: "÷",
  plusmn: "±",
  minus: "−",
  deg: "°",
  micro: "µ",
  para: "¶",
  sect: "§",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  hearts: "♥",
};

/**
 * Every Unicode space an entity or a paste can introduce. They are real
 * characters rather than whitespace to `\s` in every engine, so a `&nbsp;`
 * decoded into U+00A0 survives a `\s+` collapse and reaches the reader as a
 * gap the author never typed.
 *
 * The class holds U+00A0, U+1680, U+2000 through U+200A, U+202F, U+205F and
 * U+3000. They are written as themselves rather than as escapes so the set is
 * one grep away from any excerpt bug report.
 */
const UNICODE_SPACES = /[   -   　]/g;

/**
 * Zero-width and bidi marks a paste carries in but a reader never sees:
 * U+200B through U+200D, U+2060 and U+FEFF.
 */
const INVISIBLE_MARKS = /[​-‍⁠﻿]/g;

function decodeNumericEntity(raw: string, radix: 10 | 16) {
  const code = Number.parseInt(raw, radix);
  if (!Number.isFinite(code)) return null;
  // Lone surrogates and out-of-range code points would throw in
  // fromCodePoint; C0/C1 controls are not text an excerpt should carry.
  if (code < 0x20 || code > 0x10ffff) return null;
  if (code >= 0xd800 && code <= 0xdfff) return null;
  if (code >= 0x7f && code <= 0x9f) return null;
  return String.fromCodePoint(code);
}

/**
 * Decodes HTML entities in one pass, so an escaped entity stays escaped:
 * `&amp;lt;` becomes the literal text `&lt;` rather than a `<`. A second
 * decoding pass is what turns stored text into markup, which is exactly the
 * shape this function exists to prevent.
 *
 * Pure string work, so it runs identically in a Server Component and in the
 * browser. It never touches `document`, `DOMParser`, or `innerHTML`.
 */
export function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#[Xx][0-9A-Fa-f]+|#\d+|[A-Za-z][A-Za-z0-9]{1,31});/g,
    (match, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        return decodeNumericEntity(entity.slice(2), 16) ?? match;
      }
      if (entity.startsWith("#")) {
        return decodeNumericEntity(entity.slice(1), 10) ?? match;
      }
      const named = NAMED_HTML_ENTITIES[entity];
      return named === undefined ? match : named;
    }
  );
}

/**
 * Only a real tag is removed. The previous `<[^>]*>` also ate `< 10 >` out of
 * "5 < 10 > 3", so an excerpt that mentioned an inequality lost the middle of
 * its own sentence.
 */
const HTML_TAG = /<\/?[A-Za-z][^>]*>/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/**
 * Turns stored post HTML into the plain sentence a reader should see.
 *
 * Tags come off first, then entities are decoded, then tags come off a second
 * time: a body containing `&lt;script&gt;` decodes into text that looks like
 * markup, and while React would print it rather than run it, an excerpt is
 * prose and should not read as markup either.
 */
export function stripHtmlToText(value: string): string {
  const withoutMarkup = value.replace(HTML_COMMENT, " ").replace(HTML_TAG, " ");
  const decoded = decodeHtmlEntities(withoutMarkup);
  return decoded
    .replace(HTML_COMMENT, " ")
    .replace(HTML_TAG, " ")
    .replace(UNICODE_SPACES, " ")
    .replace(INVISIBLE_MARKS, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function generateExcerpt(content: string, maxLength = 200): string {
  const text = stripHtmlToText(content);
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength).replace(/\w+$/, "")}...`;
}

/**
 * The single normalization every excerpt surface shares. Stored excerpts were
 * cut straight from editor HTML, so production profiles were printing
 * "She was 7 years old.&nbsp; It was..." verbatim: the tag stripper never
 * looked at entities, and the decoded non-breaking space would not have
 * collapsed anyway.
 */
export function sanitizePostExcerpt(excerpt: string | null | undefined): string | null {
  if (!excerpt) return null;

  const cleaned = stripHtmlToText(excerpt).replace(
    /^(body|excerpt|abstract)\s*:\s*/i,
    ""
  );

  return cleaned || null;
}

// Falls back to a content-derived excerpt (rather than a generic string)
// when a post has no excerpt, so search engines/link previews get a
// real, content-specific description instead of an identical fallback
// shared across every excerpt-less post.
export function getPostMetaDescription({
  excerpt,
  content,
  fallback,
}: {
  excerpt: string | null | undefined;
  content: string | null | undefined;
  fallback: string;
}): string {
  const sanitizedExcerpt = sanitizePostExcerpt(excerpt ?? null);
  if (sanitizedExcerpt) return sanitizedExcerpt;

  const contentExcerpt = content ? generateExcerpt(content, 155) : "";
  if (contentExcerpt) return contentExcerpt;

  return fallback;
}

export function formatTimeUntil(dateString: string | null): string | null {
  if (!dateString) return null;

  const diffMs = new Date(dateString).getTime() - Date.now();
  if (diffMs <= 0) return "Ending soon";

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (days > 0) return `${days}d away`;
  if (hours > 0) return `${hours}h away`;
  return `${Math.max(1, minutes)}m away`;
}

export const POST_TYPE_LABELS: Record<PostType, string> = {
  blog: "Blog",
  essay: "Essay",
  policy_brief: "Policy Brief",
  research: "Research",
};

export const POST_TYPE_INTENTS: Record<PostType, string> = {
  blog: "Share a quick thought or observation.",
  essay: "Develop and defend an argument.",
  policy_brief: "Brief a policymaker on an issue.",
  research: "Publish a full research paper.",
};

export const POST_POINTS: Record<PostType, number> = {
  blog: 10,
  essay: 10,
  policy_brief: 30,
  research: 50,
};

/**
 * A response is worth less than the thing it answers, whatever form it takes.
 * Originating a piece is the harder act, and once comments exist there is a
 * lightweight way to reply that costs nothing -- so a Response should be worth
 * having without paying the same as an original post.
 *
 * Mirrored in award_points_on_publish() (see the comments-and-responses
 * migration); change both or stored and displayed points will disagree.
 */
export const RESPONSE_POINTS = 3;

/**
 * Points earned by publishing a post. Prefer this over indexing POST_POINTS
 * directly -- a post that answers another one scores as a response regardless
 * of its type.
 */
export function pointsForPost(post: {
  type?: string | null;
  in_response_to?: string | null;
}): number {
  if (post.in_response_to) return RESPONSE_POINTS;
  return POST_POINTS[(post.type as PostType) ?? "blog"] ?? 10;
}

export const MIN_WORD_COUNTS: Record<PostType, number> = {
  blog: 50,
  essay: 500,
  policy_brief: 400,
  research: 1500,
};

export const POINT_TIERS = [
  {
    name: "Contributor",
    min: 0,
    max: 99,
    color: "text-gray-600",
    bg: "bg-gray-100",
  },
  {
    name: "Scholar",
    min: 100,
    max: 499,
    color: "text-blue-700",
    bg: "bg-blue-100",
  },
  {
    name: "Fellow",
    min: 500,
    max: 1999,
    color: "text-purple-700",
    bg: "bg-purple-100",
  },
  {
    name: "Thought Leader",
    min: 2000,
    max: Infinity,
    color: "text-amber-700",
    bg: "bg-amber-100",
  },
] as const;

export function getPointTier(points: number) {
  return (
    POINT_TIERS.find((tier) => points >= tier.min && points <= tier.max) ??
    POINT_TIERS[0]
  );
}

export function getNextTier(points: number) {
  const index = POINT_TIERS.findIndex(
    (tier) => points >= tier.min && points <= tier.max
  );
  return index < POINT_TIERS.length - 1 ? POINT_TIERS[index + 1] : null;
}

export function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const weeks = Math.floor(diff / 604800000);
  const months = Math.floor(diff / 2592000000);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (weeks < 5) return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;

  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}
