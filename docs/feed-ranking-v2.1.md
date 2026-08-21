# Feed ranking v2.1 — what changed and how to release it

Last updated: 2026-08-21.

Five changes to the For You feed, listed here in the order they should be
deployed. Three are migrations that have to be applied by hand through the
Supabase dashboard, and the code is written to work both before and after each
one, so the deploy and the migration do not have to be the same moment.

The exposure contract's `FEED_ALGORITHM_VERSION` moves from `feed-v2.0.0` to
`feed-v2.1.0`. Exposures recorded under the two are not comparable: the
candidate pool, the impression denominator, and the scorer all changed. Any
analysis that spans the release has to split on that string.

## 1. The candidate pool is no longer just "the newest 120"

`lib/feedData.ts` used to rank the newest `RANKED_FEED_WINDOW` posts and nothing
else. That is a pool that quietly stops working as the site grows. At a handful
of posts a day it is the whole archive and the limit is invisible. At 120 posts
a day, "For You" becomes "the last 24 hours, reordered": a paper published two
weeks ago is unreachable however good it is, and the evidence and satisfaction
features go flat because nothing in the window has had time to accumulate any.

The pool is now the union of two arms:

| Arm | What it takes | Limit |
|-----|---------------|-------|
| Recent | The newest posts, as before | `RANKED_FEED_WINDOW` (120) |
| Evergreen: reviewed | Older than the recent arm, last 90 days, `citation_id` set | `EVERGREEN_REVIEWED_LIMIT` (20) |
| Evergreen: well read | Older than the recent arm, last 90 days, by `read_count` | `EVERGREEN_WELL_READ_LIMIT` (40) |

Raw `read_count` is used for *recall* only, never for rank. What gets into the
pool and what wins inside it are separate questions; `scorePost` still judges on
rates.

Two invariants hold this together, and both have tests in
`lib/feedData.test.ts`:

- The evergreen arms are restricted to rows **strictly older than the recent
  arm's last row**, so the arms are disjoint and no post is scored twice.
- The evergreen union is **trimmed to a whole number of pages**. A ranked stream
  that is not a page multiple ends in a short page, and every tail page after it
  is then offset by the shortfall, which silently skips posts. Trimming loses
  nothing: the tail excludes only the candidates that were kept, so a dropped
  one still arrives later in date order.

Each card is labelled with the arm that supplied it (`for_you_ranked`,
`for_you_evergreen`, `for_you_tail`). The label is stripped from the card before
it reaches the client and travels on the signed exposure instead, so "did the
evergreen arm earn its place" is answerable from the logs.

## 2. The engagement diary is read back

`post_engagement_events` has recorded, per person, every card shown, every post
opened, and every post actually finished. Nothing read it back. Personalization
came entirely from the interest checkboxes someone ticked once during onboarding.

`lib/readerSignals.ts` adds two signals, both optional and both fail-soft:

- **Fatigue.** How many times this reader has already been shown this exact
  post, and whether they finished it. Applied as a multiplier on the finished
  score, floored so a post is demoted rather than disappeared. Without it the
  ranking is a pure function of the post, so the same cards lead the feed on
  Monday that led it on Sunday — including the ones the reader already looked at
  and passed over.
- **Learned affinity.** Which authors and topics this reader keeps *finishing*.
  Reads, not clicks: a click measures how good a headline was, a qualified read
  measures whether the piece was worth the time. A declared interest still counts
  in full and learned weight can only add, never contradict — the declared list
  is the only part of this a reader can directly correct.

Affinity is cached per user for ten minutes. Fatigue is not cached and is scoped
to the candidate ids being ranked, so "I have seen this three times today" is
true on the third scroll rather than ten minutes later.

## 3. Counts come from aggregates

`getCountsByPostId` answered "how many bookmarks" by selecting every bookmark row
and tallying it in JavaScript. The cost of that grows with success: a post with
5,000 bookmarks shipped 5,000 rows to print the number 5,000. A PostgREST
`db-max-rows` ceiling would also truncate an over-limit select silently, so the
feed would rank on quietly wrong numbers with nothing in the log.

Bookmarks and references become trigger-maintained counter tables on the
`post_like_counts` pattern. Comments deliberately do **not**: the feed's comment
count is per-viewer by design (RLS hides moderated rows, and an author still sees
their own hidden comment), so comments get a `SECURITY INVOKER` aggregate
function instead, which keeps the caller's RLS in force while letting Postgres do
the counting.

All three fall back to the old row count if the aggregate is unavailable, and the
fallback still throws on a genuine database failure rather than reporting zero.

## 4. Impressions dedupe per actor per day

Impressions were unique per `(post, actor, surface, day)` while views and reads
were unique per `(post, actor, day)`. One reader who met a post on Home, on
Latest, and in Explore on the same day produced three impressions and one view.
The post scored 1/3 for what was really 1/1, and the penalty landed hardest on
posts that surface in several places at once, which are usually the best ones.

`PRIOR_EXPOSURES` also moves from 20 to 100. At 20, a brand new post with a
single bookmark and no impressions saturated the bookmark feature and collected
5.4 of the available 100 points — more than half of what four references earn.
Bookmarks are private and free, so nobody would ever be seen doing it.

Impression counts can only fall as a result of this migration. Impressions appear
only in denominators and in the exploration term, so nothing gains rank from
exposure it did not earn.

## 5. One scorer

`getQualityScore` in `lib/postQuality.ts` is gone. It was a second, unbounded
formula that added raw counts together (`references * 18 + bookmarks * 14 +
views * 0.6 + …`), which is precisely the shape `lib/feedRanking.ts` was written
to replace. The daily digest and admin analytics used it while the feed used the
new scorer, so the email could lead with a post the feed then ranked sixth.

Everything now calls `scorePost` / `scoreCandidate`. Surfaces with no particular
reader (the digest, the analytics table, the topic page) use
`createAnonymousRankingContext()`, which zeroes relevance and fatigue and leaves
the part of the score that is a property of the work rather than of the audience.

`getPublicQualitySignals` returns badges only. `lib/discoverData.ts`'s
"active conversations" threshold was recalibrated from 35 on the old unbounded
scale to `ACTIVE_CONVERSATION_SCORE` (40) on the shared 0..100 one.

## Release order

Deploy the code first. It runs correctly against the un-migrated database: the
aggregates fall back to row counts, and the reader signals report "no history",
which is what a brand new reader looks like anyway.

Then apply, in this order:

1. `20260820000001_post_aggregate_counts.sql`
   Creates `post_bookmark_counts` and `post_reference_counts` with their
   triggers, backfills both for every existing post, and adds
   `count_visible_comments_by_post`.
2. `20260820000002_impression_dedupe_per_actor_day.sql`
   Collapses existing cross-surface duplicate impressions, swaps the unique
   index, and rebuilds `posts.impression_count` from the event log. Takes a
   write lock on `post_engagement_events`; `lock_timeout` is set to 5s so it
   fails fast rather than queueing behind traffic.
3. `20260820000003_reader_signals.sql`
   Adds `get_reader_affinity` and `get_viewer_post_engagement`, their supporting
   indexes, and the index behind the evergreen "reviewed" arm.

Migration 2 is the only one that rewrites existing rows. Run it during a quiet
window and check the row count it deletes against the number of posts that
genuinely appear on more than one surface.

## What to watch afterwards

- **Impression totals fall, engagement rates rise.** Expected, and the size of
  the jump is a direct measure of how much cross-surface double-counting was
  happening.
- **`for_you_evergreen` share of exposures.** If it is near zero the evergreen
  arms are not clearing the ranking; if it dominates, the freshness half-lives
  need revisiting before the limits do.
- **Repeat exposures per reader per post.** This is the number fatigue exists to
  move. If it does not fall, the reader signals are failing soft somewhere —
  check the logs for `[reader-signals]`, which prints once per process per
  distinct failure.
- **`[post-counts]` in the logs.** Any occurrence after migration 1 means an
  aggregate is unreadable and the feed is back on the row-count path.
