// The static section switches (fellowships, ambassadors, talent marketplace)
// went with those products in the publishing reset, Phase 2D. The profile
// positioning, featured-work-notes and AI topic suggestion gates went with
// their features in Phase 2G, and the author subscription, subscription UX V2
// and topic subscription gates in Phase 2H.
//
// RESEARCH_TYPE_QUERY_EXCLUSION went in Phase 2I. It was the filter every post
// query carried to keep legacy `type = 'research'` rows out of feeds, search
// and discovery. There are no such rows: 20260915000005 normalized all five of
// them into Articles, and 20260915000006 made the value unwritable. A filter
// against a value the database refuses to store is not a safety net, it is a
// line of code that has to be explained to the next reader.
//
// What is left here is one release gate for database objects.

/**
 * Gates the credibility graph's citation edges. It also gated the public
 * recognition and demonstrated-expertise sections and verified opportunity
 * outcomes, all of which have since been removed.
 *
 * Production was confirmed on 2026-09-06 NOT to have this schema:
 * post_citation_edges, profile_recognitions and
 * opportunity_applications.outcome_verified_at are all absent. The gate must
 * stay off.
 *
 * The reason it exists is the release-gate one: the credibility migrations add
 * a column to post_references and two new tables, and a select naming any of
 * them before 20260827000001 to 20260827000003 are applied fails outright. Set
 * to 1 only after all three are applied and verified.
 */
export function isCredibilityGraphEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CREDIBILITY_GRAPH_ENABLED === "1";
}
