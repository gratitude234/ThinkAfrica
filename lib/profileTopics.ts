/**
 * Display casing for one interest.
 *
 * Interests reach a profile from two places: a curated list that is already
 * title-cased ("Governance & Policy"), and free text an older signup typed
 * ("law", "public policy"). Both land in the same row on About, so the row
 * carried two casings at once. Anything already holding a capital comes back
 * untouched, because recasing "pan-African" to a rule would be worse than the
 * inconsistency this fixes.
 *
 * The publishing reset, Phase 2G, removed the demonstrated-topics index that
 * used to live here with the Intellectual Record it fed.
 */
export function formatInterestLabel(interest: string) {
  const label = interest.trim();
  if (/[A-Z]/.test(label)) return label;
  // The hyphen leads the class so it reads as a literal, not a range.
  return label.replace(
    /(^|[- /])([a-z])/g,
    (_match, prefix: string, letter: string) => prefix + letter.toUpperCase()
  );
}
