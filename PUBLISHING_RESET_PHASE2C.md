# Publishing Reset: Phase 2C

Branch `refactor/publishing-reset`, uncommitted, on top of Phases 1, 2A and 2B.
Nothing was committed or pushed. The zip changes are untouched.

## BLOCKING DEPLOYMENT STEP

**Apply `20260914000001_remove_review_reminders_cron_job.sql`.** It was not
applied in this phase, and it cannot be applied to production as things stand.

The project does have a way to apply a reviewed migration: the dry-run-then-apply
script pattern in `scripts/migration/apply-identity-migrations.mjs`. Before using
it, a read-only check compared production's scheduler with the repository:

| Check (production, read-only, 2026-09-14) | Result |
|---|---|
| `indegenius-review-reminders` job | still scheduled, active |
| `dispatch_indegenius_cron` | identical to the repository's newest definition |
| `remove`, `inspect` and `install_indegenius_cron_jobs` | **differ**: production has no `indegenius-db-telemetry` entry |
| `private.capture_db_telemetry()` | **absent** |
| `supabase_migrations.schema_migrations` since 20260901 | no versions recorded (migrations are applied by hand) |

So `20260908000001_database_telemetry.sql` was never applied to production. The
Cron migration redefines the scheduler from that migration's definitions.
Applied now, it would add a telemetry job to the inspect, install and remove
sets whose command calls a function that does not exist. It was not applied,
and nothing else was improvised.

What changed instead:

- The migration now opens with a guard. It raises before touching anything when
  `private.capture_db_telemetry()` is missing, so an out-of-order application
  aborts cleanly.
- `reviewRemindersCronRemovalMigration.test.ts` asserts the guard, and that it
  comes before the unschedule and the redefinitions.

To unblock, either apply `20260908000001_database_telemetry.sql` first and then
`20260914000001`, or decide not to ship telemetry and write a production-shaped
variant of the Cron removal. The removed review-reminders route answers 404
until then, once a day at 09:00 UTC. It was not recreated.

## Summary

Responses are no longer a product concept anywhere in the application. A post
with `in_response_to` set is an ordinary Post or Article: nothing counts, lists,
badges, ranks, scores, awards points for or reports on Responses. Discussion
counts are comments. The historic data is untouched and still readable.

## Production measurements

All counts are aggregate and read-only. No slug, title, username or content was
printed.

| Measure | Count |
|---|---|
| Published historic Responses | 16 (10 Post, 6 Article, 0 research), by 13 authors, answering 15 parents |
| Draft Responses | 19 |
| `response_post` notifications | 17 (6 unread), latest 2026-09-07 |
| Latest Response published | 2026-09-07 |
| Database functions reading `in_response_to` | `award_points_on_publish` (live trigger `on_post_published_points`), `get_campus_cohort_metrics`, `get_phase0_measurement_baseline` |
| Views reading `in_response_to` | `profile_record_entries` |
| Triggers writing `response_post` | none |

## Discussion counts

| Surface | Before | After |
|---|---|---|
| Post page actions row | comments + published Responses | comments |
| Feed cards (`FeedEngagementActions`, `PostCard`) | "N in this discussion", comments + Responses | "N comments" |
| Discussion heading | "Discussion · comments + Responses", with a split line | "Comments · N" (the `#discussion` anchor is kept) |
| Post page counts query | likes, bookmarks, comments, responses | likes, bookmarks, comments |
| Feed hydration | carried `response_count` per card | no response count |

`response_count` is gone from `PostCardData`, `RankablePost`, `FeedPostCounts`,
`PostPageCounts` and `DashboardPostStats`, and from both the Supabase and
Postgres implementations behind them.

## Parent publication

The parent's read-only Responses list is gone:
- `fetchResponsePage`, `fetchResponseCards`, `RESPONSE_PAGE_SIZE` and `ResponsePage`;
- `?responses=N` pagination;
- `feedRepository.responsePosts` in both adapters;
- the list section and its "Show more responses" link.

A parent shows its publication and then its comments.

## Historic Response presentation

**Decision: no parent attribution remains.** Each historic Response reads on its
own. Keeping a neutral "Originally written in reply to" line would have kept a
parent lookup on every render for 16 pages.

Removed:
- `ParentPostLink` on the article template;
- `ParentContextLine` on the post template;
- `postPageRepository.parentPost` in both adapters;
- the feed card's "Responding to" context line and parent hydration (`FeedParentPost`, `FeedResponseContext`, the response-context CTE);
- the `PostCard` "Response" badge;
- the `respondingTo` and `hideRespondingTo` card props.

The card hydration's follow-up read is now `coAuthorProfiles`, co-author names
only.

Checked against a fresh production build: all 16 historic Responses return 200
with no "Responding to", no Response badge, no Responses list and no Respond
control.

## Feed ranking

Removed from `getSatisfaction()` in `lib/feedRanking.ts`: the term
`boundedActionRate(response_count, impressions, 0.015) * 0.2`.

The other weights (views, reads, likes, bookmarks) are unchanged and nothing
replaced it. The satisfaction component's maximum falls from 1.0 to 0.8, for
every post equally. That applies wherever `scorePost` or `scoreCandidate` runs:
the home feed, Home's featured lead, topic pages, the daily brief and the admin
"Promising posts" table.

Also removed:
- the `onlyResponses` criterion: the type, the SQL `$14` condition (it was the last parameter, so nothing was renumbered), the Supabase branch, both parameter arrays and the callers' `onlyResponses: false`;
- the unused enrichment-visibility plumbing that existed only to filter parent context.

## Quality signals

Removed from `lib/postQuality.ts`:
- the `responseCount` and `isResponse` inputs;
- the "Response thread" badge;
- the "Active response thread" feed reason;
- the "Response context" checklist item;
- the "Responses" metric row.

The dashboard's quality card dropped its Discussion tile, which read that metric.

## Topics

Removed from `/topics/[tag]`:
- the Response count query;
- `response_count` on cards and scoring;
- `in_response_to` in the page's select;
- the "Active Conversations" sidebar, which ranked by Responses.

Topic posts are Posts and Articles.

## Explore

Removed:
- the "Active conversations" shelf (`ConversationsRailCard`);
- its data (`buildActiveConversations`, `DiscoverConversation`, `activeConversations`), which ranked and labelled posts by Responses.

Search had no Response signal.

## Profiles

- **`loadProfilePublications`:** the `isResponse` field and the `includeResponses` filter are gone. Historic Responses appear under Posts or Articles by `content_kind`.
- **Intellectual Record:** the `responses` filter and its label are gone. An old `?type=responses` link opens All.
- **Record kinds and counts:** entries the database view classifies as `response` are shown and tracked as publications. `publicationCount` adds the summary's `response_count`, so a Response counts once.
  - Marked `LEGACY COMPATIBILITY — existing Response publication` in `lib/profileRecord.ts` and `lib/profileRecordData.ts`.
- **Cards and labels:** `ProfileRecordCard` and Featured Work no longer label anything "Response", and `ProfileWorkKind` no longer has a `response` kind.
- **Demonstrated topics** now count a historic Response's tags like any other published work.
- **Summaries:** the `responseCount` in `lib/intellectualRecord.ts` summaries and the "Published responses" credibility badge are gone.

Checked: a profile holding a historic Response lists it, with no Response label
or category, on the profile and on the full record.

## Dashboard

- **Recent activity:** "Responded with" and "Posted a response" are gone, and the `response` activity type with them.
- **Quality inputs:** `responseCounts` are gone.
- **Repository:** `pendingInvites`, `recentResponses` and `conversationReadState` were re-audited, have no production caller, and are removed. So are:
  - their SQL, row types and Neon tests;
  - the co-author invite test in `authenticated.parity.live.test.ts`;
  - the read-cursor parity test in `viewerDomains.parity.live.test.ts`.
  - Messaging's own repository is untouched.
- **Engagement history** returns likes only.
- **Post stats** returns three buckets instead of four.

## Leaderboard

`RESPONSE_POINTS` and the Response branch of `pointsForPost` are gone, and
weekly points are by type only. `lib/responsePoints.test.ts` is replaced by
`lib/postPoints.test.ts`. No point history or trigger was changed.

## Notifications

- **Historic rows:** `response_post` rows still render and open the piece they announced. The descriptor is marked `LEGACY COMPATIBILITY — historic response_post notification`, filed under Activity, not actionable, at comment priority. The 6 unread rows no longer count as needing attention.
- **Category and filter:** the `responses` notification category, the "Responses" filter chip and the inbox group are gone.
- **Row styling:** the special `response_post` card and its "Read response" button are gone; the standard row renders it.
- **Settings:** no Response setting remains. The `email_responses` row went in 2B; the stored key is untouched.

## Analytics and retention

- **Admin analytics tiles removed:**
  - "Meaningful Response" and "Response Starters";
  - all three "Response Starts" tiles and "Response Items";
  - "Coauthor Invites" and "Accepted Coauthors".
- **Admin analytics, other changes:**
  - The Response-count query in "Promising posts" and the co-author count query are gone.
  - The collaboration section is now "Messaging", and messaging itself is out of scope.
  - "First contribution" is drafts only.
- **Retention:**
  - Removed: `responseStarts`, `publishedResponses`, the unread-Response next action, the `response_received` and `write_back` keys, and the published-Response count query.
  - The comment prompt's key is now `discuss`.
- **"This week" panel:** the Responses and Published responses tiles are gone.
- **Activation:** no Response started, no Response count toward engagement, "Read a relevant idea" copy.
- **Other surfaces:** the `responses` engagement surface is no longer accepted.
- **Copy:** Response copy is gone from:
  - the Home, Login, Sign-up and About pages;
  - the guest banner and the guest sign-in prompt ("Sign in to comment");
  - the welcome and profile-reminder emails.

Historic `activation_events` rows are untouched.

## Historic Response drafts (19)

Temporary compatibility, unchanged in the database:

- The composer shows no Response context and has no way to set or change a parent.
- `ensureContributionDraft` and `publishContribution` never write `in_response_to`, so a stored parent stays as it is.
- Publishing one sends no notification, and the result renders as an ordinary Post or Article.
- **Known database effect:** the live `award_points_on_publish()` trigger still awards 3 points, not 10 or 20, to a post published with a parent. Only these 19 drafts can reach it. It is documented, not changed; see Deferred.

## Database

No migration was written for Responses and no database object, row or column
was changed. Untouched:
- `posts.in_response_to` and all 16 published and 19 draft Responses;
- the 17 `response_post` notifications and the `email_responses` key;
- `award_points_on_publish()` and `on_post_published_points`;
- `profile_record_entries` and the record summary functions;
- `get_campus_cohort_metrics` and `get_phase0_measurement_baseline`;
- point history;
- every historical migration.

The one database file edited this phase is the un-applied `20260914000001`
migration, which gained its prerequisite guard.

## Guard tests

- **`lib/retiredResponseProduct.test.ts` (new).** Fails if any of these come back in `app/`, `components/` or `lib/`:
  - a `/responses` route, or the redirect disappearing;
  - `response_count` or `responseCount`;
  - `onlyResponses`, `fetchResponsePage`, `fetchResponseCards` or `responsePosts`;
  - `respondingTo`, `response_to`, "Responding to", `isResponse` or `ResponseStartLink`;
  - an "Active conversations" or "Response thread" shelf or badge;
  - any mention of Responses in `lib/feedRanking.ts` or `lib/postQuality.ts`;
  - `RESPONSE_POINTS`, `publishedResponses`, `responseStarts` or `"response_started"`.
  - Two exemptions are named with reasons: the record summary's count fold and the composer's retired parameter list.
- **`lib/postPoints.test.ts` (new).** A historic Response scores by its type.
- **Behaviour tests** now assert comments-only counts and no Response identity on cards and in the record. They also assert an ordinary card for a historic Response in the feed, no score change from a stray Response count, and a non-actionable historic `response_post`.
- **`lib/retiredCreationPaths.test.ts` (from 2B)** is unchanged and still passing.

## Deleted files

One: `lib/responsePoints.test.ts`, replaced by `lib/postPoints.test.ts`.
Everything else was removed from inside existing files.

## Modified files

91 modified in this phase (54 application, 33 tests, 4 documentation) and 2 test
files added.

Core areas:

- **Post page:** `post/[slug]/{page,PostConversationView,DiscussionSection,PostActionsRow}.tsx`.
- **Feed:** `lib/feedData.ts`, `lib/feedRanking.ts`, `lib/postQuality.ts`, `lib/dailyBrief.ts`, `app/(main)/page.tsx`.
- **Cards:** `components/post/{HomeFeedCard,PostCard,FeedEngagementActions}.tsx`.
- **Repositories (both adapters):** `lib/db/{feed,feedList,postPage,dashboard}.ts`.
- **Discovery:** `lib/discoverData.ts`, `explore/page.tsx`, `topics/[tag]/page.tsx`.
- **Profile:** `lib/{profileViewData,profileRecord,profileRecordData,profileTopics,profileCommandCenterData,intellectualRecord,profileCredibility,profileFunnel}.ts`, `components/profile/{ProfileRecordCard,FeaturedWork}.tsx`, `[username]/record/page.tsx`.
- **Dashboard:** `dashboard/{page,QualitySignals}.tsx`, `components/profile/RecentActivity.tsx`.
- **Points:** `lib/utils.ts`, `leaderboard/page.tsx`.
- **Retention:** `lib/{retention,activation}.ts`, `components/retention/RetentionThisWeek.tsx`.
- **Notifications:** `lib/{notificationCatalog,actionInbox}.ts`, `notifications/{NotificationItem,NotificationsPageClient}.tsx`, `lib/postEngagementServer.ts`.
- **Analytics:** `admin/analytics/{page,actions}.ts(x)`.
- **Copy:** landing, about, login, sign-up, `GuestBanner`, `lib/guestAuth.ts`, `(auth)/accountEmailActions.ts`, dev fixtures.
- **Migration:** `20260914000001_remove_review_reminders_cron_job.sql` and its contract test.
- **Docs:**
  - `CLAUDE.md`;
  - `docs/replies-comments-and-responses.md`, marked historical;
  - `docs/post-page-query-path.md` and `docs/profile-record-contract.md`, each with a "changed since" note.

## Route checks

Run against `next start` on a fresh production build, signed out.

| Route | Result |
|---|---|
| `/post/<historic Response>`, all 16 | 200. No "Responding to", Response badge, Responses list or Respond control |
| `/post/<parent>`, all 14 still published | 200. Comments heading, no Responses list |
| `/responses` | 308 to `/explore` |
| A Post | 200, comments heading, no Response identity |
| An Article | 200, comments heading, no Response identity |
| Profile holding a historic Response | 200. Lists it, no Response label or category |
| Its full record | 200. Lists it, no Response label or filter |
| Record `?type=responses` | 200, opens All |

The first pass reported the Article's comments heading missing. The server log
showed two `fetch failed` errors from post-page collection reads to Supabase on
that cold request, and the re-run passed. It was a transient network failure in
reads this phase did not change.

## Tests

| Check | Result |
|---|---|
| typecheck (`npm run typecheck`) | Pass |
| lint (`npm run lint`) | Pass, 0 problems |
| tests (`vitest run`) | 1 failed, 2,559 passed, 273 skipped. 251 files: 233 passed, 1 failed, 17 skipped |
| build (`npm run build`) | Pass, 69 static pages |
| baseline failure | `parameterizeIdentityRpcsMigration.test.ts`, "check that the row they meant to change existed" (unchanged) |
| new failures | 0 |

Fewer skipped tests than 2B (282) because Neon and live parity tests for the
removed repository methods were removed. A full-project `tsc` shows no type
error that was not already there.

## Deferred

- **Blocking:** the review-reminders Cron migration, after the telemetry decision (top of this document).
- **Database: points.** `award_points_on_publish()` still has its Response branch. It goes with the gamification database phase, or earlier if a legacy draft publishing for 3 points matters.
- **Database: Response data.** `posts.in_response_to`, the 19 draft parents, the 17 `response_post` rows, the `email_responses` key, and the `response_post` catalog descriptor once the rows are gone.
- **Database: views and functions.**
  - `profile_record_entries` still classifies `response` entries.
  - The record summary counts them apart. The app folds them into publications, but `source_backed_count`, `citable_count`, `article_count` and `post_count` still leave them out.
  - `get_campus_cohort_metrics` and `get_phase0_measurement_baseline` still read Responses.
- **Database: reads still selecting the column.** `in_response_to` is still selected by `lib/db` reads, parity field lists and a few page selects. No presentation reads it.
- **Phase 2D and later:**
  - Campus and Ambassadors copy and metrics ("Response received", "Response Loops").
  - The credibility graph's "Published response" kind.
  - The `lib/brand.ts` tagline.
  - The About page founder biography.
  - The reserved `responses` username.
- **Kept on purpose:**
  - The comment box's component name `InlineResponseComposer`.
  - The guest-auth intent key `respond`; its copy now says "comment".

## Next step: Phase 2D

Delete whole non-core products instead of polishing Response compatibility:
- Opportunities, Fellowships and Talent;
- Campus, Ambassadors and Alumni;
- Partners and the Policy Hub;
- their admin surfaces.

Include Messaging if its dependencies stay small, otherwise do it immediately
after. Resolve the blocking Cron step before deploying.
