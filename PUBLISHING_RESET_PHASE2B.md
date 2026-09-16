# Publishing Reset: Phase 2B

Branch `refactor/publishing-reset`, uncommitted, on top of Phase 1 and Phase 2A.
Safety tags are unchanged: `archive/pre-publishing-reset` (6df4a7d) and
`archive/pre-publishing-reset-main` (6341d0e). Nothing was committed or pushed.
The `indegenuis.zip` and `team-feed-redesign-1.zip` changes were not touched.

## Summary

Phase 2B removed every way a publication could be created or shaped other than
writing a Post or an Article in the composer:

- the dead legacy composer actions `ensureDraft`, `publishPost` and `savePostReferences`;
- `lib/reviewWorkflow.ts`, which only those actions used;
- co-authoring: the picker, invitations, accept and decline, and the dashboard collaboration card;
- campus prompt publishing (`/write?prompt=`);
- Responses as publications (`?inResponseTo=`, `?response_to=`, every Respond and Write back entry point, and the "Reply to this" quote action);
- promoting a comment into a Response ("Open editor" under a post);
- draft share links and `/draft/[token]`;
- the `/responses` hub;
- the analytics events and notification writes that belonged to those flows;
- the `indegenius-review-reminders` Supabase Cron job (new migration) and its no-op route.

No table, column, row, storage object or historical migration was dropped or
edited. Existing co-authored and response publications still render, and each
of those read paths is marked `LEGACY COMPATIBILITY` in code.
`lib/retiredCreationPaths.test.ts` fails if a creation path comes back.

### Production data, measured read-only

All figures are aggregate counts from a `READ ONLY` transaction on 2026-09-14. No
content, slugs or tokens were printed.

| Measure | Count |
|---|---|
| Published Responses (`in_response_to` set) | 16 (10 Post, 6 Article) |
| Draft Responses | 19 (3 Post, 16 Article) |
| Published Responses whose parent is still published | 14 (2 parents are no longer published) |
| `response_post` notifications | 17 |
| `post_authors` rows | 215, **all owner rows** |
| Co-author rows (accepted or pending) | **0** |
| Co-author notifications (`co_author_invite`, `_accepted`, `_declined`) | 0 |
| Posts with no owner row in `post_authors` | 96 (73 draft, 23 published) |
| `post_draft_shares` rows | 2, neither revoked, **neither on a post that is still a draft** |
| `campus_prompt_submissions` | 0 |
| `campus_editorial_prompts` | 0 |

## Dead composer actions

Deleted from `app/(write)/write/actions.ts`:

| Removed | What it was | Why it could go |
|---|---|---|
| `ensureDraft` | The pre-universal Article draft action, with `postType` and research handling | No production caller. The import graph showed only `actions.ts` and its test |
| `savePostReferences` | Standalone source saving | No production caller. `ensureContributionDraft` saves sources through `syncReferences` |
| `publishPost` | The pre-universal publish, including review submission and version snapshots | No production caller. `publishContribution` is the only publish path |
| `syncAuthors`, `syncDraftAuthors`, `CoAuthorInput` | Co-author sync, invite notification and invite email | Co-authoring removed. Replaced by a single owner credit (see Co-authorship) |
| `validateCampusPrompt` | Cohort, ambassador and date checks on a prompt id | Campus prompt publishing removed |
| `NEW_ARTICLE_TYPE` and the Research branch of `validateReferences` | Legacy type plumbing for the removed actions | Used only by the removed actions |
| Imports of `lib/reviewWorkflow`, `lib/responsePost`, `slugify`, `submitPostForReview`, email and admin clients, `contentModel` format helpers | Their dependencies | Nothing left used them |

The legacy test suites went with them: `describe("ensureDraft")`,
`describe("publishPost")` and `describe("savePostReferences")`, including their
response-parent and co-author blocks and the `@/lib/reviewWorkflow` mock.
`policySnapshot()` stayed because the `publishContribution` tests use it. Two
tests were added: the owner credit is a single insert-only upsert, and
publishing writes no notification, no prompt submission and reads no profile.

## Composer reduction

| File | Before 2B | After | Change |
|---|---|---|---|
| `app/(write)/write/UniversalComposer.tsx` | 1,216 | 1,146 | −70 |
| `app/(write)/write/actions.ts` | 1,391 | 429 | −962 |
| `app/(write)/write/actions.test.ts` | 1,005 | 311 | −694 |
| `app/(write)/write/page.tsx` | 156 | 104 | −52 |
| `app/(write)/write/UniversalComposer.test.tsx` | 574 | 544 | −30 |
| `app/(main)/post/[slug]/InlineResponseComposer.tsx` | 209 | 143 | −66 |
| `lib/contribution.ts` | 128 | 115 | −13 |

These changes removed from `UniversalComposer`:
- the co-author drawer section;
- the draft share section and its "Link live" header badge;
- the share-token effect;
- the `parent` and `prompt` props and the "Responding to" / campus prompt banner;
- the `collaborators`, `inResponseToId` and `promptId` fields in device-copy recovery.

`ContributionSnapshot` lost `collaborators`, `inResponseToId` and `promptId`, and
`ContributionCollaborator` is gone. A device copy saved before the change still
restores: its extra fields are ignored. The local recovery key no longer
includes a parent id.

## Co-authorship

**Removed for users**
- **Composer:** the co-author picker and its member search (`searchCoAuthors`, `lib/db/collaboration.ts`, the `collaboration` read domain in `lib/db/readAdapter.ts`, `COAUTHOR_RESULT_LIMIT`).
- **Invitations:** notifications and emails, and the Accept and Decline buttons with their server action (`app/(main)/notifications/actions.ts`, deleted).
- **Dashboard:** the collaboration card with pending invites, recent responses, the unread message count and collaborator suggestions (`lib/collaboration.ts`). Also the "Co-authored" portfolio progress item and its copy.
- **Components:** `CollaborationPanel`, which had no production importer.
- **Settings:** the three co-author email switches and the in-app "Co-author replies" group.

New co-authorship is impossible. Nothing in the application writes a co-author
row, invites anyone or accepts an invitation, and `lib/retiredCreationPaths.test.ts`
allows exactly one `post_authors` write in the codebase.

**Compatibility that remains** (`LEGACY COMPATIBILITY — existing co-authored publications`)
- **Post page:** `HeaderCoAuthors` and the co-author credits passed to `AuthorBioCard`.
- **Other readers:** feed cards, the profile's co-authored branch, subscription feeds, blocking exclusions, publication distribution and `postVisibleSql` still read accepted credits. None of them depends on a co-author row existing.
- **Old invitation notifications:** they still render with their catalog copy, without a call to action.
- **`inapp_collaboration`:** the preference key stays in the stored preferences.

Production has no co-authored publication, so today these paths render nothing.
They are kept because the brief requires existing data to stay readable.

**The owner row is an authorization dependency, not co-authoring.** The
`post_references` SELECT policy admits published posts, reviewers and
`is_post_coauthor()`, which reads only `post_authors`. A writer without their
own row cannot read the sources on their own unpublished draft, and
`syncReferences` would then insert rows it cannot see again. So
`ensureContributionDraft` still writes that one row, before syncing sources, as
an insert-only upsert (`ignoreDuplicates`) that never modifies an existing row.
It is marked `LEGACY COMPATIBILITY — post_authors owner row`.

Other surfaces checked for `post_authors`:
- **Ownership:** `posts.author_id` and `is_post_owner()`; no owner-row dependency.
- **Profile queries:** they union owned and credited work; owner rows are redundant there.
- **Visibility:** it checks `author_id` separately.
- **Post page:** it reads credits only.

96 existing posts already lack an owner row, which confirms none of these needs one.

## Campus publishing

Removed from Write:
- **Write page:** `/write?prompt=` handling (the cohort, ambassador and prompt lookups) and the prompt banner.
- **Actions:** `validateCampusPrompt` and the `campus_prompt_submissions` insert.
- **Links into the composer:** `CampusPromptLink` is deleted, and so are the "Write from this prompt" and "Open prompt" links on the Campus hub and the ambassador dashboard.
- **Next actions:** the Campus next action (`getCampusContributionNextAction`) and the retention "campus prompt" action no longer link to `/write?prompt=`; campus actions open plain `/write`.
- **Weekly digest:** the prompt link now opens plain `/write`.
- **Analytics:** the `campus_prompt_opened` and `campus_prompt_published` events.

Campus itself (hub, cohorts, prompts as content, programs, ambassadors) is not
deleted. Old `?prompt=` links open the ordinary composer, and the parameter is
dropped from the sign-in destination.

## Responses

- **Creation removed.**
  - **Write page:** `?inResponseTo=`, `?response_to=` and `?responseIntent=` are ignored, and parent loading and the "Responding to" state are gone.
  - **Actions:** `ensureContributionDraft` and `publishContribution` never write `in_response_to`. `validateResponseParent` and `notifyResponseParentAuthor` (`lib/responsePost.ts`) are deleted.
  - **Entry points deleted:** `ResponseStartLink` and every place it rendered (the reading bar Respond button, "Write a response" after publishing, "Write back" on response notifications), the "Reply to this" quote action in `HighlightShare`, and the retention "Publish your first response" copy.
  - **Analytics:** the `response_started` and `response_thread_opened` events.
- **Promote-from-comment removed.** `InlineResponseComposer` is now only the comment box. "Open editor" and its draft hand-off are gone, and a guest's sign-in no longer points at `/write`. Comments, replies and nested threads are unchanged.
- **Existing legacy Responses:** 16 published and 19 drafts (see the table above).
- **Compatibility behaviour** (`LEGACY COMPATIBILITY — existing Response publication`)
  - **A published response** renders as an ordinary Post or Article, with a "Responding to" link to its parent (`ParentPostLink`, `ParentContextLine`, the feed card context line, the `PostCard` badge).
  - **The parent post** lists its existing responses read-only above the comments (`DiscussionSection` through `fetchResponsePage`). Nothing there starts a new one.
  - **Old `response_post` notifications** still open the response.
  - **A draft started as a Response** keeps its stored `in_response_to`. The composer neither shows nor changes it. If one of those 19 drafts is published, it renders through the same compatibility path and sends no notification. Clearing the column would have modified user data, so that decision belongs to the database phase.
- **`/responses` is deleted**, together with `fetchRecentResponsePage`. It was a discovery hub for a format that no longer exists. `next.config.mjs` permanently redirects `/responses` to `/explore`. Its links on Explore, the Campus hub, the Intellectual Record welcome and the Campus next action are removed.
- **Dependencies flagged and not rewritten:**
  - the Discussion heading count (comments plus responses);
  - response counts in feed ranking and quality signals (`lib/feedRanking.ts`, `lib/feedData.ts`, `lib/db/feed.ts`);
  - response counts on topics, the daily brief and admin analytics;
  - `RESPONSE_POINTS` on the leaderboard (`lib/utils.ts`);
  - the profile's `isResponse` and Featured Work "Response" labels;
  - the dashboard's "Responded with" activity;
  - the `onlyResponses` criterion in `lib/db/feedList.ts`, which nothing sets any more.

## Draft sharing

- **Route status:** `app/draft/[token]/page.tsx` is deleted. Any `/draft/<token>` now returns 404, verified against a production build. Historic links 404 by decision.
- **Creation status:** removed. `shareActions.ts` (create, revoke, get), `DraftShareControl`, the composer's share section, its share-token effect and the "Link live" badge are deleted. Nothing reads or writes `post_draft_shares`, and a guard test enforces it.
- **Existing tokens:** 2 rows, neither revoked. Neither post is a draft any more, so both links already returned 404 before this phase. The rows are retained, and token values were not printed.

## Review workflow

`lib/reviewWorkflow.ts` (318 lines) is deleted. After the dead actions were
removed, nothing imported it except a test mock, which is also gone. It was
removed from `tsconfig.check.json` and `scripts/migration/read-registry.mjs`.
Historical SQL and the database review functions are untouched.
`submitPostForReview` and the other editorial transitions in
`lib/postMutations.ts` stay, because `lib/postWriteBoundary.test.ts` pins them
(see Deferred).

## Cron

- **Migration created, not applied:** `supabase/migrations/20260914000001_remove_review_reminders_cron_job.sql`. It follows `20260906000003_remove_debate_cron_jobs.sql`:
  - it unschedules the job by id resolved from `cron.job` (safe where the job never existed);
  - it then redefines all four scheduler functions from their newest definitions without it: dispatch from `20260906000003`, remove, inspect and install from `20260908000001`;
  - `indegenius-db-telemetry` and every other job are unchanged, and nothing else is touched.
- **Contract tests:**
  - **New:** `supabase/migrations/reviewRemindersCronRemovalMigration.test.ts`. It asserts the unschedule order, the four functions and the untouched job set. It also asserts, across all migrations, that the newest definition of each function does not name the job.
  - **Updated:** `cronHttpRequestsMigration.test.ts` now reads the newest `inspect` definition instead of a fixed older file.
  - **Comment only:** `lib/supabaseCronMigration.test.ts` now points at the new current-set test.
- **Endpoint:** `app/api/cron/review-reminders/route.ts` is deleted, and the route returns 404.
- **Deployment order:** apply the migration before or with this deploy. Until it is applied, the 09:00 UTC job requests a route that now answers 404, once a day.

## Database unchanged

No destructive or schema change was made. The one new migration only changes
the Cron schedule. Retained intentionally:

- `post_authors`, including the insert-only owner row the composer still writes;
- `post_draft_shares` (2 rows);
- `posts.in_response_to`, and the 16 published and 19 draft Responses;
- `campus_editorial_prompts`, `campus_prompt_submissions` and every other Campus table;
- `response_post` and `co_author_*` notification rows, and the notification catalog descriptors that render them;
- preference keys `email_responses`, `email_co_author_invite`, `email_co_author_accepted`, `email_co_author_declined` and `inapp_collaboration`;
- `is_post_coauthor()` and the `post_references` SELECT policy that depends on it;
- research and review tables and functions (`post_reviews`, `post_editor_decisions`, `post_versions`, `withdraw_post_submission`, `guard_locked_post_write`);
- the review reminder rows in `private.cron_http_requests`, which age out through `prune_indegenius_cron_history()`;
- `posts.type`, `content_kind` and `article_format`;
- subscription, messaging, points and badge tables (out of scope);
- all historical migration files, none of them edited.

## Deleted files

**23 files, 2,678 lines.**

| Group | Files | Lines |
|---|---|---|
| Co-authoring | `components/collaboration/CoAuthorPicker.tsx`, `CollaborationPanel.tsx` (+test), `CollaborationDashboardCard.tsx` (+test), `lib/collaboration.ts` (+test), `lib/db/collaboration.ts`, `app/(main)/notifications/actions.ts` | 1,243 |
| Responses | `lib/responsePost.ts` (+test), `components/post/ResponseStartLink.tsx` (+test), `app/(main)/responses/page.tsx`, `loading.tsx` | 594 |
| Draft sharing | `app/(write)/write/shareActions.ts` (+test), `DraftShareControl.tsx`, `app/draft/[token]/page.tsx` | 440 |
| Review workflow | `lib/reviewWorkflow.ts` | 318 |
| Campus prompt publishing | `components/campus/CampusPromptLink.tsx` (+test) | 61 |
| Cron | `app/api/cron/review-reminders/route.ts` | 22 |

The now-empty `components/collaboration`, `components/campus`, `app/draft` and
`app/(main)/responses` directories are gone.

## Modified files

49 modified, and 3 added: the migration, its contract test and
`lib/retiredCreationPaths.test.ts`.

Core files:

- **Composer:** `app/(write)/write/actions.ts`, `page.tsx`, `UniversalComposer.tsx`, `RevisionHistory.tsx`, `lib/contribution.ts`, `app/(main)/edit/[slug]/page.tsx`.
- **Post page:** `page.tsx` (markers, `HighlightShare` call), `InlineResponseComposer.tsx`, `DiscussionSection.tsx`, `ReadingBar.tsx`, `PublishedToast.tsx`, `HighlightShare.tsx`, `PostConversationView.tsx`.
- **Cards:** `components/post/HomeFeedCard.tsx`, `PostCard.tsx` (markers only).
- **Notifications and settings:** `NotificationItem.tsx`, `settings/NotificationsForm.tsx`, `lib/notificationPreferences.ts`.
- **Dashboard:** `page.tsx`, `PortfolioProgressCard.tsx`.
- **Campus and retention:** `campus/page.tsx`, `ambassadors/dashboard/page.tsx`, `lib/campus.ts`, `lib/retention.ts`, `admin/digest/actions.ts`, `components/ui/IntellectualRecordWelcome.tsx`, `explore/page.tsx`.
- **Data and analytics:** `lib/feedData.ts`, `lib/composerActions.ts`, `lib/composerLimits.ts`, `lib/db/readAdapter.ts`, `lib/activationEvents.ts`, `app/api/activation/route.ts`.
- **Configuration and registries:** `next.config.mjs`, `tsconfig.check.json`, `scripts/migration/read-registry.mjs`, `CLAUDE.md`.
- **Tests updated:** `actions.test.ts`, `UniversalComposer.test.tsx`, `editActions.test.ts`, `lib/contribution.test.ts`, `InlineResponseComposer.test.tsx`, `NotificationItem.test.tsx`, `NotificationsPageClient.test.tsx`, `lib/campus.test.ts`, `IntellectualRecordWelcome.test.tsx`, `cronHttpRequestsMigration.test.ts`, `lib/supabaseCronMigration.test.ts`, `lib/notificationCatalog.test.ts`.

Analytics events removed from `ActivationEventName` and the `/api/activation`
allowlists (13):
- `collaboration_panel_viewed`, `collaboration_cta_clicked`;
- `coauthor_search_performed`, `coauthor_invite_sent`, `coauthor_invite_accepted`, `coauthor_invite_declined`;
- `response_started`, `response_thread_opened`;
- `campus_prompt_opened`, `campus_prompt_published`;
- `research_collaboration_request_created`, `research_collaboration_request_accepted`, `research_collaboration_request_declined`.

Notifications no longer generated: `co_author_invite`, `co_author_accepted`,
`co_author_declined`, `response_post`, and their four emails.

## Route behaviour checks

Run against `next start` on a fresh production build, signed out. A stale
`next start` from 11 September was still holding port 3123 (PID 15484), and
another process was holding 3124. Neither was touched, and the checks ran on
3131.

| Route | Result |
|---|---|
| `/write` | 307 to `/login?redirectTo=/write` |
| `/write?kind=research` | 307 to login. The page ignores `kind` and strips it from its own sign-in destination |
| `/write?prompt=<id>` | 307 to login. The prompt is ignored, with no crash |
| `/write?inResponseTo=<id>` | 307 to login. The parent is ignored, with no crash |
| `/write?response_to=<slug>` | 307 to login. The parent is ignored, with no crash |
| `/draft/<token>` | 404 |
| `/responses` | 308 to `/explore` |
| `/api/cron/review-reminders` | 404 |
| Legacy published Response, `/post/<slug>` | 200. "Responding to" shown. No Open editor, Write a response, Write back or Respond control |
| Its parent, `/post/<slug>` | 200. Read-only Responses list and comment box shown, no creation control |
| Post, `/post/<slug>` | 200. Comment box shown, no creation control |
| Article, `/post/<slug>` | 200. Comment box shown, no creation control |

Signed out, the proxy redirects before the page runs, so the retired parameters
are still carried in `redirectTo`. After sign-in the page ignores them. The
page reads none of them, which the type check confirms.

## Core regression checks

Authenticated create, save, publish, edit and delete were not exercised live,
because that would write to the production database. They are covered by the
suites below, all passing in the full run:

| Behaviour | Evidence |
|---|---|
| Create and save Post and Article drafts (title decides kind), topics, cover image | `actions.test.ts` (`ensureContributionDraft`), `UniversalComposer.test.tsx` autosave and hygiene suites, `lib/contribution.test.ts` |
| Publish Post and Article, slug naming, orphaned-citation refusal | `actions.test.ts` (`publishContribution`) |
| Sources and citations | `actions.test.ts`, `editActions.test.ts`, `UniversalComposer.test.tsx` (Sources drawer), owner credit test |
| Edit published | `editActions.test.ts`, `edit/[slug]/page.tsx` type-checked |
| Preview, image captions | `UniversalComposer.test.tsx` |
| Delete | `deleteActions.test.ts`, `lib/postWriteBoundary.test.ts` |
| Comments, replies, nested threads | `InlineResponseComposer.test.tsx`, `CommentThread.test.tsx`, `commentActions.test.ts` |
| Likes, bookmarks, share | `PostActionsRow.test.tsx` and the dev feed harness test. Public post pages render (route checks) |
| Follow, notifications | `NotificationItem.test.tsx`, `NotificationsPageClient.test.tsx`, `lib/notificationCatalog.test.ts` |

## Orphan search

The import graph after this phase has **no new orphan module**. The 10 modules
with no production importer all predate it. Leftovers are classified below.

| Classification | Item |
|---|---|
| LEGACY COMPATIBILITY | Owner row write `ensureOwnerCredit` (`post_references` policy dependency) |
| LEGACY COMPATIBILITY | `ParentPostLink`, `ParentContextLine`, `HomeFeedCard` context line, `PostCard` Response badge |
| LEGACY COMPATIBILITY | `DiscussionSection` Responses tier with `fetchResponsePage`, `fetchResponseCards`, `RESPONSE_PAGE_SIZE` |
| LEGACY COMPATIBILITY | `HeaderCoAuthors`, `AuthorSection` credits, co-author reads in feed, profile, visibility and distribution |
| LEGACY COMPATIBILITY | `NotificationItem` response and invitation rows; catalog descriptors for `response_post` and `co_author_*`; retention `response_received`; `inapp_collaboration` key |
| KEEP | `InlineResponseComposer` name (the comment box, still the scroll target); the guest-auth `respond` intent (used by comments) |
| DEFERRED DATABASE | `post_authors`, `post_draft_shares`, `posts.in_response_to`, campus prompt tables, legacy notification rows and preference keys, the `post_references` read policy, review tables and functions |
| DEFERRED | `lib/db/dashboard.ts` `pendingInvites`, `recentResponses` and `conversationReadState`: no production caller, but part of the repository contract and used by the Neon and live parity tests |
| DEFERRED | `lib/db/feedList.ts` `onlyResponses`: nothing sets it any more; it belongs to the feed domain |
| DEFERRED | `submitPostForReview` and the editorial transitions in `lib/postMutations.ts`, pinned by `lib/postWriteBoundary.test.ts` |
| DEFERRED | Response counts in ranking, topics, the daily brief, admin analytics, leaderboard points and profile labels (see Responses) |
| STALE | `write_back` in the `RetentionNextAction` key union |
| STALE | Admin analytics tiles and retention and activation counters that read historic `response_started` and `coauthor_invite_*` rows |
| STALE | Review email switches (`email_review_*`) still shown in notification settings, from the Phase 2A domain |
| STALE | Documentation naming removed modules: `docs/content-model*.md`, `docs/publishing-core-v2-audit.md`, `docs/auth-and-rls-migration.md`, comments in `lib/postMutations.ts`, the historical note in `lib/composerActions.ts`, generated `scripts/audit/db-audit.json` |

## Tests

| Check | Result |
|---|---|
| typecheck (`npm run typecheck`) | Pass |
| lint (`npm run lint`) | Pass, 0 problems |
| tests (`vitest run`) | 1 failed, 2,569 passed, 282 skipped. 250 files: 232 passed, 1 failed, 17 skipped |
| build (`npm run build`) | Pass, 69 static pages. `/responses`, `/draft/[token]` and `/api/cron/review-reminders` are absent from the route table |
| baseline failure | `supabase/migrations/parameterizeIdentityRpcsMigration.test.ts`, "check that the row they meant to change existed". Same assertion as Phase 2A |
| new failures | 0 |

A full-project `tsc` (outside the `typecheck` subset) still reports type errors
in test fixtures this phase did not introduce. Examples are a missing
`post_content_kind` in the notification test fixtures and a missing
`inapp_comments` in `NotificationsForm.test.tsx`. None of those errors is in a
line this phase changed.

## Deferred

- **Apply `20260914000001_remove_review_reminders_cron_job.sql` in production**, before or with this deploy.
- **The owner-row dependency.** A migration letting a post's author read its own `post_references` directly would allow `ensureOwnerCredit` to go. Afterwards, a decision on `post_authors` itself.
- **The 19 draft Responses.** Decide whether to clear `in_response_to` on drafts, or leave them to publish through the compatibility path.
- **Response signals.** The Discussion count, feed ranking and quality signals, `onlyResponses`, leaderboard `RESPONSE_POINTS`, profile and Featured Work response labels, and whether the parent's read-only Responses list stays.
- **Dashboard repository dead methods** (`pendingInvites`, `recentResponses`, `conversationReadState`) and their parity tests.
- **Analytics.** Retire the admin tiles and counters that read removed events.
- **Database cleanup** of `post_draft_shares`, campus prompt submissions, legacy notification rows and preference keys, and the review tables and functions, each through its own migration.
- **Documentation sweep** of the stale references listed above.
- **Out of scope for 2B and untouched:** subscriptions and `AuthorRelationshipControls`, gamification, the profile rebuild and full Campus deletion.

## Next step

Phase 2C: retire the Response signals that still shape reading surfaces. That
means:
- the combined Discussion count;
- response counts in ranking and quality;
- `onlyResponses`;
- leaderboard response points;
- profile response labels;
- the decision on the parent's read-only Responses list.

Do it with the feed parity tests in the loop, after the review reminder
migration is applied.
