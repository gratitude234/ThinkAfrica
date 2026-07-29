// Single source of truth for what's surfaced in nav.
// Toggle to true when the section has enough volume to feel alive.
export const FEATURE_FLAGS = {
  debates: true,
  fellowshipsSection: false,
  ambassadors: false,
  talentMarketplace: false,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export function isEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag];
}

/**
 * Author subscriptions depend on database objects that are deliberately
 * release-gated. Keep the runtime check separate from the static navigation
 * flags so code can be deployed before the migration without querying tables
 * that do not exist yet.
 */
export function isAuthorSubscriptionsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED === "1";
}

/**
 * Topic subscriptions extend the durable author-publication delivery
 * infrastructure, so the topic flag can never enable them independently.
 */
export function isTopicSubscriptionsEnabled(): boolean {
  return (
    isAuthorSubscriptionsEnabled() &&
    process.env.NEXT_PUBLIC_TOPIC_SUBSCRIPTIONS_ENABLED === "1"
  );
}
