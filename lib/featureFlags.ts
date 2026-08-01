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
 * UX V2 is independently reversible while retaining the live V1 relationship
 * and publication-delivery infrastructure.
 */
export function isAuthorSubscriptionsUxV2Enabled(): boolean {
  return (
    isAuthorSubscriptionsEnabled() &&
    process.env.NEXT_PUBLIC_TOPIC_SUBSCRIPTIONS_ENABLED === "1" &&
    process.env.NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_UX_V2_ENABLED === "1"
  );
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

/**
 * AI topic suggestions can ship before Topic Subscriptions. The flag also
 * gates reads/writes of the additive research_keywords column so application
 * code can be deployed before its pending migration is promoted.
 */
export function isAiTopicSuggestionsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AI_TOPIC_SUGGESTIONS_ENABLED === "1";
}
