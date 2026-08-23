// Static controls for whether selected sections are surfaced. These are not
// authorization checks or route guards: a route remains reachable unless it
// explicitly reads its flag. Toggle only when the section has enough verified
// volume and operational support to feel alive.
export const FEATURE_FLAGS = {
  // Temporary product kill switch. Keep every Research surface and mutation
  // behind this value so the feature can be restored in one place.
  research: false,
  debates: true,
  fellowshipsSection: false,
  ambassadors: false,
  talentMarketplace: false,
} as const;

export const RESEARCH_UNAVAILABLE_MESSAGE =
  "Research is temporarily unavailable.";

export function isResearchEnabled(): boolean {
  return FEATURE_FLAGS.research;
}

// Post.type is constrained to known content types, so this sentinel matches
// nothing when Research is enabled and lets shared query chains stay intact.
export const RESEARCH_TYPE_QUERY_EXCLUSION = FEATURE_FLAGS.research
  ? "__research_feature_enabled__"
  : "research";

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
