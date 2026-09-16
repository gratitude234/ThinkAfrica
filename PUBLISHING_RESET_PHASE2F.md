# Publishing Reset: Phase 2F

## Home, Feed and Retention Simplification

Branch `refactor/publishing-reset`. Uncommitted and unpushed, on top of Phases 1 to 2E.

## Executive Summary

Home is now a publication feed. It has two modes, For You and Following, and a list of Posts and Articles, each card showing the writer, when it was published, the content, an optional cover, up to two topics, and Like, Comment, Save and Share. Signed-out readers get the same feed under one sign-in notice. An empty feed says so in one line; an exhausted one says you are caught up.

Everything that used to surround the feed is gone: the sidebar Intellectual Brief (activation checklist, continue-draft card, Featured Today, writers to follow, topics), the Editor's Pick lead, the people and topic interludes at positions 3, 7 and 11, the welcome banner, the push-permission banner and its nudge policy, the This Week retention card and every activation and next-action nag. The Latest, Subscribed and Topics tabs are gone. The Daily Brief product is gone from the application, and a contract-tested migration that removes its production Cron job is ready and dry-run clean. The Featured Posts admin tool and the weekly digest preview are gone and redirect to `/admin`. The layout no longer writes a daily activity fact on every navigation.

For You is ranked by a model small enough to explain: relevance (followed writers, chosen topics), engagement (reads, likes and saves per impression) and freshness, over the newest 120 publications, then date order. Following is reverse-chronological. Every ranking input that came from a retired product is removed.

Home's data loading went from 9 to 11 parallel queries before the feed started, and about 36 round trips in total, to 3 viewer reads plus one page of the feed, 11 round trips in total. The dashboard is drafts, published work and four plain numbers.

## Home before and after

### What renders

| Region | Before Phase 2F | After |
|---|---|---|
| Above the feed | WelcomeBanner (`?welcome=1`), PushPromptBanner (members), retention event beacon | Retention event beacon (members), HomeGuestNotice (guests only) |
| Feed controls | Up to five tabs: For you (Discover for guests), Following, Subscribed or Topics, Latest; subscription source chips | For you and Following for members; none for guests |
| Feed head | HomeFeaturedLeadImpression: editor's pick, recommended or latest, with a provenance label | Nothing. The first card is the first publication |
| Feed | HomeFeedCard with a "why surfaced" line, university, co-author count; PeopleInterlude and TopicInterlude at 3, 7, 11 on mobile | HomeFeedCard: writer, time, content, cover, topics, actions. Publications only |
| Right column | BriefColumn wrapping HomeSidebar: continue draft or activation checklist, Featured today, writers to follow, topics | None. The feed is one 720px column, centred |
| End | Empty states per tab linking to Latest, Topics, Subscriptions | "No publications to show yet." / "Follow writers to see their Posts and Articles here." with one Explore link; "You're all caught up." |

### Query fan-out

Counted as PostgREST and RPC round trips for a signed-in member opening For You, page 1, on the Supabase adapter that production runs. Each count helper counts once.

| Stage | Before | After |
|---|---|---|
| Main layout, every navigation | 2: profile row, `record_user_activity_day` | 1: profile row |
| Home page, first parallel batch | 9 to 11: profile, follows, recent draft, 3 featured-candidate queries, topic subscriptions and author subscriptions (flagged), `get_my_profile_private`, `get_my_onboarding_state`, block exclusions | 0. The page reads only the session |
| Home page, follow-up batches | 12 to 13: featured-candidate reference and bookmark counts (2), suggested people (3), activation state (7), co-authored block exclusion (with blocks) | 0 |
| Reader context | Folded into the page batch above | 3: interests, follows, block exclusions (`lib/feedViewer.ts`) |
| Feed selection | 1 to 3: newest 121, plus reviewed and well-read evergreen arms once more than 120 posts are published, plus co-authored block exclusion | 1: newest 121, plus co-authored block exclusion with blocks |
| Reader signals | 2: `get_reader_affinity` (cached ten minutes), `get_viewer_post_engagement` | 0 |
| Card hydration | 8 to 9: likes, bookmarks, references, visible comments, profiles, co-author credits, viewer likes, viewer bookmarks, plus co-author names when any card has co-authors | 6: likes, bookmarks, visible comments, profiles, viewer likes, viewer bookmarks |
| **Total** | **about 36 (34 to 41)** | **11 (12 with a block list)** |

The parallel fan-out before the feed starts went from 9 to 11 queries to 3. Each later page through `/api/feed` went from 3 to 5 context reads plus about 13 feed reads, to 3 plus 7. Explore's Trending continuation (`personalized=0`) used to read the profile, follows and subscriptions and then discard them; it now reads the block list only.

Production had 210 published publications when checked (2026-09-15), past the 120-post window, so both evergreen arms were running on every For You page before this phase.

`lib/feedViewer.test.ts` pins the reader context to exactly the `profiles` and `follows` tables plus the block helper, with no RPC. `lib/publicationsFirstHome.test.ts` asserts that the Home page issues no query, that `PostsFeedSection` and `/api/feed` load their reader only through `loadFeedViewer`, that the viewer loader has two table reads, and that the layout has one.

## Feed tabs

Final modes: **For You** and **Following**. Defined once in `lib/homeFeedTabs.ts`, shared by the page, the client tabs and the feed API.

- Members see both. Guests see For You alone, with no tab strip, because a single mode is not a choice.
- Old addresses canonicalize: `?tab=latest`, `?tab=subscriptions`, `?tab=topics`, `?timeframe=`, `?source=` and `?welcome=` redirect to `/` (keeping `guest=1` and `tab=following`). `?type=` still hands over to Explore.
- `/api/feed` treats any retired mode as For You, so a page loaded before the deploy keeps scrolling. Cursors from retired modes are refused, which the client already recovers from by retrying by page number. A Following cursor minted before Phase 2F still continues.
- `lib/homeFeedTabs.test.ts` is the feed-mode contract; `lib/publicationsFirstHome.test.ts` fails if a retired mode name appears anywhere in the feed path.

## Home sidebar

Deleted: `components/ui/HomeSidebar.tsx`, `components/ui/BriefColumn.tsx` and their tests. The Intellectual Brief, activation card, Featured Today, writers-to-follow and topics cards went with them, and so did the queries that fed them (recent draft, featured today, suggested people, activation state, sidebar topics). `app/(main)/ContinueDraftRow.tsx` was already orphaned and was deleted with its test. No replacement column: on desktop the feed is a single centred column and the space around it is left empty. No "Intellectual Brief" language remains in application code.

## Featured lead

Deleted: `components/post/HomeFeaturedLead.tsx`, `HomeFeaturedLeadImpression.tsx`, the featured-candidate queries, provenance, scoring and de-duplication in Home, `createFeaturedExposure` and the `home_featured` surface, and the `featured` PostCard variant.

`posts.featured`: no application code reads or writes it. Removed `featurePostExclusively`, `setPostFeatured`, the `clearFeatured` repository method in both adapters, `checkCuration` and `CURATION_POST_COLUMNS`, the landing page's `order("featured")`, and the Featured Posts admin tool (`app/(main)/admin/review`, 4 files, and its `editorial.manage` capability and nav entry). `/admin/review` redirects permanently to `/admin`. The column and its historic values are untouched; `featured` stays in `NEVER_AUTHOR_WRITABLE_POST_COLUMNS` so no author can write it before it is dropped. **DATABASE DEFERRED.**

Editors held `editorial.manage` only for that tool, so editors no longer see the admin hub. Reviewers and editors keep `review.assigned`, which gates nothing since Phase 2A.

## People and Topic interludes

Deleted: `components/post/PeopleInterlude.tsx` (and test), `components/post/TopicInterlude.tsx`, the position logic (`getDiscoveryModuleOrder`, `getDiscoveryModuleAt`, breakpoints 3, 7, 11) and its test, the people-suggestion preload and props through `PostsFeedSection`, `PostsFeedTabs` and `PostFeed`, the interlude fixtures and preview sections. `PostFeed` renders publication cards and nothing else. There were no interlude analytics events or cache keys beyond the props. Explore keeps its own topic shelf (a local component in `app/(main)/explore/page.tsx`) and its People tab, which is where writer and topic discovery lives.

## Welcome and push banners

- **WelcomeBanner**: deleted. `?welcome=1` on Home now canonicalizes away. Onboarding completion sends new members to `/explore?welcome=1`, which Phase 2F does not touch (Explore's welcome belongs to Phase 2G).
- **PushPromptBanner**: deleted, with `components/push/usePushNudge.ts`, `lib/pushPromptPolicy.ts`, `lib/pushNudgeStorage.ts` (the local-storage nudge state) and their tests, the legacy seed Home built from `push_prompt_*`, and the `push_nudge_shown` and `push_nudge_action` events.
- **Kept, because push delivery survives**: service-worker registration, device subscribe, unsubscribe and test push in Settings (`lib/pushClient.ts`, which now owns `PushPermissionState`), `sendPushNotification` and its engagement cooldown (`last_engagement_push_notified_at`), `push_subscriptions`, and the `push_permission_resolved` and `push_device_operation` events from Settings.
- `push_prompt_shown_at`, `push_prompt_last_shown_at`, `push_prompt_attempt_count` are no longer normalized from `get_my_profile_private`, and stay protected in `lib/profilePrivilegeGuard.ts`. **DATABASE DEFERRED.**

## Retention

Removed:

- `components/retention/RetentionThisWeek.tsx` and `TrackedActionLink.tsx`, `lib/retention.ts` (`getRetentionSummary`).
- `components/ui/ActivationBanner.tsx` and `lib/activation.ts` (`getActivationState`, the five-task checklist) with their tests.
- `lib/profileNextAction.ts` and its test. The dashboard's portfolio next action and the Profile Command Center's recommendation panel went with it (`withNextAction`, `toNextActionState`, `trackNextActionClicked`, the `profile_next_action_clicked` event). The Command Center's section editing is untouched.
- `components/notifications/ActionInboxPanel.tsx` and test. Notifications themselves, and `lib/actionInbox.ts`, which the bell and the notifications page use, are untouched.
- `ProfileReminderButton` and its server action, which emailed profile-completion reminders to every incomplete profile. The "Profile reminders" email preference switch went with it.
- The `record_user_activity_day` call in `app/(main)/layout.tsx`. `user_activity_days` and the function stay. **DATABASE DEFERRED.** The admin Phase 0 baseline's two D30 return tiles are no longer shown, because they depend on that record.

Onboarding fields and signup completion are unchanged.

## Daily Brief

**Application: removed.** `app/api/cron/daily-brief/route.ts`, `lib/dailyBrief.ts` and its test, `getDailyBriefPushRecipients` and `broadcastPushNotification` (its only caller) in `lib/push.ts`, `push_daily_brief` from the push preference types, the Settings "Daily brief" switch and default, `DAILY_BRIEF_DRY_RUN` from the README, and the typecheck and read-registry entries. Stored `push_daily_brief` values stay in `notification_prefs`; a Settings save carries every stored key forward. **DATABASE DEFERRED.**

**Cron: scheduled in production, removal ready, not applied.** A read-only inspection on 2026-09-15 found `indegenius-daily-brief` active at `0 8 * * *` (job 9), alongside `indegenius-review-reminders`, and the four scheduler functions matching `20260906000003`.

- `supabase/migrations/20260915000002_remove_daily_brief_cron_job.sql`, generated from `20260914000001`'s definitions minus the daily brief job and the one install comment that named its 08:00 slot. It refuses to run on a database with telemetry, and refuses to run before `20260914000001` is applied, because out of order it would forget the still-scheduled review reminder job. It unschedules by job id before redefining dispatch, remove, inspect and install. No table, column or row is touched.
- `supabase/migrations/dailyBriefCronRemovalMigration.test.ts` derives the expected definitions from `20260914000001` on every run, and asserts the prerequisite guard, the telemetry guard, the remaining four jobs, the dispatch allowlist, that nothing else changes, and that the route is gone.
- `scripts/migration/apply-daily-brief-cron-removal.mjs --dry-run | --apply`. The dry run rehearses `20260914000001` first inside the same rolled-back transaction when it is still pending; `--apply` refuses until it has been applied.
- **Dry run against production, 2026-09-15: clean.** Before: cron-history-prune, cron-http-reconcile, daily-brief, publication-recovery, resend-segment-sync, review-reminders. After (rolled back): cron-history-prune, cron-http-reconcile, publication-recovery, resend-segment-sync. Remaining jobs unchanged, inspect agrees, dispatch refuses both removed jobs, no telemetry. Nothing committed.

**Admin digest: removed.** `/admin/digest` was a curated product, not part of broadcasting: a "Weekly Digest Preview" of the five most-viewed publications of the week, and a button that emailed it member by member through `sendUserEmail` to everyone with `email_digest` not false. It shared nothing with Broadcast Communications (`/admin/communications`: Resend broadcasts, segments, delivery webhooks, `email_announcements`), which is untouched. Removed the route (4 files), the `digest.manage` capability and nav entry, the `weekly_digest_previewed` event and the "Weekly digest" email switch. `/admin/digest` redirects permanently to `/admin`. Stored `email_digest` values stay. **DATABASE DEFERRED.**

## Feed ranking

### Before (`feed-v2.1.0`)

Score = 100 x (relevance x 0.30 + satisfaction x 0.25 + evidence x 0.20 + freshness x 0.15 + discovery x 0.10) x fatigue.

| Group | Inputs |
|---|---|
| Relevance | followed author 0.45, learned author affinity 0.15 (`get_reader_affinity`), topic 0.30 (declared interests, or learned topic affinity), same university 0.10 |
| Satisfaction | views 0.08, reads 0.35, likes 0.12, bookmarks 0.25, each per impression with a prior of 100 |
| Evidence | references (source-backed) 0.55, formal review via `citation_id` or `published_version_id` 0.45 |
| Freshness | 36-hour half-life for posts and articles, 30 days for research |
| Discovery | exploration bonus falling with impressions |
| Fatigue | repeat impressions 0.75 per impression, already read 0.25, floor 0.15 (`get_viewer_post_engagement`) |
| Candidates | newest 120, plus a reviewed arm (citation required, 90 days, 20) and a well-read arm (read count, 90 days, 40) |
| Diversity | two per author per twelve, counting accepted co-authors; topic separation between neighbours |
| Card enrichment | quality badges (Source-backed, Reviewed, Citable, Saved often, Verified author), a "why surfaced" reason, a quality score, co-author credits |

### After (`feed-v3.0.0`)

Score = 100 x (relevance x 0.35 + engagement x 0.30 + freshness x 0.35).

| Group | Inputs |
|---|---|
| Relevance | followed writer 0.60, a topic the reader chose (case- and space-insensitive) 0.40 |
| Engagement | reads 0.45, likes 0.30, saves 0.25, each per impression with a prior of 100. Exposure alone never raises a score |
| Freshness | 36-hour half-life |
| Exclusion | blocked writers, in either direction, and posts crediting them, removed in the query |
| Candidates | newest 120, then everything older in date order |
| Diversity | two per writer per twelve, primary author only, never dropping a post |
| Following | reverse-chronological by `(published_at, id)` keyset; never ranked |

## Ranking complexity

Deleted signals and why:

- **Citation identity and formal review** (evidence feature, reviewed evergreen arm, Reviewed and Citable badges): review and citations were retired in Phase 2A.
- **References as ranking evidence** and the Source-backed badge and reason: a credibility indicator, not engagement. References stay a composer feature.
- **Same university**: Campus is gone (Phase 2D) and Home is not a campus network.
- **Co-authorship** in diversity and cards: co-authoring was retired in Phase 2B.
- **Learned reader affinity, fatigue and the exploration lane** (`lib/readerSignals.ts`, two RPCs): three extra reads and a second model of the reader, hard to explain and not needed for a modest feed.
- **Views** and the **well-read evergreen arm**: a view says the headline worked; reads already carry the signal.
- **Featured flag and quality score**: the featured lead is gone, and the second scorer admin analytics and the topic page used went with the tiles and badges it fed.
- **Topic separation** in diversity: a preference that made results harder to predict for little gain.

Nothing replaced them. Code size, Phase 2F start to now: `lib/feedRanking.ts` 475 to 213 lines, `lib/feedData.ts` 1,490 to 574, `lib/feedExposure.ts` 323 to 258, `lib/db/feedList.ts` 554 to 342, `lib/db/feed.ts` 425 to 338, `lib/postQuality.ts` 440 to 17 (only the sitemap's `isLowQualityTitle` survives), `lib/readerSignals.ts` 238 to deleted. The exposure algorithm version moved to `feed-v3.0.0`, so exposures signed by pages open during the deploy stop verifying within 48 hours and those impressions record without placement attribution.

## Feed data model

- `FeedTabKey` is `"home" | "following"`. `FeedOptions` lost `userUniversity`, `authorSubscriptionIds`, `topicSubscriptionKeys` and `subscriptionSource`. The feed cursor binds to Following, its content filter and its timeframe.
- `FeedListCriteria` lost `coauthorUserIds`, `topicKeys`, `includeTopicKeys`, `requireCitation`, the `well_read` ordering and the `identity` projection; `listPostsWithCredits` is gone. The row no longer carries `citation_id` or `published_version_id`. Both adapters, the PostgreSQL test and the live parity harness moved together.
- `FeedRepository.hydrate` lost `referenceCount` and `coAuthors`; `coAuthorProfiles` is gone. Both adapters and their tests moved together.
- `PostCardData` lost `quality_badges`, `surface_reason`, `quality_score`, `subscription_match`, `co_authors` and `reference_count`. `PostCard` lost its quality badges, co-author badge and count, "Why surfaced" line, university line and the `editorial` and `featured` variants. `HomeFeedCard` lost its reason line, university and co-author count, and its `surface` prop.
- The feed is a list of publication cards. There is no mixed feed-item union.
- `SubscriptionFeedSource` and `SubscriptionMatchReason` had no remaining user and were removed.

Subscriptions: Home no longer reads `topic_subscriptions` or `author_subscriptions`, and the feed has no subscription branch. Follow, the subscribe control beside it, publication delivery, `/subscriptions`, topic subscribe buttons and the Settings managers are untouched.

## Dashboard

| Before | After |
|---|---|
| Retention event beacon | Retention event beacon (`dashboard_viewed`) |
| Header with New | Header with New |
| RetentionThisWeek (activated members) | Removed |
| ActionInboxPanel | Removed |
| PortfolioProgressCard with a profile next action | Removed |
| QualitySignals checklist | Removed |
| StatsBar: Published, Source-backed, Impressions, Views, Reads | StatsBar: **Published, Drafts, Views, Likes** |
| PostsTable | PostsTable (drafts and published work) |
| RecentActivity (liked posts) | Removed |

Reads went from at least 15 (posts, three stats, profile, featured work count, activation state's 7, the retention summary, unread notifications, liked history) to 4 (posts, three stats). `DashboardRepository` lost `myProfile`, `featuredWorkCount`, `unreadNotifications` and `engagementHistory` in both adapters, with their PostgreSQL and parity tests. Comments were not added as a stat: the dashboard did not already have a reliable count.

Admin analytics lost the profile-reminder button, the Activated Users tile, the Followed 3+ and Activated funnel stages, the Return Loop, Action Inbox and Draft Coaching sections, the quality-scored Promising Posts section, and the two Phase 0 D30 tiles; its reads went from 21 to 16. Publishing, discovery, platform health, the Phase 0 ordered baseline and the D1 and D7 event returns remain. The Editorial Trust and Profile Credibility sections are review and profile residue for later phases.

## Activation analytics

Vocabulary: **63 names before, 42 after.** Browser allowlist in `/api/activation`: **55 distinct names before** (57 entries, two duplicated), **39 after**.

Removed (21): `draft_started`, `publish_drawer_opened`, `home_tab_changed`, `weekly_digest_previewed`, `quality_check_viewed`, `quality_check_completed`, `reference_added`, `profile_next_action_clicked`, `profile_brief_created`, `profile_brief_revoked`, `research_hub_viewed`, `research_project_viewed`, `research_proposal_created`, `research_project_status_changed`, `research_update_published`, `research_asset_added`, `research_profile_updated`, `push_nudge_shown`, `push_nudge_action`, `ai_topic_suggestion_selected`, `topic_selection_skipped`. Each was either emitted only by a removed surface or by nothing at all.

Surviving (42), grouped as `lib/activationEvents.ts` now documents them:

- Signup and onboarding: `signup_completed`, `onboarding_started`, `onboarding_completed`, `onboarding_step_completed`, `interest_selected`
- Topic suggestions, written by the server only: `ai_topic_suggestion_requested`, `ai_topic_suggestion_succeeded`, `ai_topic_suggestion_failed`
- The publishing loop: `home_viewed`, `post_opened`, `post_submitted`, `comment_submitted`, `writer_followed`, `search_performed`, `dashboard_viewed`
- Explore: `discover_viewed`, `discover_tab_changed`, `discover_item_clicked`
- Notifications: `notification_opened`, `next_action_clicked`
- Landing: `landing_viewed`, `landing_read_clicked`, `landing_signup_clicked`
- Public profile funnel (Phase 2G): `profile_viewed`, `profile_work_opened`, `profile_follow_completed`, `profile_recognition_opened`, `profile_recognition_source_opened`, `profile_expertise_topic_opened`, `profile_brief_viewed`, `profile_brief_work_opened`, `profile_brief_contact_started`
- Profile editing (Phase 2G): `profile_command_center_viewed`, `profile_section_saved`, `profile_preview_opened`, `profile_feature_note_saved`
- Author subscriptions beside Follow: `author_subscription_created`, `author_subscription_removed`, `author_subscription_nudge_shown`, `author_subscription_nudge_action`
- Push delivery from Settings: `push_permission_resolved`, `push_device_operation`

The endpoint stays: onboarding, the post page, Explore, search, notifications, Follow and landing all still record through it. Historic `activation_events` rows keep their names. Like and bookmark have no activation events and none were added.

## Performance

Measured from the Home route's client reference manifest in the production build, captured from the pre-2F build before it was replaced:

| Measure | Before Phase 2F | After |
|---|---|---|
| Home entry JavaScript chunks | 8 | 7 |
| Home entry JavaScript | 464,214 bytes | 407,780 bytes (-12.2%) |
| Client module references in the Home manifest | 52 | 42 |
| Application client components referenced by Home | 14 | 9 |
| Routes in the build output | 77 | 74 (`/admin/review`, `/admin/digest`, `/api/cron/daily-brief` gone) |

Client components Home no longer references: `PushPromptBanner.tsx`, `BriefColumn.tsx`, `FollowButton.tsx`, `UserAvatar.tsx`, `WelcomeBanner.tsx`. The last two came in with the sidebar and the interludes. None were added.

- Server reads per Home render: about 36 to 11 (above). Parallel queries before the feed starts: 9 to 11, down to 3.
- Every navigation inside the app shell: one database write fewer.
- Home page source: `app/(main)/page.tsx` 525 to 106 lines, `PostsFeedTabs.tsx` 1,009 to 616, `PostsFeedSection.tsx` 168 to 66, `components/post/PostFeed.tsx` 195 to 40.
- Rendered component tree on Home: the page used to compose WelcomeBanner, PushPromptBanner, the beacon, a two-column grid, BriefColumn and HomeSidebar (four cards), and inside the feed HomeGuestNotice, up to five tabs and chips, HomeFeaturedLeadImpression and HomeFeaturedLead, PostFeed with HomeFeedCardImpression, PeopleInterlude and TopicInterlude. It now composes the beacon, HomeGuestNotice for guests, two tabs for members, and PostFeed with HomeFeedCardImpression.

## Database deferred

Kept in the database, unread and unwritten by the application, for the cleanup phase:

| Object | Notes |
|---|---|
| `posts.featured` | 1 row still holds `featured = true`, a historic value left untouched. Still refused to authors in `lib/postPolicy.ts` |
| `profiles.push_prompt_shown_at`, `push_prompt_last_shown_at`, `push_prompt_attempt_count` | Still returned by `get_my_profile_private`; still protected by `lib/profilePrivilegeGuard.ts` |
| `user_activity_days`, `record_user_activity_day()` | No writer since the layout call went. `get_phase0_measurement_baseline()`'s D30 figures depend on it and will go stale |
| `get_reader_affinity()`, `get_viewer_post_engagement()` | No caller. `record_post_engagement` and impressions stay: engagement ranking uses impression counts |
| `notification_prefs` keys `push_daily_brief`, `email_digest`, `email_profile_reminders` | Not offered in Settings; carried forward on save. `set_notification_preference`'s allowlist still names them |
| `cron_http_requests` daily brief rows | Aged out by `prune_indegenius_cron_history()` |
| `activation_events` rows with the 21 removed names | Historic |
| The `indegenius-daily-brief` and `indegenius-review-reminders` jobs | Until `20260914000001` and `20260915000002` are applied |

`profiles.last_engagement_push_notified_at` is **not** deferred: the push engagement cooldown still uses it.

## Orphan search

Occurrences of the named identifiers after implementation, outside `.next`, historical migrations and the phase reports:

| Name | Occurrences | Classification |
|---|---|---|
| HomeSidebar, BriefColumn, HomeFeaturedLead, PeopleInterlude, WelcomeBanner, PushPromptBanner, RetentionThisWeek, ActivationBanner | `lib/publicationsFirstHome.test.ts` (guard); `CHANGES.md` (WelcomeBanner) | KEEP (guard), HISTORICAL |
| TopicInterlude | `app/(main)/explore/page.tsx` local component; guard | KEEP: Explore's own topic shelf, discovery rather than a Home insert |
| dailyBrief, daily-brief, push_daily_brief | Guard; `lib/supabaseCronMigration.test.ts` pointer; `CHANGES.md`, `docs/publishing-core-v2-audit.md`; `supabase/pending/author_subscriptions_ux_v2.sql` preference allowlist; historical migrations | KEEP, HISTORICAL, DATABASE DEFERRED |
| featured | `lib/postPolicy.ts` refused column; profile Featured Work (a different, surviving concept); explanatory comments | DATABASE DEFERRED, KEEP |
| profileNextAction | `docs/profile-command-center.md`, now marked removed; guard | HISTORICAL, KEEP |
| record_user_activity_day | `app/(main)/layout.tsx` comment; `lib/phase0MeasurementMigration.test.ts` (asserts absence, and the historical migration's contract); `docs/phase0-measurement.md`, `docs/rpc-identity-migration.md`, `docs/read-migration-rpc-blockers.md`, `docs/post-page-query-path.md`, `docs/database-access-inventory.md`, `scripts/audit/fn-audit.json`; guard | KEEP, HISTORICAL (the docs describe the layout call as it was) |

Deleted as STALE along the way: `ContinueDraftRow` and its test (already orphaned), `PostFeed.test.ts`, the featured, sidebar, activation, writer, topic and co-author fixtures, `createFeaturedExposure`, `PostTransactionRollback`, `broadcastPushNotification`, `SubscriptionFeedSource`, `SubscriptionMatchReason`, the four dashboard repository methods, the retired feed-list criteria and hydration fields. `docs/feed-ranking-v2.1.md` carries a superseded note.

## Files

- **Deleted: 50 files, 5,671 lines.** `components/ui/{HomeSidebar,BriefColumn,WelcomeBanner,ActivationBanner}.tsx` (and tests for three), `components/post/{HomeFeaturedLead,HomeFeaturedLeadImpression,PeopleInterlude,TopicInterlude}.tsx`, `components/post/{HomeFeaturedLead,PeopleInterlude}.test.tsx`, `components/post/PostFeed.test.ts`, `components/push/{PushPromptBanner.tsx,usePushNudge.ts}`, `components/retention/{RetentionThisWeek,TrackedActionLink}.tsx`, `components/notifications/ActionInboxPanel.tsx` (and test), `components/profile/RecentActivity.tsx`, `lib/{pushNudgeStorage,pushPromptPolicy,activation,dailyBrief,readerSignals,profileNextAction}.ts` (and tests), `lib/retention.ts`, `app/api/cron/daily-brief/route.ts`, `app/(main)/ContinueDraftRow.tsx` (and test), `app/(main)/dashboard/{QualitySignals,PortfolioProgressCard}.tsx` (and test), `app/(main)/admin/analytics/{ProfileReminderButton.tsx,actions.ts}`, `app/(main)/admin/review/*` (4), `app/(main)/admin/digest/*` (4).
- **Modified: 87.** Home (`page.tsx`, `PostsFeedSection.tsx`, `PostsFeedTabs.tsx` and test, `FeedEmptyState.tsx`, `HomeGuestNotice.tsx`, `layout.tsx`), cards (`HomeFeedCard.tsx` and test, `HomeFeedCardImpression.tsx`, `PostCard.tsx`, `PostCardImpression.tsx`, `PostFeed.tsx`), feed (`lib/feedData.ts`, `feedRanking.ts`, `feedExposure.ts` and their tests, `lib/db/feed.ts`, `lib/db/feedList.ts` and their PostgreSQL and parity tests, `app/api/feed/route.ts` and test, `lib/discoverData.ts`, `lib/useViewImpression.test.tsx`, `lib/postEngagementServer.ts` and test), dashboard (`page.tsx`, `StatsBar.tsx`, `lib/db/dashboard.ts` and three tests), admin (`analytics/page.tsx`, `lib/adminAccess.ts`, `next.config.mjs`), featured writes (`lib/postMutations.ts` and PostgreSQL test, `lib/db/postWrites.ts`, `lib/postPolicy.ts`, `lib/db/postgres/connection.ts`, `app/(marketing)/landing/landingData.ts`), push and preferences (`lib/push.ts`, `lib/pushClient.ts`, `lib/email.ts`, `lib/publicationDelivery.ts`, `lib/profilePrivate.ts` and test, `app/(main)/settings/page.tsx`, `NotificationsForm.tsx` and test), profile next action (`lib/profileCommandCenter.ts`, `profileCommandCenterData.ts`, `profileOwnerAnalytics.ts`, `ProfileCommandCenter.tsx`, and their tests), activation (`lib/activationEvents.ts`, `app/api/activation/route.ts`), topic page, dev preview (page, test, fixtures and fixtures test), `lib/postQuality.ts` and test, tests touching retired paths (`AppShell.test.tsx`, `navRoutes.test.ts`, `writeFreeze.test.ts`, `notificationCatalog.test.ts`, `retiredProductFamilies.test.ts`, `phase0MeasurementMigration.test.ts`, `supabaseCronMigration.test.ts`, `profileSecurityMigration.test.ts`, `cronHttpRequestsMigration.test.ts`, `HomeGuestNotice.test.tsx`, `me/page.test.tsx`), and `CLAUDE.md`, `README.md`, `tsconfig.check.json`, `scripts/migration/read-registry.mjs`, `docs/feed-ranking-v2.1.md`, `docs/profile-command-center.md`.
- **Added: 9.** `lib/homeFeedTabs.ts` and test, `lib/feedViewer.ts` and test, `lib/publicationsFirstHome.test.ts`, `supabase/migrations/20260915000002_remove_daily_brief_cron_job.sql`, `supabase/migrations/dailyBriefCronRemovalMigration.test.ts`, `scripts/migration/apply-daily-brief-cron-removal.mjs`, this report.

## Tests

Final sequential run, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`:

| Check | Result |
|---|---|
| typecheck | passed (exit 0) |
| lint | passed (exit 0) |
| tests | Test Files 1 failed | 214 passed | 17 skipped (232); Tests 1 failed | 2452 passed | 250 skipped (2703) |
| build | passed (exit 0) |

The only failure is the known baseline: `supabase/migrations/parameterizeIdentityRpcsMigration.test.ts > write paths > check that the row they meant to change existed`. **New failures: 0.**

The first full run also failed four tests that asserted pre-2F behaviour, each corrected to the new contract rather than to a weaker one: `lib/profileSecurityMigration.test.ts` listed Home as a private-profile reader (it now asserts Home reads none), `app/(main)/HomeGuestNotice.test.tsx` expected the old "respond" copy, `supabase/migrations/cronHttpRequestsMigration.test.ts` expected the newest inspect set to name the daily brief job, and `app/(main)/me/page.test.tsx` expected editors to see Admin (see Featured lead).

New guards and contracts: `lib/publicationsFirstHome.test.ts` (retired modules and language, Daily Brief, `posts.featured`, push nudges, activity days, admin redirects, feed modes, Home's imports and reads, retired ranking signals, card metadata, dashboard modules, activation names), `lib/homeFeedTabs.test.ts` (the feed-mode contract), `lib/feedViewer.test.ts` (the three-read reader context), `supabase/migrations/dailyBriefCronRemovalMigration.test.ts`. Rewritten around the new model: `lib/feedRanking.test.ts`, `lib/feedData.test.ts`, `lib/feedExposure.test.ts`, `app/api/feed/route.test.ts`, `app/(main)/PostsFeedTabs.test.tsx`, `components/post/HomeFeedCard.test.tsx`, `app/dev-preview/feed/page.test.tsx`, `lib/postQuality.test.ts`.

### Route checks

Against a fresh production build on `next start`, signed out. Rows were picked in a read-only transaction; nothing identifying is recorded.

| Request | Result |
|---|---|
| `/?guest=1` | 200. Feed panel with 12 publication cards, one guest notice, no tab strip, one 720px column. No Intellectual Brief, featured lead, interlude, welcome or push banner, retention card, sidebar grid, retired tab or Daily Brief markup |
| `/` signed out | 307 to `/landing` |
| `/?guest=1&tab=latest`, `&tab=subscriptions`, `&welcome=1`, `&timeframe=week` | Redirect to `/?guest=1` |
| `/?guest=1&type=article` | Redirect to `/explore?type=article` |
| `/landing` | 200. No brief, Daily Brief or retention copy |
| `/explore` | 200, 16 cards |
| Post `/post/<slug>`, Article `/post/<slug>` | 200, 200 |
| `/topics/<tag>` | 200. No source-backed count, no "Why surfaced" |
| `/dashboard`, `/admin`, `/settings` signed out | 307 to `/login?redirectTo=...` |
| `/admin/review`, `/admin/digest` | 308 to `/admin` |
| `/api/cron/daily-brief` | 404 |
| `/dev-preview/feed` | 404 in production |
| `/api/feed?tab=latest` | 200, 12 posts served as For You: surface `home`, source `for_you_ranked`, `feed-v3.0.0`, no retired card fields |
| `/api/feed?tab=following` signed out | 200, no posts |
| `/api/feed?tab=home&page=11` | 200, 12 posts from the date-ordered tail (`for_you_tail`) |

The Home canonicalizing redirects answer 200 with a streamed redirect (a `__next-page-redirect` meta refresh and an RSC `NEXT_REDIRECT` 307), because the `(main)` segment's loading boundary has already sent the shell. The pre-existing `?type=` handoff to Explore behaves the same way. Browsers follow both.

Not checked in a browser session: the signed-in dashboard, Following and admin pages. Their contents are covered by `lib/publicationsFirstHome.test.ts`, the dashboard imports contract, and the component and route tests above.

Mobile and desktop: checked through the rendered HTML and the component tests, not by eye. Home renders one `max-w-[720px]` column with no sidebar grid classes, no interlude, banner or brief markup, and the tab strip only for members. The pinned tab strip keeps its shared sticky rule, full-bleed row and in-box border (jsdom tests). The bottom navigation and Write entry points were not changed by this phase. A visual pass on a device is still worth doing before release.

## Deployment debt

Still unapplied, in this order:

**Before the application deploy**

1. `node scripts/migration/apply-cron-removal.mjs --dry-run`, then `--apply` (review reminders, `20260914000001`).
2. `node scripts/migration/apply-daily-brief-cron-removal.mjs --dry-run`, then `--apply` (daily brief, `20260915000002`). Refuses to apply until step 1 is done. This deploy removes `/api/cron/daily-brief`, so without it the 08:00 job would call a missing route every day.

**Deploy the application.**

**After the application deploy**

3. `node scripts/migration/apply-messaging-write-disablement.mjs --dry-run`, then `--apply` (`20260915000001`).

`20260908000001_database_telemetry.sql` remains unapplied and stale. It must be rebased onto `20260915000002` before it is applied anywhere.

## Next phase recommendation

**Phase 2G: Profile and Onboarding Simplification.**

- Profile becomes a straightforward writer profile.
- Remove the Intellectual Record.
- Remove record metrics and evidence language.
- Posts, Articles and About.
- Simplify settings.
- Remove the persona taxonomy.
- Reduce onboarding to minimum identity plus optional topics.

Carry-over for 2G: the public profile funnel and Command Center events kept above, Explore's `?welcome=1` Intellectual Record welcome, the Profile Credibility section of admin analytics, `docs/profile-command-center.md`, and university as displayed profile data.
