/**
 * Chooses which tab /debates opens on when the visitor didn't pick one.
 *
 * The list always landed on "active". With no active debates but a completed
 * one sitting behind another tab, that greeted every visitor with "No debate
 * is active right now" while real content went unmentioned -- the page
 * introducing itself as empty when it wasn't. /debates is a primary
 * destination now that it has a slot in the mobile bottom nav, so that first
 * screen matters.
 *
 * Kept as a plain module rather than living in page.tsx: the page is one large
 * async Server Component with no test coverage, and this rule is worth pinning
 * down directly.
 */

export type DebateLandingFilter =
  | "active"
  | "recruiting"
  | "completed"
  | "cancelled"
  | "recaps";

/**
 * Order tried when nothing is active. "cancelled" is deliberately absent --
 * leading with abandoned debates is a poor first impression -- and so is
 * "recaps", whose contents are a subset of "completed".
 */
const FALLBACK_ORDER: DebateLandingFilter[] = ["recruiting", "completed"];

export function resolveLandingFilter(
  requested: DebateLandingFilter,
  counts: Record<DebateLandingFilter, number>,
  isExplicit: boolean
): DebateLandingFilter {
  // Someone who actually clicked a tab gets that tab, empty or not. Quietly
  // redirecting a deliberate choice would be worse than showing nothing.
  if (isExplicit) return requested;

  if (counts[requested] > 0) return requested;

  return FALLBACK_ORDER.find((filter) => counts[filter] > 0) ?? requested;
}
