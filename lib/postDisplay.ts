/**
 * Presentation helpers for posts whose `title` may be null (Phase 2 of the
 * content-model migration; see docs/content-model.md). Centralizes the
 * "what do we show when there's no title" decision so it isn't
 * reimplemented ad hoc (or papered over with `title ?? ""`) at every read
 * surface.
 */

import { resolveContentKind } from "@/lib/contentModel";

interface TitledRecord {
  title?: string | null;
  content_kind?: string | null;
  type?: string | null;
}

interface AuthorNameSource {
  full_name?: string | null;
  username?: string | null;
}

/**
 * The title to render on-page, or null when there intentionally isn't
 * one (a lightweight Post) rather than a fabricated placeholder. Callers
 * that render a heading should treat null as "render no heading", not
 * "render an empty one".
 */
export function getPostDisplayTitle(record: TitledRecord): string | null {
  const trimmed = record.title?.trim();
  return trimmed ? trimmed : null;
}

/**
 * A title-shaped string for contexts that can't tolerate emptiness --
 * <title>/OG metadata, share text, JSON-LD headline, citation strings.
 * Always non-empty.
 */
export function getPostMetadataTitle(
  record: TitledRecord,
  author?: AuthorNameSource | null
): string {
  const displayTitle = getPostDisplayTitle(record);
  if (displayTitle) return displayTitle;

  const authorName = author?.full_name?.trim() || author?.username?.trim() || "an Indegenius author";
  return `Post by ${authorName}`;
}

/**
 * A ": \"Title\"" suffix for notification/email sentences of the shape
 * "{actor} liked your post{suffix}" -- empty when there's no title, so the
 * sentence reads as a clean "...liked your post" instead of
 * "...liked your post: null" (or a redundant "...your post: your post").
 */
export function getPostReferenceSuffix(record: TitledRecord): string {
  const displayTitle = getPostDisplayTitle(record);
  return displayTitle ? `: "${displayTitle}"` : "";
}

/**
 * A quoted title, or "your post" when there's no title -- for sentences
 * of the shape `liked "{value}"` where the quotes are baked into the
 * template around this value.
 */
export function getPostReferenceQuoted(record: TitledRecord): string {
  const displayTitle = getPostDisplayTitle(record);
  return displayTitle ? `"${displayTitle}"` : "your post";
}

/**
 * A newly created lightweight Post is distinguished from a legacy titled
 * Blog by BOTH signals together: the resolved content kind is "post" AND
 * the title is null. A legacy Blog that resolves to "post" but still has
 * its historical title keeps rendering through the existing Blog path --
 * only genuinely titleless records get the new lightweight treatment.
 */
export function isLightweightPost(record: TitledRecord): boolean {
  return resolveContentKind(record) === "post" && getPostDisplayTitle(record) === null;
}
