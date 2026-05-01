// Single source of truth for what's surfaced in nav.
// Toggle to true when the section has enough volume to feel alive.
export const FEATURE_FLAGS = {
  debates: true,
  webinars: false,
  fellowshipsSection: false,
  ambassadors: false,
  talentMarketplace: false,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export function isEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag];
}
