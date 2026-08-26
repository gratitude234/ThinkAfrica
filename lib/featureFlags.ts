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

/**
 * Gates reads and writes of the additive profiles.positioning_statement
 * column so this code can be deployed before its migration is applied.
 *
 * Without the gate the ordering is unforgiving: PostgREST rejects a select
 * naming a column that does not exist, and the profile page treats that
 * rejection as a missing profile, so deploying ahead of the migration would
 * turn every public profile into a 404. Set to 1 only after
 * 20260826000001_profile_positioning_statement.sql is applied and verified.
 */
export function isProfilePositioningEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PROFILE_POSITIONING_ENABLED === "1";
}

/**
 * Gates reads and writes of profile_featured_posts.feature_note and the v2
 * replacement RPC, for the same reason as the positioning gate above: a
 * select naming a column PostgREST does not know about fails outright, and
 * this one is on the public profile query. Set to 1 only after
 * 20260826000002_featured_work_notes.sql is applied and verified.
 */
export function isFeaturedWorkNotesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURED_WORK_NOTES_ENABLED === "1";
}

/**
 * Gates the Phase 3 credibility graph: citation edges, the public recognition
 * and demonstrated-expertise sections, and verified opportunity outcomes.
 *
 * Same reason as the gates above. The credibility migrations add a column to
 * post_references and two new tables; a select naming any of them before
 * 20260827000001 to 20260827000003 are applied fails outright, and one of
 * those selects sits on the public profile. Set to 1 only after all three are
 * applied and verified.
 */
export function isCredibilityGraphEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CREDIBILITY_GRAPH_ENABLED === "1";
}
