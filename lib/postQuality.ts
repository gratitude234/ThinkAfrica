/**
 * What is left of post quality after the publishing reset.
 *
 * This module used to hold the public quality badges, the feed's "why
 * surfaced" reason and the dashboard's quality checklist. Phase 2F removed all
 * three with the systems they served. The one survivor is the sitemap's check
 * for a title too thin to be worth indexing.
 */

const LOW_QUALITY_TITLE_PATTERN = /^(untitled|hmmm+|test|draft|new post|asdf+|\.+)\b/i;

export function isLowQualityTitle(title: string | null | undefined): boolean {
  const trimmed = (title ?? "").trim();
  if (!trimmed) return true;
  if (trimmed.length < 4) return true;
  return LOW_QUALITY_TITLE_PATTERN.test(trimmed);
}
