# Publishing Reset: Phase 2H

## Remove Subscriptions and Gamification; Make Follow the Only Social Relationship

Branch: `refactor/publishing-reset` (uncommitted, on top of `6df4a7d`). Date: 2026-09-15.

---

## 1. Executive Summary

Follow is now the only relationship between two members. It is one control,
"Follow" or "Following", backed by one row in `follows` and nothing else.

Removed from the application:

- **Author subscriptions:**
  - the subscribe bell, the UX V2 relationship drawer, confirmation dialog and nudges;
  - the `/subscriptions` manager and the settings managers;
  - the relationship RPC path through `set_author_relationship(_v2)`;
  - the subscriber notifications;
  - the viewer's subscription read on profile and post pages.
- **Topic subscriptions:**
  - the subscribe button and its server action;
  - every `topic_subscriptions` read.

  Topics stay browsable, and following a topic is still a profile interest.
- **Publication delivery:**
  - the delivery worker and its policy module;
  - the recovery cron route;
  - the tracked `/r/p/[token]` link;
  - delivery attribution on reads;
  - subscription email and push;
  - the Subscriptions notification filter and the two delivery preference settings.
- **Gamification:**
  - the leaderboard and My Stats;
  - points everywhere they were shown or ranked on, contribution tiers, `PointsTierBadge`;
  - the badge notification descriptor.

  The verified mark stays: it is identity verification.
- **Three release gates and four analytics events:**
  - the `NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED`, `NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_UX_V2_ENABLED` and `NEXT_PUBLIC_TOPIC_SUBSCRIPTIONS_ENABLED` gates;
  - the four `author_subscription_*` activation events.

Explore now suggests writers on shared topics, then recent publication, then username.

Two new migrations are written, contract-tested and dry-run against production
with rollback. Neither is applied:

- `20260915000003_remove_publication_recovery_cron_job.sql` removes only the
  `indegenius-publication-recovery` job.
- `20260915000004_stop_gamification_and_publication_capture_triggers.sql` drops
  the seven triggers that still awarded points and badges or captured
  publications for delivery. It changes no row.

Measured results:

| | Before | After |
|---|---|---|
| Profile page, signed-in visitor, database round trips | 8, or 9 with the author subscription gate on | 8 in every configuration |
| Activation vocabulary | 30 | 26 |
| Rows in the build's route table (same count for both builds) | 69 | 64 |

The five rows the route table lost are exactly `/subscriptions`,
`/leaderboard`, `/stats`, `/r/p/[token]` and
`/api/cron/process-publication-deliveries`. The 2G report's "74 to 72" used a
different count; the same count over both builds is 69 and 64.

Checks, run sequentially on a fresh build:

- typecheck 0;
- lint 0;
- tests: 1 failure, the allowed baseline;
- build 0;
- new failures: 0.

No table, column, function or row was dropped or changed. Every subscription
and gamification table is DATABASE DEFERRED to Phase 2J (§21).

---

## 2. Follow before/after

### Before

Follow was entangled with author subscriptions at every layer.

- **Server action.** `toggleFollow` branched on
  `NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED`:
  - With the gate on, it called `set_author_relationship`, or
    `set_author_relationship_v2` under UX V2. That one RPC wrote `follows` and
    `author_subscriptions` together and recorded a subscription source event.
  - With the gate off, it wrote `follows` directly.
  - `setAuthorSubscription` in the same module subscribed, and silently created
    the Follow underneath.
- **Four controls:**

  | Control | Behaviour |
  |---|---|
  | `AuthorRelationshipControls` | Follow plus a subscribe bell. Profile header, post conversation view, author card, article header. |
  | `AuthorRelationshipControlsV2` | Took over under UX V2. |
  | `AuthorRelationshipProvider` | Wrapped the post page twice. Held pending intent in `sessionStorage`, a confirm-before-unfollow dialog when subscribed, and subscribe toasts after a follow and after a qualified read. |
  | `FollowButton` | Explore. Delegated to the V2 controls under UX V2. |

- **Viewer reads.**
  - The profile repository asked `author_subscriptions` for a signed-in visitor
    when the gate was on.
  - The post page's viewer state asked it in both adapters, whatever the gate.
- **Blocking.** Deleted follows both ways, plus subscriptions both ways when
  the gate was on.
- **Notifications.**
  - A follow sent `follow` (in-app, and push under `push_follows`).
  - A subscription sent `author_subscribed` instead, and suppressed the follow
    notification for the same click.

### Production facts (read-only, 2026-09-15)

| | |
|---|---|
| `follows` rows | 814 |
| Grants | Full to `anon`, `authenticated`, `service_role` |
| INSERT policy "Authenticated users can follow" | `auth.role() = 'authenticated' AND auth.uid() = follower_id AND NOT is_blocked_pair(follower_id, following_id)` |
| DELETE policy | `auth.uid() = follower_id` |
| SELECT policy | `true` |
| Constraints | Primary key `(follower_id, following_id)`; check `follower_id <> following_id` |
| Triggers | None |

### After

- **One control:** `components/ui/FollowButton.tsx`.
- **One action:** `toggleFollow` in `components/ui/followActions.ts`. It writes
  only `follows`. It calls no RPC and no subscription code.

Preserved:

- follow and unfollow, and both counts;
- `/[username]/followers` and `/[username]/following`;
- the Following feed;
- the follow notification and its push;
- `writer_followed`;
- the profile funnel's `profile_follow_completed`;
- the block rules, now checked explicitly as well as by RLS.

---

## 3. Plain Follow implementation

### `toggleFollow({ followingId, follow, pathname })`

Checks run in this order:

1. **Signed in.** Otherwise: "You must be signed in to follow people."
2. **Not yourself.**
3. **Unfollow:** delete the viewer's own row.
4. **Follow:**
   1. `isBlockedPair(viewer, member)` in either direction. If blocked, it is
      refused with a sentence rather than an RLS error.
   2. An existing row is success.
   3. Otherwise insert. A `23505` unique violation from a concurrent click is
      success, and does not notify twice.
5. Revalidate the path.
6. On a new follow only, `after()` sends the `follow` notification and the
   `push_follows` push, after the response.

RLS still refuses the same writes in the database.

### `FollowButton`

- **Props:** `followingId`, `currentUserId`, `initialFollowing`, `authorName`,
  `source` (`profile`, `post_header`, `author_card` or `explore`), `postId`,
  `size` (`default` or `compact`), `onFollowCompleted`.
- **Label:** "Follow" or "Following". The accessible name adds the member:
  "Follow Ada Obi".
- **Rendering:** nothing on the reader's own work. A signed-out reader is sent
  to `/login?redirectTo=...`.
- **Optimistic flip:** reverts with a `role="alert"` message if the server
  refuses.
- **After a confirmed new follow only:**
  - records `writer_followed` with `{ authorId, postId? }` and the source;
  - calls `onFollowCompleted`, which the profile header uses for
    `profile_follow_completed`;
  - refreshes the route.
- **Refresh:** a new `initialFollowing` handed down after a refresh is adopted
  during render. The article page's header and author card therefore agree
  after either one is used, without the provider that used to do this.

### Where it renders

- the profile header;
- the article header and the author card;
- the post conversation view;
- Explore People and the Writers to follow rail.

Deleted:

- `AuthorRelationshipControls`, `AuthorRelationshipControlsV2` and `AuthorRelationshipProvider`, with their tests;
- `profileFollowFunnel.test.tsx`, whose cases moved to `FollowButton.test.tsx`;
- `setAuthorSubscription` and `notifyAuthorSubscribed`.

---

## 4. Author subscriptions

Removed from the application:

- the subscribe bell and V2 drawer, the confirm dialog and both nudges;
- `setAuthorSubscription`, and the RPC path through `set_author_relationship` and `set_author_relationship_v2`;
- the `author_subscribed` notification sender;
- the subscription state in the profile viewer read (`ProfileViewerRelationship.isSubscribed`, both adapters, the neon and parity tests);
- the subscription state in the post page viewer read (`PostPageViewerState.subscribed`, both adapters, `VIEWER_STATE_SQL`);
- the block action's subscription deletes;
- the Explore `subscribed` flag;
- the settings subscription section;
- the three release gates, `.env.example` entries and release documents (`docs/author-subscriptions-release.md`, `docs/topic-subscriptions-release.md`);
- the four activation events.

The database keeps `author_subscriptions` and `author_subscription_events`
(§10, §21). Nothing drops them in this phase.

---

## 5. Topic subscriptions

Removed:

- `components/topic/TopicSubscribeButton.tsx`, its test, and `topicActions.ts` (`set_topic_subscription`);
- the subscribe branch on Explore's Topics grid, `/topics` and `/topics/[tag]`;
- the `topic_subscriptions` reads in `lib/discoverData.ts`, `/topics`, `/topics/[tag]` and settings;
- `DiscoverData.topicSubscriptionKeys`;
- the "subscribe for a dedicated feed and in-app publication alerts" copy.

Kept:

- **Topics are browsable.**
- **Following a topic is a profile interest,** through the existing
  `setProfileInterests` toggle. Explore's Topics copy is now "Follow topics to
  shape your For you feed."
- **`/topics/[tag]` matches on `tags`,** which is the path production already
  ran with the gate off. `posts_sync_topic_keys` is not a subscription trigger
  and stays.
- **The topic page's side list,** now called "Writers on this topic". It lost
  its 1, 2, 3 numbering: it is a list, not a rank.

`topic_subscriptions` has 0 rows in production.

---

## 6. `/subscriptions`

- `app/(main)/subscriptions/page.tsx` and `SubscriptionsManagerClient.tsx` are deleted.
- So are `SubscribedAuthorsManager` and `SubscribedTopicsManager` in settings.
- `/subscriptions` redirects to `/explore` with a 308, in `next.config.mjs`.
  No placeholder page.
- The segment stays in `RESERVED_PROFILE_PATHS`, so no member can claim it.

---

## 7. Publication delivery

### Audit

Every piece existed only to deliver publications to subscribers.

| Piece | What it did | Decision |
|---|---|---|
| `lib/publicationDelivery.ts` | Channel policy, delivery notification copy, subscription grouping, provider result classification, claim rules, funnel summary, qualified read thresholds | Deleted. Only the qualified read rule was core; see below. |
| `lib/publicationDistribution.ts` | Claimed `publication_events`, matched author and topic subscribers, wrote `publication_deliveries`, sent `author_published` and `topic_published` notifications, email (`email_author_publications`) and push (`push_author_publications`), author funnel and subscriber growth for `/stats` | Deleted |
| `schedulePublicationDistribution` call in `app/(write)/write/actions.ts` | Kicked the worker after a publish | Removed |
| `/api/cron/process-publication-deliveries` | The recovery worker the cron job called | Deleted, with its test |
| `/r/p/[token]` | Tracked click-through: stamped `opened_at`, redirected to the post | Deleted. `/r/p/:token` redirects to `/`. |
| `lib/postEngagementServer.ts` delivery attribution | Validated a `deliveryToken`, added `distribution` metadata, stamped `viewed_at` and `qualified_read_at` | Removed. A stale `deliveryToken` is ignored. |
| `ViewTracker` delivery token and read nudge | Sent the token, keyed session dedupe on it, offered the subscribe nudge after a qualified read | Removed |
| `posts_capture_first_publication_event` trigger | One `publication_events` row per first publication | Dropped by `20260915000004` (§17) |

### Core behaviour extracted

`qualifiedReadThresholds` and `isQualifiedPublicationRead` moved to
`lib/postReadQualification.ts`, with its own test:

- 600 words or fewer: 15 active seconds and 50% scroll;
- longer: 30 seconds and 60%.

Qualified reads use it in both places:

- the browser decides when to report a read;
- the engagement route checks the authoritative word count.

No replacement email, push or delivery system was added.

### Historic delivery notifications

Production has 257 `author_published` rows, every one linking to a retired
`/r/p/` token. `notificationHref` now ignores a stored `/r/p/` link and opens
the post from `post_slug` instead. Emails already sent land on Home through the
redirect.

---

## 8. Publication recovery Cron

### Production scheduler, read first (2026-09-15, read-only)

| Job | Schedule |
|---|---|
| `indegenius-cron-history-prune` | `30 3 * * *` |
| `indegenius-cron-http-reconcile` | `1-59/5 * * * *` |
| `indegenius-daily-brief` | `0 8 * * *` (removal written, not applied) |
| `indegenius-publication-recovery` | `4-59/5 * * * *` |
| `indegenius-resend-segment-sync` | `20 2 * * *` |
| `indegenius-review-reminders` | `0 9 * * *` (removal written, not applied) |

The remove set still names review reminders and the daily brief. Telemetry is
not installed.

The recovery job dispatched 1,959 times in the previous seven days, every one
2xx. It did no delivery work in that time: the newest delivery row and the
newest completed event are both from 2026-08-17 (§10).

### Decision

Retire it. `indegenius-resend-segment-sync` stays: it keeps broadcast
recipients and campaigns in step with Resend for `/admin/communications`,
which has nothing to do with subscriptions.

### `supabase/migrations/20260915000003_remove_publication_recovery_cron_job.sql`

It follows the established pattern:

- **Step 0** refuses in three cases:
  - telemetry exists (the job or `private.capture_db_telemetry`);
  - `indegenius-review-reminders` is still scheduled or still in the remove set;
  - `indegenius-daily-brief` is.
- **Step 1** unschedules the recovery job by `jobid`, while the remove set
  still knows it.
- **Steps 2 to 5** redefine dispatch, remove, inspect and install. Each is
  `20260915000002`'s definition with every line naming the job removed, and
  nothing else.
  - The dispatch allowlist keeps the health probe and the Resend sync.
  - The remaining set is history prune, HTTP reconcile and Resend sync.
- **Grants** are identical. No table, trigger or row is touched.

The file was generated from `20260915000002` rather than hand-copied.
`supabase/migrations/publicationRecoveryCronRemovalMigration.test.ts` checks it
(14 tests) and re-derives the expected definitions from that file on every run.
It asserts:

- the order guards;
- no telemetry;
- the unschedule comes first;
- no removed job or route is named;
- the remaining set is consistent across remove, inspect and install;
- the broadcast sync and health probe stay dispatchable;
- scheduler-only changes;
- it is the newest definition of each function;
- the route is gone.

`cronHttpRequestsMigration.test.ts` was updated, because the newest inspect set
no longer names the recovery job.

### `scripts/migration/apply-publication-recovery-cron-removal.mjs`

`--dry-run` or `--apply`.

- **Dry run:** rehearses `20260914000001` and `20260915000002` first, in the
  same rolled-back transaction, when either is unapplied.
- **Apply:** refuses and names the script to run first.
- **Verifies:**
  - all three jobs are gone;
  - the remaining jobs are unchanged in name, schedule, command and state;
  - inspect agrees;
  - dispatch refuses all three removed pairs;
  - there is no telemetry.

### Dry run against production (rolled back)

```
Before: indegenius-cron-history-prune, indegenius-cron-http-reconcile, indegenius-daily-brief, indegenius-publication-recovery, indegenius-resend-segment-sync, indegenius-review-reminders
  20260914000001_remove_review_reminders_cron_job.sql is not applied here yet. Rehearsing it first, in this same rolled-back transaction.
  would apply 20260914000001_remove_review_reminders_cron_job.sql
  20260915000002_remove_daily_brief_cron_job.sql is not applied here yet. Rehearsing it first, in this same rolled-back transaction.
  would apply 20260915000002_remove_daily_brief_cron_job.sql
  would apply 20260915000003_remove_publication_recovery_cron_job.sql
After:  indegenius-cron-history-prune, indegenius-cron-http-reconcile, indegenius-resend-segment-sync
  verified: all three jobs gone, remaining jobs unchanged, inspect agrees, dispatch refuses all three, no telemetry
Dry-run clean (with 2 prerequisites rehearsed). Nothing was committed.
```

**Not applied.**

The route is removed in this change, so the cron removal must be applied
before the deploy (§22). Deployed first, the job would receive a 404 every five
minutes until the removal ran. That is harmless but noisy in the dispatch log.

---

## 9. Notification, email and push subscription cleanup

### Notifications

- **`NotificationCategory`** is `"review" | "activity"`.
  - The `subscriptions` category and group are gone.
  - The inbox's Needs attention and Subscriptions filters, and their UX V2
    default selection, are gone.
  - The inbox opens on All.
- **Nothing sends `author_published`, `topic_published` or `author_subscribed`
  any more.** Existing rows still render, as activity:
  - `author_published` and `topic_published` keep their own copy. The topic
    copy says "a topic you follow".
  - `author_subscribed` renders as "started following your work", with the
    follow label and priority. A subscriber always followed too.
  - The Article/Post eyebrow for delivery rows in the bell and the inbox is
    removed.
- **The `badge` descriptor is removed.** Production has 0 `badge` rows, and an
  unknown type renders with the generic fallback.
- **In-app preference group** `inapp_follows` is labelled "Followers". It still
  mutes historic `author_subscribed` rows.

### Email and push

- `email_author_publications` is removed from `NotificationPreferenceKey`.
- `push_author_publications` is removed from `PushPreferenceKey`.
- Both are removed from the settings defaults and the Notifications form.
- The form's UX V2 per-switch autosave branch and "Publication subscriptions"
  section are removed. Every environment file had the gates off, so production
  already used the Save preferences path, which remains.
- Stored JSONB keys are left in place: 2 profiles carry each key.

### Kept

- generic broadcasts;
- transactional auth email;
- follow, like, comment and editorial push.

No replacement email.

---

## 10. Production subscription measurements

Read-only aggregates, 2026-09-15.

| Table | Rows | Detail |
|---|---|---|
| `author_subscriptions` | 117 | 70 authors, 31 subscribers; newest 2026-08-17 |
| `author_subscription_events` | 112 | all `subscribed` |
| `topic_subscriptions` | 0 | |
| `publication_events` | 144 | 79 `completed` (newest 2026-08-17), 65 `pending` (newest 2026-09-12) |
| `publication_deliveries` | 715 | in_app sent 257, email sent 229, push sent 128, push skipped 101; newest 2026-08-17 |
| `follows` | 814 | |

Retired notification and analytics rows, kept as history:

| | Rows |
|---|---|
| `author_published` notifications | 257 (all with `/r/p/` links) |
| `author_subscribed` notifications | 5 |
| `topic_published`, `badge` notifications | 0 |
| `author_subscription_created` | 103 |
| `author_subscription_nudge_action` | 381 |
| `author_subscription_nudge_shown` | 458 |
| `author_subscription_removed` | 0 |
| Profiles storing `email_author_publications` / `push_author_publications` | 2 / 2 |

No delivery has been written, and no event completed, since 2026-08-17.
Meanwhile the capture trigger kept adding pending events and the recovery job
kept dispatching every five minutes. The delivery system was already inert in
production.

---

## 11. Leaderboard

- `app/(main)/leaderboard/page.tsx` and `loading.tsx` are deleted.
- `/leaderboard` redirects to `/explore` with a 308.
- Removed from `GuestBanner`'s route list, `scripts/migration/read-registry.mjs`
  and `CLAUDE.md`'s route tree. The only link to it, Explore's empty People
  state ("See top contributors"), now says "Browse topics".
- The segment stays reserved.

The page queried Supabase directly: posts with the author embed, and
`user_badges`. There were no leaderboard repository methods in either `lib/db`
adapter, no parity tests and no `READ_MIGRATED_DOMAINS` entry to remove.

---

## 12. `/stats`

### Audit

"My Stats" showed:

- Total Reads, Total Likes, Followers, New Followers and Active Subscribers;
- a subscriber growth chart and a publication delivery funnel, from `publicationDistribution`;
- a Points and Tier section with `PointsTierBadge`.

### Decision

Remove it; nothing moves.

- The dashboard already shows drafts, published work, views and likes (Phase 2F).
- Follower counts are on the profile.

Changes:

- `app/(main)/stats/page.tsx` and `loading.tsx` are deleted.
- `/stats` redirects to `/dashboard` with a 308.
- `/stats` is removed from `proxy.ts`'s protected list, `app/robots.ts` and
  `GuestBanner`. It stays reserved.

---

## 13. Points

Removed:

- `POST_POINTS` and `pointsForPost` from `lib/utils.ts`, and `lib/postPoints.test.ts`.
  `MIN_WORD_COUNTS` stays.
- `points` from people search:
  - `SearchPersonResult`;
  - `PEOPLE_SQL`;
  - the Supabase select;
  - the search page's "N pts" pill and "N points" signal.
- Points from Explore's person card signal, the suggestion ordering and the
  signed-out "Top contributors" list.
- The admin verification page's `points` select, `order("points")` and "N pts".
  It now lists most published first.
- The dashboard's "+N points earned" toast, which now says "Post published!".

`profiles.points` keeps every value. `lib/profileMutations.ts` and
`lib/profilePrivilegeGuard.ts` still list `points` as a privileged column a
member may not write. That is a security guard, kept deliberately and named in
the guard test's allow-list.

---

## 14. Badges

- No application code reads or writes `badges` or `user_badges`. The only
  reader was the leaderboard.
- No badge UI remains, and the `badge` notification descriptor is removed.
- The verified mark (`VerifiedMark` in the profile header) is identity
  verification and stays.

---

## 15. Contribution tiers

- `POINT_TIERS`, `getPointTier` and `getNextTier` are removed from
  `lib/utils.ts`.
- `components/ui/PointsTierBadge.tsx` is deleted. It was used only by the
  leaderboard and `/stats`.
- There are no tier tables or ledgers in the database.

---

## 16. Production gamification trigger audit

Read-only, 2026-09-15.

| Table | Trigger | Function | Effect |
|---|---|---|---|
| `likes` | `on_like_points` (AFTER INSERT) | `award_points_on_like` | +2 to the post author |
| `likes` | `on_like_delete_points` (AFTER DELETE) | `reverse_points_on_unlike` | -2, floored at 0 |
| `posts` | `on_post_published_points` (AFTER UPDATE) | `award_points_on_publish` | 10; 30 for a policy brief; 50 for research; 3 for a legacy Response |
| `posts` | `on_post_published_badges` (AFTER UPDATE) | `check_and_award_badges` | Inserts First Post, Researcher and Policy Maker badges |
| `profiles` | `on_points_updated` (AFTER UPDATE OF points) | `check_points_badges` | Inserts Rising Star (100) and Thought Leader (500) |
| `post_reviews` | `on_review_submitted_points` (AFTER UPDATE) | `award_points_on_review_submission` | +5 to the reviewer |
| `posts` | `posts_capture_first_publication_event` (AFTER INSERT OR UPDATE OF status) | `capture_first_publication_event` | One `publication_events` row per first publication |

- Each of the seven functions is called by exactly one trigger. No trigger in
  any schema calls them under another name.
- None inserts a notification.
- No comment trigger awards points.
- None of the 15 other triggers on these four tables calls pg_net.

Kept triggers on those tables:

- `on_like_insert_count` and `on_like_delete_count`;
- `guard_post_review_submission`;
- `guard_locked_post_write`, `on_post_approved`, `posts_seed_aggregate_counts`,
  `posts_sync_content_classification`, `posts_sync_topic_keys`,
  `posts_touch_updated_at` and `posts_word_count_trg`;
- `profiles_assign_selected_campus_cohort`, `profiles_broadcast_resubscribe`,
  `profiles_guard_onboarding_measurement_fields`,
  `profiles_protect_privileged_columns` and
  `profiles_protect_privileged_columns_on_insert`.

Also still live, on retired tables and inert once the application stops
writing them: `author_subscriptions_capture_ux_event` and
`user_blocks_remove_author_subscriptions`. They are deferred with their tables
(§21).

### Data

| | Value |
|---|---|
| Profiles with points > 0 | 57 of 266 |
| Total points | 5,041 |
| Highest total | 1,348 |
| Badge definitions | 13 |
| `user_badges` | 63, across 50 members; newest 2026-09-11 |

---

## 17. Gamification stop migration

### `supabase/migrations/20260915000004_stop_gamification_and_publication_capture_triggers.sql`

One transaction:

- **Step 0** refuses if a trigger with one of the seven names runs a different
  function, because that would be a trigger this file was not written for.
- **Step 1** runs seven `drop trigger if exists ... on public.<table>`.
- **Step 2** refuses to commit while any non-internal trigger, under any name,
  still runs one of the seven functions.

It drops no function, table or column. It inserts, updates or deletes no row:

- no point total is zeroed;
- no badge is deleted;
- `publication_events` keeps its rows.

The Response 3-point branch goes with `on_post_published_points`; there is no
special migration for it.

### Contract test

`supabase/migrations/retiredTriggerStopMigration.test.ts` (9 tests) asserts
the file:

- follows `20260915000003`;
- drops exactly the seven production triggers, each on its own table, idempotently;
- names none of the 15 kept triggers;
- runs the binding guard before any drop;
- lists all seven functions in the final guard;
- is one transaction;
- makes no DDL beyond the drops and no row writes;
- names neither `points =`, `badges`, `user_badges` nor the delivery tables;
- does not touch the scheduler.

### `scripts/migration/apply-retired-trigger-stop.mjs`

`--dry-run` or `--apply`. It verifies, inside the transaction:

- none of the seven triggers remains;
- every other trigger on the four tables is unchanged;
- all seven functions are still defined;
- the point total, profiles with points, badges, `user_badges` and
  `publication_events` counts are unchanged;
- a like and an unlike, simulated in a savepoint that is always rolled back,
  leave the post author's points unchanged.

### Dry run against production (rolled back)

```
Retired triggers present: likes.on_like_delete_points, likes.on_like_points, post_reviews.on_review_submitted_points, posts.on_post_published_badges, posts.on_post_published_points, posts.posts_capture_first_publication_event, profiles.on_points_updated
Other triggers on likes, posts, profiles, post_reviews: 15
Before: {"points_total":"5041","profiles_with_points":57,"user_badges":63,"badges":13,"publication_events":144}
  would apply 20260915000004_stop_gamification_and_publication_capture_triggers.sql
After:  {"points_total":"5041","profiles_with_points":57,"user_badges":63,"badges":13,"publication_events":144}
  like simulation (rolled back): {"ran":true,"unchangedAfterLike":true,"unchangedAfterUnlike":true,"reason":null}
  verified: seven triggers gone, other triggers unchanged, functions kept, totals and rows unchanged, likes award nothing
Dry-run clean. Nothing was committed.
```

**Not applied.**

---

## 18. Suggested people ranking

### Before

Candidates came from three queries:

- the viewer's university;
- an interests overlap;
- the top profiles by points.

The score was shared topics × 100, plus 80 for the same university and 20 for
the same field, then points, then username. Reasons included "From your school
and topics", "From your university and field" and "Top contributors". Signed
out, Explore showed the top 8 by points. Cards showed field, university or
"N points".

### After (`lib/suggestedPeople.ts`)

Three plain signals, in order, with no score behind them:

1. **How many of the reader's topics the writer shares.**
2. **How recently they published,** among the newest 120 publications
   (research excluded).
3. **Username,** so the order is stable.

Candidates:

- profiles whose interests overlap the reader's;
- the authors of those recent publications;
- a stable fallback by username, only when fewer than the limit remain.

Follows, blocks and self are excluded, with the chunked `not.in` clause kept.

| Signed in, the list is led by | Reason shown |
|---|---|
| a shared topic | "Writing about your topics" |
| a recent publication | "Published recently" |
| neither | "Writers on Indegenius" |

- Signed out, Explore shows recent writers (`getRecentWriters`, cached for five
  minutes), with the reason "Published recently".
- Cards say "Writes about <topic>" or "Published <relative time>".
- No points, university or field is selected, ordered or shown. Campus
  networking does not come back by another name.

---

## 19. Profile query reduction

Measured with a temporary counting client over the real loaders: the Supabase
adapter, `generateMetadata` plus the page. The test was deleted after running.

| Viewer | Gate off, before | Gate on, before | After (no gate exists) |
|---|---|---|---|
| Signed out | 6 | 6 | 6 |
| Signed-in visitor | 8 | **9** | **8** |
| Owner | 6 | 6 | 6 |

The visitor's round trips:

- **Before, gate on:** identity ×2, followers count, following count, follow
  state, `author_subscriptions`, `user_blocks`, publications, co-authored.
- **After:** the `author_subscriptions` read is gone in both adapters. The
  direct-SQL viewer relationship is one statement with two `exists` instead
  of three.

The post page's viewer state likewise dropped its subscription lookup, from
four lookups to three.

---

## 20. Activation event count

| | Count |
|---|---|
| Vocabulary before | 30 |
| Vocabulary after | 26 |
| Browser allowlist | matches the vocabulary |

Removed:

- `author_subscription_created`;
- `author_subscription_removed`;
- `author_subscription_nudge_shown`, also removed from `VIEW_EVENTS` and the
  anonymous view set;
- `author_subscription_nudge_action`.

- Their emitters went with the provider.
- The admin analytics page had no counter or funnel for them, and no
  gamification section to remove.
- `writer_followed` stays, with a source and the author id.
- There are no replacement events. Historic rows stay: 103, 381, 458 and 0.

`lib/simpleWriterProfile.test.ts` now pins 26.

---

## 21. Database deferred

Everything below is kept with its rows and values, and is unread and unwritten
by the application. This is the exact Phase 2J list for this phase.

**Tables**

| Table | Rows |
|---|---|
| `author_subscriptions` | 117 |
| `author_subscription_events` | 112 |
| `topic_subscriptions` | 0 |
| `publication_events` | 144 |
| `publication_deliveries` | 715 |
| `badges` | 13 |
| `user_badges` | 63 |

**Columns and views**

- `profiles.points`: 57 non-zero values.
- The `points` column of the `profile_directory` view.
- When the column goes, remove `points` from the privileged-column lists in
  `lib/profileMutations.ts`, `lib/profilePrivilegeGuard.ts` and
  `protect_profile_privileged_columns`.

**Functions**

- **Relationship and subscription:**
  - `set_author_relationship`, `set_author_relationship_v2`;
  - `set_topic_subscription`;
  - `list_my_author_subscriptions`, `list_my_topic_subscriptions`;
  - `get_subscription_feed_candidates`.
- **Delivery:**
  - `claim_publication_events`, `claim_publication_deliveries`;
  - `renew_publication_event_lease`, `renew_publication_delivery_lease`;
  - `capture_first_publication_event`.
- **Subscription triggers:**
  - `capture_author_subscription_event`;
  - `remove_author_subscriptions_for_block`.
- **Gamification:**
  - `award_points_on_like`, `reverse_points_on_unlike`;
  - `award_points_on_publish`;
  - `check_and_award_badges`, `check_points_badges`;
  - `award_points_on_review_submission`.

**Triggers**

- **Until `20260915000004` is applied:** the seven in §16.
- **After it:** `author_subscriptions_capture_ux_event` on
  `author_subscriptions`, and `user_blocks_remove_author_subscriptions` on
  `user_blocks`. Drop both with their tables.

**Other data**

- **Notification types** `author_published`, `topic_published`,
  `author_subscribed` and `badge` in the notifications type constraint, with
  257 + 0 + 5 + 0 rows.
- **Stored preference keys** `email_author_publications` and
  `push_author_publications` in `notification_prefs` (2 + 2 profiles), and in
  any preference allowlist or default that names them.
- **The recovery job's rows** in `private.cron_http_requests`, which
  `prune_indegenius_cron_history()` ages out.
- **Historic activation rows** for the four retired events (kept
  permanently, not deferred).

**Retained debt, unchanged by this phase: onboarding completion**

`lib/onboardingCompletion.ts` still completes onboarding through the service
role. Phase 2J must:

1. Create a DB-native two-step onboarding completion function.
2. Move the application off the service-role bridge.
3. Keep the browser privileged-column guard.
4. Delete the retired four-step RPCs.

The bridge must not become permanent.

---

## 22. Deployment order

Do not improvise.

1. **Review reminder cron removal (`20260914000001`):**
   `node scripts/migration/apply-cron-removal.mjs --dry-run`, then `--apply`.
2. **Daily Brief cron removal (`20260915000002`):**
   `node scripts/migration/apply-daily-brief-cron-removal.mjs --dry-run`, then `--apply`.
3. **Publication recovery cron removal (`20260915000003`):**
   `node scripts/migration/apply-publication-recovery-cron-removal.mjs --dry-run`, then `--apply`.
4. **Gamification and publication capture trigger stop (`20260915000004`):**
   `node scripts/migration/apply-retired-trigger-stop.mjs --dry-run`, then `--apply`.

   Safe before the deploy. The application no longer reads points, and an old
   deployment only shows totals that stop moving.
5. **Application deploy.**

   Afterwards, the three `NEXT_PUBLIC_*SUBSCRIPTIONS*` variables can be deleted
   from the hosting environment. Nothing reads them.
6. **Messaging write disablement (`20260915000001`), after the deploy:**
   `node scripts/migration/apply-messaging-write-disablement.mjs`.

The telemetry migration `20260908000001` is still unapplied and still stale. It
now needs rebasing onto `20260915000003`, and the warning in `CLAUDE.md` says
so. It was not rebased in this phase.

---

## 23. Files

### Deleted (27)

**Follow and relationship controls**

- `components/profile/AuthorRelationshipControls.tsx`
- `components/profile/AuthorRelationshipControls.test.tsx`
- `components/profile/AuthorRelationshipControlsV2.tsx`
- `components/profile/AuthorRelationshipProvider.tsx`
- `components/profile/AuthorRelationshipProvider.test.tsx`
- `components/profile/profileFollowFunnel.test.tsx`

**Subscriptions**

- `components/topic/TopicSubscribeButton.tsx`
- `components/topic/TopicSubscribeButton.test.tsx`
- `components/topic/topicActions.ts`
- `app/(main)/subscriptions/page.tsx`
- `app/(main)/subscriptions/SubscriptionsManagerClient.tsx`
- `app/(main)/settings/SubscribedAuthorsManager.tsx`
- `app/(main)/settings/SubscribedTopicsManager.tsx`

**Delivery**

- `lib/publicationDelivery.ts`
- `lib/publicationDelivery.test.ts`
- `lib/publicationDistribution.ts`
- `app/api/cron/process-publication-deliveries/route.ts`
- `app/api/cron/process-publication-deliveries/route.test.ts`
- `app/r/p/[token]/route.ts`

**Gamification**

- `app/(main)/stats/page.tsx`
- `app/(main)/stats/loading.tsx`
- `app/(main)/leaderboard/page.tsx`
- `app/(main)/leaderboard/loading.tsx`
- `components/ui/PointsTierBadge.tsx`
- `lib/postPoints.test.ts`

**Release documents for removed gates**

- `docs/author-subscriptions-release.md`
- `docs/topic-subscriptions-release.md`

### Added (12)

**Application**

- `lib/postReadQualification.ts`
- `lib/postReadQualification.test.ts`
- `components/ui/FollowButton.test.tsx`

**Guard tests**

- `lib/followOnlyRelationship.test.ts`
- `lib/noGamification.test.ts`

**Migrations, contract tests and apply scripts**

- `supabase/migrations/20260915000003_remove_publication_recovery_cron_job.sql`
- `supabase/migrations/publicationRecoveryCronRemovalMigration.test.ts`
- `scripts/migration/apply-publication-recovery-cron-removal.mjs`
- `supabase/migrations/20260915000004_stop_gamification_and_publication_capture_triggers.sql`
- `supabase/migrations/retiredTriggerStopMigration.test.ts`
- `scripts/migration/apply-retired-trigger-stop.mjs`

**Report**

- `PUBLISHING_RESET_PHASE2H.md`

### Modified (67)

**Follow**

- `components/ui/followActions.ts`
- `components/ui/followActions.test.ts`
- `components/ui/FollowButton.tsx`
- `components/profile/ProfileHeader.tsx`
- `components/profile/ProfileHeader.test.tsx`
- `app/(main)/[username]/page.tsx`
- `app/(main)/post/[slug]/page.tsx`
- `app/(main)/post/[slug]/AuthorBioCard.tsx`
- `app/(main)/post/[slug]/PostConversationView.tsx`
- `components/moderation/blockActions.ts`

**Viewer reads**

- `lib/profileViewData.ts`
- `lib/db/profilePage.ts`
- `lib/db/profilePage.neon.test.ts`
- `lib/db/profilePage.parity.live.test.ts`
- `lib/db/postPage.ts`
- `lib/db/postPage.neon.test.ts`

**Delivery**

- `app/(main)/post/[slug]/ViewTracker.tsx`
- `lib/postEngagementServer.ts`
- `lib/postEngagementServer.test.ts`
- `app/(write)/write/actions.ts`

**Discovery and topics**

- `lib/suggestedPeople.ts`
- `lib/suggestedPeople.test.ts`
- `lib/discoverData.ts`
- `lib/discoverData.test.ts`
- `app/(main)/explore/page.tsx`
- `app/(main)/explore/ExploreTopicsGrid.tsx`
- `app/(main)/topics/page.tsx`
- `app/(main)/topics/TopicsClient.tsx`
- `app/(main)/topics/[tag]/page.tsx`

**Settings, notifications, email and push**

- `app/(main)/settings/page.tsx`
- `app/(main)/settings/NotificationsForm.tsx`
- `app/(main)/settings/NotificationsForm.test.tsx`
- `lib/email.ts`
- `lib/push.ts`
- `lib/notificationCatalog.ts`
- `lib/notificationCatalog.test.ts`
- `lib/actionInbox.ts`
- `lib/actionInbox.test.ts`
- `lib/notificationPreferences.ts`
- `lib/notificationPreferences.test.ts`
- `app/(main)/notifications/NotificationsPageClient.tsx`
- `app/(main)/notifications/NotificationsPageClient.test.tsx`
- `app/(main)/notifications/NotificationItem.tsx`
- `app/(main)/notifications/NotificationItem.test.tsx`
- `components/ui/NotificationBell.tsx`

**Gamification**

- `lib/utils.ts`
- `lib/db/search.ts`
- `app/(main)/search/page.tsx`
- `app/(main)/admin/verification/page.tsx`
- `app/(main)/dashboard/PostsTable.tsx`

**Gates, analytics and routing**

- `lib/featureFlags.ts`
- `lib/featureFlags.test.ts`
- `lib/activationEvents.ts`
- `app/api/activation/route.ts`
- `lib/simpleWriterProfile.test.ts`
- `next.config.mjs`
- `proxy.ts`
- `app/robots.ts`
- `components/ui/GuestBanner.tsx`
- `app/(main)/navRoutes.test.ts`

**Tooling and docs**

- `scripts/migration/read-registry.mjs`
- `tsconfig.check.json`
- `.env.example`
- `CLAUDE.md`
- `lib/profileSecurityMigration.test.ts`
- `supabase/migrations/privateProfileExplicitUserMigration.test.ts`
- `supabase/migrations/cronHttpRequestsMigration.test.ts`

---

## 24. Tests

### New

| Test | What it covers |
|---|---|
| `lib/followOnlyRelationship.test.ts` | Application code only, comments stripped, tests and historical SQL excluded. The retired files are gone. No subscription or delivery table, RPC, gate, control, preference key, activation event, subscribe copy or `/subscriptions` link. No notification category `subscriptions`. `toggleFollow` is called from exactly one component. Every follow surface renders `FollowButton`, which says only Follow and Following. The action writes only `follows`, plus the after-response notification, and checks `isBlockedPair`. Profile and post viewer reads never mention subscriptions. The redirects exist and the segment stays reserved. |
| `lib/noGamification.test.ts` | Application code only. The leaderboard, `/stats` and `PointsTierBadge` are gone. No points, tier or badge helper, no badge table read, no points column selected, ordered or shown (two privileged-column guards allowed, with reasons). No "pts", "points earned", "Top contributors", "Leaderboard" or tier copy, and no link to `/leaderboard` or `/stats`. No badge descriptor. Suggestions and discovery use no points, university or field. Search carries no points. Publishing, following and the dashboard award nothing. The verified mark stays. The redirects exist, names stay reserved, and the proxy protects no retired route. |
| `components/ui/FollowButton.test.tsx` | One control. Follow and Following. Nothing on your own work. Confirmed follow records `writer_followed` and refreshes. A failure reverts with an alert. Unfollow counts nothing. A signed-out reader goes to sign in. A new initial state is adopted. |
| `components/ui/followActions.test.ts` (rewritten) | Writes one `follows` row and no RPC. Unfollow deletes the viewer's own row. Refusals for signed out, self and blocked pairs. An existing row is success. A concurrent duplicate is success without a second notification. A failed insert. The follow notification is sent after the response, and only for a new follow. |
| `lib/postReadQualification.test.ts` | The thresholds at their boundaries, and missing metrics. |
| `supabase/migrations/publicationRecoveryCronRemovalMigration.test.ts` | 14 contract tests (§8). |
| `supabase/migrations/retiredTriggerStopMigration.test.ts` | 9 contract tests (§17). |

### Updated

- Suggestions, discovery, engagement server, notifications and inbox,
  preferences, the settings form, the profile header, feature flags, nav
  routes, the vocabulary count, and the profile and post page adapters'
  neon and parity tests.
- Two migration-content tests that read the deleted `/subscriptions` page.
- `cronHttpRequestsMigration.test.ts`, for the newest inspect set.

### Results (sequential, fresh)

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | 1 failed (the baseline), 2,386 passed, 217 skipped; 214 files (197 passed, 16 skipped, 1 failed) |
| `npm run build` | exit 0 (Next.js 16.2.4; 44 static pages) |
| New failures | 0 |

The only failure is the allowed baseline,
`parameterizeIdentityRpcsMigration.test.ts` ("check that the row they meant to
change existed").

The iterative run before this one found two new failures, both fixed:

- `ProfileHeader.test.tsx` looked for the old "Follow author" label.
- `cronHttpRequestsMigration.test.ts` expected the newest inspect set to name
  the recovery job.

### Route checks on the fresh build

Checked with `next start` on port 3131, signed out, against production data.
The writer was chosen to have both subscribers and points. Nothing identifying
is printed.

| Request | Result |
|---|---|
| `/subscriptions` | 308 to `/explore` |
| `/leaderboard` | 308 to `/explore` |
| `/stats` | 308 to `/dashboard` |
| `/r/p/<real token>` | 308 to `/` |
| `GET /api/cron/process-publication-deliveries` (and `?dryRun=1`) | 404 |
| `GET /api/cron/resend-segment-sync` without the secret | 403 (kept) |
| Writer profile | 200; one Follow control; no bell; follower and following counts |
| `/<u>/followers`, `/<u>/following` | 200 |
| Post page | 200; one Follow control |
| Article page | 200; two Follow controls (header and author card) |
| Post and Article with a stale `?delivery=` token | 200 |
| `/explore` | 200 |
| `/explore?tab=people` | 200; "Writers to follow"; reason "Published recently" |
| `/explore?tab=topics` | 200 |
| `/topics` | 200; "follow the ones that should shape your feed" |
| `/topics/<tag>` | 200; "Writers on this topic" |
| `/search?q=policy` | 200 |
| `/?guest=1` | 200 |
| `/dashboard`, `/notifications`, `/settings?tab=notifications`, `/bookmarks`, `/write` | 307 to sign in |

Every 200 page above had:

- no subscription copy (Subscribe, Subscribed, publication subscriptions,
  subscribe for a feed);
- no gamification copy ("N points", "pts", Top contributors, Leaderboard,
  tier names);
- no link to `/subscriptions`, `/leaderboard` or `/stats`.

Each page loaded on its first attempt.

### Client footprint (entry chunks per route, same method as 2G)

| Route | Before (bytes) | After (bytes) | Change | Project client modules removed |
|---|---|---|---|---|
| Profile | 416,710 | 404,787 | -2.9% | (none by name; the relationship controls left through `FollowButton`) |
| Post | 457,379 | 445,141 | -2.7% | `AuthorRelationshipControls`, `AuthorRelationshipProvider` |
| Explore | 424,680 | 407,518 | -4.0% | |
| Topic | 387,680 | 384,561 | -0.8% | `TopicSubscribeButton` |
| Topics | 379,731 | 376,366 | -0.9% | |
| Settings | 412,449 | 393,041 | -4.7% | `SubscribedAuthorsManager`, `SubscribedTopicsManager` |
| Notifications | 387,769 | 386,216 | -0.4% | |
| Home | 406,840 | 405,902 | -0.2% | |

---

## 25. Next phase

**Phase 2I: Content Model Simplification.** Make the model match Post and
Article, and clean up:

- legacy `type`;
- `article_format`;
- Research compatibility;
- Policy Brief and Essay format residue;
- Response parent residue;
- citation and review locks;
- content-model compatibility functions.

Phase 2I has not been started.
