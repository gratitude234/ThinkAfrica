# Indegenius Publishing Reset: Phase 2A

Navigation reset, and removal of Research, editorial review and citation identity from the application layer.

| | |
|---|---|
| Date | 2026-09-14 |
| Branch | `refactor/publishing-reset` (local), created at `6df4a7d` without switching away from the Phase 1 working tree |
| Checkpoints | `archive/pre-publishing-reset` (`6df4a7d`) and `archive/pre-publishing-reset-main` (`6341d0e`), both verified present before any change |
| Commits | None. Phase 1 and Phase 2A changes are uncommitted in the working tree. Nothing was pushed. |
| Database | Read-only measurement only (see below). No migration written, no row changed, no object dropped. |
| Plan it follows | `PUBLISHING_RESET_AUDIT.md`, Step 0 (navigation) and Step 1 (Research, review, citation) |

---

## Production data behind the decisions

The Supabase connector is not authorised in this session, so the measurement used the repository's own loader (`scripts/migration/env.mjs`, `SUPABASE_DB_URL` from `.env.local`, which points at production). Every statement was an aggregate `SELECT` inside a `READ ONLY` transaction. No rows, content or personal data were printed.

**Posts by classification and status**

| `type` | `content_kind` | `article_format` | draft | pending | published |
|---|---|---|---|---|---|
| blog | post | none | 33 | 0 | 68 |
| essay | article | essay | 18 | 0 | 55 |
| essay | article | none | 43 | 0 | 85 |
| policy_brief | article | policy_brief | 3 | 0 | 1 |
| research | research | none | 3 | 1 | 1 |

No post of any type is `pending_revision`, `rejected` or `withdrawn`. The only non-draft, non-published post is the one pending research submission.

**Reviewed and citable content**

| Measure | Result |
|---|---|
| Posts with a `citation_id` | 2: the published policy brief and the published research piece |
| Posts with a `published_version_id` | the same 2 |
| Policy briefs pending, in revision, rejected or withdrawn | **0**, so no policy brief is mid-review |
| Research with a PDF (`document_path`) | 2: the pending and the published piece |
| Review records | policy brief (published): 1 post, 1 review, 0 open. Research (pending): 1 post, 2 reviews, **2 open assignments**. Research (published): 1 post, 3 reviews |
| Editor decisions | 1 blog post (2 rows), 1 policy brief, 1 research piece |
| `post_versions` | 1 blog post, 1 policy brief (2 rows), 2 research pieces (3 rows) |
| Research-only tables | `researcher_profiles` 0, `research_projects` 0, `research_project_assets` 0, `research_collaboration_requests` 0 |
| `citation_sequences` / `submission_tracks` | 1 / 4 rows |
| Audio summaries | 0 |
| Reviewer or editor accounts | 0 (3 admins) |
| Review-type notifications | `post_approved` 195, `review_assigned` 10, `review_reminder` 2, `review_started` 1, `revision_requested` 1 |
| Legacy bodies | published policy brief 2,968 characters of text; published research 2,613 characters plus an excerpt, so both read as Articles without their PDF |

What this decided:

- The review workflow has **no live policy-brief consumer**. No compatibility path is needed for policy briefs in review, so the review UI was removed rather than kept in a reduced form.
- The single pending research submission (with two open reviewer assignments) was already invisible to its author because the Research flag was off. Its row, reviews and PDF are untouched.
- The two published pieces carrying citation IDs stay readable at their post URLs, and their citation URLs redirect there.

---

## Completed

### Navigation

Every shell now offers the same five destinations, in the same order, from one source of truth in `app/(main)/navItems.tsx`.

| Surface | Before | After |
|---|---|---|
| Mobile bottom bar | For you, Discover, Responses, Record, plus a floating Publish button | **Home, Explore, Write, Notifications, Profile**. Write is an in-bar primary action; the floating button is gone |
| Desktop side rail (xl) | For you, Discover, Responses, Campus, (Research), My record, Opportunities, Bookmarks, Messages, Publish | **Home, Explore, Write, Notifications, Profile** |
| Top bar (md to xl) | For you, Discover, Responses, Campus, (Research), Messages icon, bell, Publish, account menu | **Home, Explore** links; Write button; Notifications bell (links through to `/notifications`); Profile behind the account menu. Messages icon removed |
| Account menu | header "Intellectual Record"; Intellectual Record, Writing dashboard, Review, Bookmarks, Settings, Admin (to `/admin/review`), Sign out | header `@username`; **Profile**, Writing dashboard, Bookmarks, Settings, Admin (to `/admin`), Sign out |
| `/me` account hub | Review link, "Your Intellectual Record", "Open Intellectual Record" | Review link removed; "View profile" |

- **Profile** links to the signed-in writer's public profile `/[username]`, never `/me` or `/[username]/record`. A username that cannot be a route falls back to `/settings/profile`. Guests see "Join" linking to `/signup`.
- **Notifications** for guests routes through sign-in (`/login?redirectTo=%2Fnotifications`).
- **Explore** stays lit on `/explore`, `/discover` (kept as a redirect), `/search` and `/topics`.
- **Write** goes to `/write` with the existing guest sign-in gate. There is no type picker.
- The retired destinations were removed from the navigation logic itself: their icons, match prefixes and `canAccessReview` plumbing (`layout.tsx`, `NavigationShell`, `NavClient`, `NavUserMenu`) are gone.
- `MessagesUnreadBadge` lost its last importer and was deleted. The messages routes and APIs remain for their own phase.
- On mobile the top-bar bell stays alongside the Notifications tab, because it is the only unread indicator and adding a second poller for the tab would be a new feature.

### Research removed

- **Routes deleted:** `/research`, `/research/profile`, `/research/projects/[slug]`, `/research/proposals/new`, `/submit/research`, `/admin/research`.
- **APIs deleted:** `/api/research-document/upload`, `/api/research-document/[postId]`, `/api/research-project-assets/upload`, `/api/research-project-assets/[assetId]`.
- **Components and modules deleted:** `ResearchProjectCard`, `ResearchSection` (profile settings), `PublishingTopicSelector` (its only consumer was the research submission form), `lib/research.ts`.
- **Profile settings:** the Research section, its save action, its model, its data query (`researcher_profiles` is no longer read) and the "Complete your research identity" recommendation are gone. `ProfileBackground` no longer renders research identity (ORCID, methods).
- **Composer entry points:** `/write?kind=research` and `?type=research` are ignored and stripped from the sign-in destination. A research draft opened in the composer is a 404.
- **Feed and cards:** `ResearchFeedCard`, the PDF preview and manuscript row, the Research skeleton variant and the `research-preview` image variant are gone. `HomeFeedCard`, `PostCard` and `HomeFeaturedLead` render nothing for a legacy research row.
- **Explore and search:** the Research primary filter is gone; `?type=research` falls back to All; the feed content-filter type no longer includes `research`.
- **Admin:** the Research Expansion entry is gone from the admin navigation.
- **Dev preview:** the Research fixture section and fixtures are gone.
- **Feature flag:** `FEATURE_FLAGS.research`, `isResearchEnabled()` and `RESEARCH_UNAVAILABLE_MESSAGE` are removed. See the compatibility section for what replaced the one piece of it that was a data filter rather than a switch.

### Research on the post reading page

`app/(main)/post/[slug]/page.tsx` went from 2,130 to about 1,340 lines.

- The entire Research template is gone: dossier sidebar, dossier disclosure, review timeline, abstract panel, manuscript PDF block, "Citation archive" buttons, research follow card, and the research-only `TableOfContents` (deleted).
- `CredibilityPanel` (research branches only) is deleted, along with the collaboration panel call and the `getMessageEligibility` query it needed, which removes one database round trip per signed-in read.
- The editorial review status panel is gone.
- A **published** legacy research piece now renders through the ordinary Article template: title, "Article" kicker, author, body, sources, comments. An **unpublished** one is a 404, as it already was while the flag was off.

### Editorial review removed

- **Routes deleted:** `/review`, `/review/[postId]`, `/editorial-standards`.
- **Deleted:** `SubmitReviewForm`, reviewer actions, `AssignReviewers`, `ReviewActions`, `EditorialTrustPanel`, `lib/editorialTrust.ts`, the legacy `EditForm` and its resubmission actions.
- **`/admin/review`** is now "Featured posts": the Home featured-post tool and the Policy Hub featuring list, which are still read by Home and `/policy`. The editorial queue, reviewer assignment and editor decisions are gone. The admin hub's "Editorial queue" stat card is gone.
- **Writer dashboard:** "Work under review" panel, "Reviewer feedback received" panel, review-status chips, queue position, Withdraw button, review-only status tabs (pending, revision, rejected, withdrawn), "Reviewed/citable" portfolio item and stat, and "reviewed-format draft" suggestions are gone. `withdrawSubmission` is deleted.
- **Edit route:** no `EditForm`. Drafts go to the composer and published Posts and Articles open in it. Anything else shows a plain notice (see compatibility).
- **Role-change emails** no longer send reviewers or editors to the removed reviewer portal.
- **Moderation notices** (post removed, comment hidden, suspension) used to link to `/editorial-standards`. Their notifications, emails and catalog fallback now link to `/terms`.

### Citation identity removed

- **Deleted:** `CiteThis`, `CopyCitationIdButton`, `lib/citationId.ts`.
- **Minting stopped:** `publishReviewedPost()` and `recordEditorDecision()` were removed from `lib/reviewWorkflow.ts`. They were the only code that called `generate_citation_id`. Publishing a Post or Article never produced a citation ID and still does not.
- **UI removed:** Citable and Reviewed badges on feed cards, `PostCard`, the search page and the search overlay; the Explore "Citable" tab, its section, `fetchCitableFeed` and its cached query; the topics index "Citable or reviewed" stat and the topic page's "citable" count.
- **Kept:** article sources. The post page section is now headed "Sources"; `post_references`, source editing in the composer and inline `[ref:id]` markers are unchanged.

### Sitemap, footer and static links

- `sitemap.ts`: `/editorial-standards`, the conditional `/research` entry, research project URLs and the researcher-profile inclusion rule are removed.
- `Footer`: the Editorial Standards link is removed.
- Campus and Opportunities stay in the sitemap and footer. They belong to later phases.
- `CLAUDE.md` no longer describes deleted routes, APIs, `lib/citationId.ts` or the review status machine as current.

---

## Compatibility code remaining

Each item is marked in code as `LEGACY COMPATIBILITY` where it is new or changed in this phase.

| Where | What it does | Why it stays | Remove when |
|---|---|---|---|
| `lib/featureFlags.ts` `RESEARCH_TYPE_QUERY_EXCLUSION` and its `.neq("type", ...)` uses across feed, search, discovery, sitemap, landing, dashboard, profiles | Keeps legacy research rows out of every shared post query | The rows exist. It is now the literal `"research"`, a data filter with nothing to switch back on | Research rows are migrated or archived and `posts.type` is resolved |
| `post/[slug]/page.tsx` (page and `generateMetadata`) | Published legacy research renders as an Article; unpublished research is a 404 | Existing research URLs must stay readable without a Research product | Content-model migration decides what legacy research becomes |
| `publication/[citationId]/page.tsx` | Resolves a historical citation ID to its published post and issues a permanent redirect to `/post/[slug]`; 404 otherwise | Citation URLs were public and may be cited elsewhere. It renders nothing and issues nothing | Citation migration |
| `api/cron/review-reminders/route.ts` | Authorises the cron call and returns `{ remindersSent: 0 }` | The Supabase Cron job `indegenius-review-reminders` still calls it. Removing the job means redefining the scheduler functions in a new migration | The job is removed by a migration |
| `edit/[slug]/page.tsx` | Shows "This post can't be edited" for publications locked by `guard_locked_post_write` (research, policy briefs, anything with a citation ID or published version), and for rows in a review-only status | The database guard still refuses those edits, so the composer would fail on save | The lock guards are dropped |
| `dashboard/PostsTable.tsx` `lockedLegacyPublication` | Opens a locked legacy publication for reading instead of editing | Same database lock | Same |
| `(write)/write/page.tsx`, `ensureContributionDraft` | 404 for a research draft in the composer; the draft action refuses research rows | Nothing may turn a legacy research row into a Post or Article implicitly | Content-model migration |
| `HomeFeedCard`, `PostCard`, `HomeFeaturedLead` | Render nothing for a research row | Defence in depth behind the query filter | Content-model migration |
| `api/bookmarks`, `lib/notificationData.ts`, `exploreFilters` ("All"), search overlay `content_kind` clause, landing page filter | Hide legacy research bookmarks, notifications and results | Same | Same |
| `lib/citationResolution.ts`, `lib/internalWorkLink.ts` | A source that links to a `/publication/ID` URL still resolves to the post | Sources written before this phase may use those links | Citation migration |
| `lib/reviewWorkflow.ts` (trimmed) | `createVersionSnapshot`, `getSubmissionTrack`, `requiresEditorialWorkflow` | Still imported by the dead legacy composer actions `publishPost`, `ensureDraft`, `savePostReferences` | Phase 2B deletes those actions, then this file |
| `lib/postPolicy.ts` transition table, `lib/postMutations.ts` editorial functions | Describe and allow legacy review transitions | They mirror database guards and carry their own tests; the call sites are relabelled "retired editorial review (legacy rows only)" | Database cleanup of statuses and guards |
| `lib/notificationCatalog.ts` review and research-collaboration descriptors | Render historical notifications (195 `post_approved`, 10 `review_assigned`, etc.) | Old rows exist. Research-collaboration descriptors no longer fall back to `/research` | Notification cleanup (audit S7, I6) |
| `app/robots.ts` `/review/` disallow, `lib/profileUsername.ts` reserved `editorial-standards` | Keeps crawlers off retired URLs; stops a member claiming a retired path as a username | Cheap and protective | Optional |
| `components/post/PostCover.tsx` research fallback style | Cover fallback for a legacy research row read as an Article | Only reachable on the two legacy research URLs | Content-model migration |

---

## Deferred

### Because of legacy data

- **1 pending research submission** with 2 open reviewer assignments and a PDF: row, reviews, versions and storage object untouched. The author cannot see it, as before.
- **3 research drafts** and **3 policy-brief drafts**: untouched. Policy-brief drafts are Articles and still open in the composer.
- **2 published pieces with citation IDs** (one research, one policy brief): readable at `/post/[slug]`, locked from editing by the database, reachable from their citation URLs.
- **Historic notifications** of review types: still rendered by the catalog.

### Because of database sequencing

Nothing below was dropped, altered or migrated:

- **Tables:** `researcher_profiles`, `research_projects` and related research tables, `post_reviews`, `post_editor_decisions`, `post_versions`, `submission_tracks`, `citation_sequences`.
- **Columns:** `posts.type`, `content_kind`, `article_format`, `citation_id`, `published_version_id`, `current_round`, `revision_due_at`, `document_*`, `in_response_to`.
- **Functions:** `generate_citation_id`, `withdraw_post_submission`, `guard_post_review_submission`, `is_legacy_policy_brief_in_flight`, and the rest.
- **Triggers and RLS:** `guard_locked_post_write`, `guard_locked_post_child_write`, `on_review_submitted_points`, `notify_post_approved`, plus every related RLS policy.
- **Cron job:** `indegenius-review-reminders`.
- **Storage buckets:** `research-documents`, `research-project-assets`.
- **Historical migrations** and their contract tests are unchanged.

### Because they belong to later phases

- **Profile Intellectual Record evidence** (audit R10, R12): `ProfileRecordCard`, `FeaturedWork` and the header's record metrics can still show "Citable" and "Reviewed" chips and a citable count on a profile that holds one of the two legacy pieces. This is the Intellectual Record system, which the brief defers to the profile phase and which `feature/profile-rebuild` rewrites. `/[username]/record` still exists, with research filters forced off.
- **Opportunities, talent, analytics, feed ranking** (R3, S3, S18) still read `citation_id` or call `isFormallyReviewed()` as scoring inputs. None of them render a citation product in navigation.
- **Legacy composer actions** `ensureDraft`, `publishPost` and `savePostReferences` (R24) and the helpers they keep alive in `lib/reviewWorkflow.ts`.
- **`CollaborationPanel`** lost its last importer when the research template was removed. It keeps a test, so it goes with co-authorship (R15).
- **Messages, Responses, Campus, Opportunities, Leaderboard:** no longer in navigation, but their routes and backends remain.
- **`/api/topic-suggestions`** (AI) now has no UI caller; its flag was already off. Goes with R21.
- **`lib/db` parity field lists and repositories** still carry `citation_id` and review fields. Changing them touches both adapters and the parity tooling (audit I7).

---

## Surviving references, classified

A search of production code (tests excluded) for `research`, `citation_id`, `/review`, `/publication`, `/submit/research`, `editorial-standards`, `isFormallyReviewed` and the removed flag after the deletions:

| Class | Where |
|---|---|
| Intentional legacy compatibility | Everything in the compatibility table above |
| Database migration infrastructure | `lib/db/**` selects, parity field lists, `lib/postPolicy.ts`, `lib/postMutations.ts`, `scripts/migration/read-registry.mjs` (dead-route classifier), `scripts/audit/dbAudit.mjs` bucket list |
| Deferred to a later phase | `lib/intellectualRecord.ts`, `lib/profileRecord*.ts`, `FeaturedWork`, `ProfileRecordCard`, `[username]/record`; `lib/opportunity*.ts`, `lib/talentDiscovery.ts`, `lib/applicationReview.ts`, fellowships and talent pages; `admin/analytics`; `lib/feedRanking.ts`, `lib/postQuality.ts`; `lib/publicationDelivery.ts` labels; `lib/topicSuggestions.ts`; `ContinueDraftRow` (already unimported) |
| Test fixture | Content-model, post-policy and migration contract tests that describe legacy rows |
| Stale or dead, **removed** | Everything listed under Completed, plus the admin no-access link to `/review`, role-change email links, research-collaboration `/research` fallbacks, `tsconfig.check.json` entries for deleted files, the read-registry entry for `lib/citationId.ts`, `CLAUDE.md` route and utility entries, comments in `contentModel.ts` and on the post page |

No surviving production link points at `/research`, `/review`, `/submit/research`, `/editorial-standards` or `/api/research-*`.

---

## Deleted files

**54 files**, 9,816 lines, including 7 test files.

| Group | Files |
|---|---|
| `app/(main)/research/**` | 10 |
| `app/(main)/submit/research/**` (with tests) | 7 |
| `app/(main)/review/**` | 6 |
| `app/(main)/admin/research/**`, `admin/review/AssignReviewers`, `ReviewActions` | 5 |
| `app/(main)/edit/[slug]/EditForm.tsx`, `actions.ts`, `actions.test.ts` | 3 |
| `app/(main)/post/[slug]/CiteThis`, `CopyCitationIdButton`, `TableOfContents` | 3 |
| `app/(main)/editorial-standards/**` | 2 |
| `app/api/research-document/**`, `app/api/research-project-assets/**` | 4 |
| `components/topic/PublishingTopicSelector` (with test) | 2 |
| `lib/research.ts`, `lib/editorialTrust.ts` (with tests), `lib/researchAssetUploadContract.test.ts`, `lib/citationId.ts` | 6 |
| `components/editorial/EditorialTrustPanel`, `components/post/CredibilityPanel`, `components/research/ResearchProjectCard`, `components/ui/MessagesUnreadBadge` | 4 |
| `settings/profile/sections/ResearchSection`, `publication/[citationId]/loading` | 2 |

## Modified files

100 files, net +975 / −4,986 lines. The important ones:

- **Navigation:** `app/(main)/{navItems.tsx,navRoutes.ts,SideRail.tsx,BottomNav.tsx,NavClient.tsx,NavUserMenu.tsx,NavigationShell.tsx,CreateLauncher.tsx,layout.tsx}`, `app/(main)/me/page.tsx`.
- **Reading and editing:** `app/(main)/post/[slug]/page.tsx`, `app/(main)/edit/[slug]/page.tsx`, `app/(main)/publication/[citationId]/page.tsx` (now a redirect), `app/(write)/write/{page.tsx,actions.ts}`.
- **Admin:** `app/(main)/admin/review/{page.tsx,actions.ts}` (featuring only), `app/(main)/admin/{page.tsx,layout.tsx,moderation/actions.ts,verification/actions.ts}`, `lib/adminAccess.ts`.
- **Dashboard:** `app/(main)/dashboard/{page.tsx,PostsTable.tsx,StatsBar.tsx,PortfolioProgressCard.tsx}`.
- **Discovery:** `app/(main)/explore/{page.tsx,exploreFilters.ts}`, `lib/discoverData.ts`, `lib/feedData.ts`, `lib/db/search.ts`, `app/(main)/search/page.tsx`, `components/ui/SearchOverlay.tsx`, `app/(main)/topics/{page.tsx,[tag]/page.tsx}`.
- **Cards:** `components/post/{HomeFeedCard,PostCard,HomeFeaturedLead,FeedSkeleton,PostImage,cardShell}`.
- **Profile settings:** `app/(main)/settings/profile/{ProfileCommandCenter.tsx,actions.ts}`, `lib/{profileCommandCenter,profileCommandCenterData,profileNextAction}.ts`, `components/profile/{ProfileBackground,ProfilePreview}.tsx`.
- **Flags and data filters:** `lib/featureFlags.ts`, `lib/notificationData.ts`, `lib/notificationCatalog.ts`, `app/api/{bookmarks,og}/route*`.
- **Cron:** `app/api/cron/review-reminders/route.ts` (no-op).
- **Config and docs:** `app/sitemap.ts`, `components/ui/Footer.tsx`, `tsconfig.check.json`, `CLAUDE.md`, `scripts/migration/read-registry.mjs`.
- **Tests rewritten or updated:** 29 test files, including all eight navigation test files.

---

## Build health

Final run after every Phase 2A change, sequential so the test suite did not compete with lint or the build for CPU.

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | **Pass** (exit 0, 38s) |
| Lint | `npm run lint` | **Pass** (exit 0, no problems) |
| Tests | `npm test` | **1 failed**, 2,629 passed, 282 skipped (255 files) |
| Build | `npm run build` | **Pass** (exit 0). Compiled, full TypeScript pass, 71 static pages (80 before this phase, the difference being the removed routes) |

The compiled route table confirms that `/research`, `/submit/research`, `/review`, `/editorial-standards`, `/admin/research` and `/api/research-*` are gone, and that `/publication/[citationId]`, `/admin/review`, `/api/cron/review-reminders`, `/edit/[slug]`, `/write`, `/notifications` and `/explore` are built.

### New failures

**Zero.**

The one failing test is the Phase 1 baseline failure, unchanged: `supabase/migrations/parameterizeIdentityRpcsMigration.test.ts` › write paths › "check that the row they meant to change existed" (`expected '' to match /IF NOT FOUND THEN[\s\S]*?RAISE EXCEPTION/`). It asserts against a historical migration file, which this phase did not touch.

An intermediate run did surface six failures and one lint error introduced by this phase: tests still asserting the `/me` Review link and Intellectual Record copy, the dev-preview Research section, the search overlay's Reviewed badge, a caller of the retired withdraw RPC, and a raw `<a>` in a test mock. Each was updated to assert the new behaviour before the final run above.

### Notes

- Running `tsc` over the whole project (tests included, which neither `npm run typecheck` nor the build does) reports type errors in test files this phase never touched: notification data fixtures, `ProfileRecordSummary` fixtures, `lib/db` parity tests. They predate Phase 2A.
- `.next/types/validator.ts` referenced the deleted routes until the build regenerated it.

---

## Next recommended action: Phase 2B

Audit Step 2, the composer:

1. Delete the dead legacy composer actions `ensureDraft`, `publishPost` and `savePostReferences` and their tests. This lets `lib/reviewWorkflow.ts` be deleted outright.
2. Remove the composer extras: `CoAuthorPicker` and `syncAuthors` / `syncDraftAuthors` (R15), the campus `?prompt=` path (R4), the response-parent path and the comment box's "promote to Response" button (R9), and `DraftShareControl` with `/draft/[token]` (R22).
3. Delete `CollaborationPanel` with the co-author UI.

Separately, before any database phase: a migration to remove the `indegenius-review-reminders` Cron job, written in the shape of `20260906000003_remove_debate_cron_jobs.sql`, after which the no-op route above can be deleted.
