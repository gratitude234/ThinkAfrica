# Indegenius publishing reset, Phase 2I

## Make the underlying publishing model match the product: Post + Article

Branch `refactor/publishing-reset`. Nothing committed, nothing pushed.

---

## 1. Executive summary

The product has had two kinds of writing since Phase 2A: a **Post** (no title)
and an **Article** (a title). The database still had four. `posts.type` could
say `blog`, `essay`, `policy_brief` or `research`; `posts.content_kind` could
say `research`; `posts.article_format` carried a genre the product stopped
showing; and `guard_locked_post_write()` still refused an author edit to
anything that had been through a review workflow that no longer exists.

Phase 2I closed that gap in both directions. Three migrations, all applied to
production, made the stored model say what the product says. The application
then stopped reading the columns they retired.

Three things are worth singling out.

**A production bug is fixed.** `apply_post_edit_draft()` set
`editorial_updated_at`, a column `public.posts` does not have. Migration
`20260818000002_posts_editorial_updated_at.sql` is in this repository and was
never applied. Every attempt to save an edit to a published post therefore
failed, at the moment the writer pressed the button, with an undefined-column
error. Two rows sat in `post_edit_drafts`, the newer from 2026-09-09: edits
that were written and could not be saved. `20260915000007` removes the
assignment.

**No row lost anything.** The normalization changed three columns on 82 rows
and nothing else, including `updated_at`. That is asserted rather than
asserted-by-comment: the migration hashes every other column of every row
before and after and refuses to commit if the hash moves.

**Legacy work reads as what it is.** The five Research papers and four Policy
Briefs are Articles now, at their own URLs, with their own titles, bodies,
slugs, authors and dates. Nothing was deleted, nothing was renamed, and no
status moved.

---

## 2. Production classification inventory

Read-only inspection, 2026-09-15, before any migration ran. 311 posts in five
combinations and no others.

| content_kind | type | article_format | draft | pending | published | total |
|---|---|---|---|---|---|---|
| post | blog | null | 33 | - | 68 | 101 |
| article | essay | null | 43 | - | 85 | 128 |
| article | essay | essay | 18 | - | 55 | 73 |
| article | policy_brief | policy_brief | 3 | - | 1 | 4 |
| research | research | null | 3 | 1 | 1 | 5 |

Column totals before: `content_kind` article 205, post 101, research 5, no
nulls. `type` blog 101, essay 201, policy_brief 4, research 5.
`article_format` null 234, essay 73, policy_brief 4. Statuses draft 100,
pending 1, published 210.

Because there were no nulls and no sixth combination, the mapping below is
total and deterministic rather than a best guess. `20260915000005` refuses to
run at all if a sixth appears.

Other measurements taken at the same time:

- **Responses.** 35 posts carry `in_response_to`, every parent exists. 19 are
  drafts, 16 are published.
- **Titles.** Every Article and every Research row is titled. Of 101 Posts, 61
  are titled and 40 are not.
- **Sources.** `post_references` holds 52 rows across 23 posts.
- **Review residue.** `post_reviews` 6, `post_editor_decisions` 4,
  `post_versions` 6, `submission_tracks` 4, `citation_sequences` 1.
- **Citation evidence.** 2 published rows carry a `citation_id`, and the same
  2 carry a `published_version_id`.

---

## 3. Canonical mapping

| From | To | Rows |
|---|---|---|
| post / blog / null | unchanged | 101 |
| article / essay / null | unchanged | 128 |
| article / essay / **essay** | `article_format` cleared | 73 |
| article / **policy_brief** / **policy_brief** | type `essay`, `article_format` cleared | 4 |
| **research** / **research** / null | content_kind `article`, type `essay` | 5 |

82 rows changed, in three columns. No status moved, at any status: the
research drafts and the one pending research submission were normalized along
with the published rows.

**Why legacy Research and Policy Briefs became Articles.** They were long-form
titled work by their authors, which is what an Article is. Research and Policy
Brief were the retired workflow's names for them, not a second kind of
writing. Genre was descriptive metadata the product no longer shows, so it was
cleared rather than translated into something else.

---

## 4. The normalization migration

`supabase/migrations/20260915000005_normalize_post_classification.sql`

One transaction, five steps.

0. **Refuse the unknown.** Any row outside the five combinations above aborts
   the migration by name, rather than being guessed at.
1. **Capture.** Total, per-kind counts, a status histogram, and
   `md5(string_agg(md5((to_jsonb(p) - 'type' - 'content_kind' -
   'article_format')::text), '' order by p.id))`: every column of every row
   except the three this file may touch. `updated_at` is deliberately inside
   that hash, because a normalization is not an edit and a reader's "last
   updated" must not say it was.
2. **Disable two triggers, update, re-enable.** `posts_touch_updated_at` would
   have stamped `now()` on all 82 rows. `posts_sync_content_classification`
   derives `content_kind` from `type` and is about to be superseded; disabling
   it makes the outcome depend on the statements rather than on a reading of
   that function's firing conditions. Both are re-enabled inside the same
   transaction, so a failure anywhere rolls the disable back with everything
   else.
3. **Verify.** Post count unchanged; Posts still 101; Articles exactly the old
   Articles plus the old Research; no non-canonical value left; the status
   histogram identical; the row hash identical.

Idempotent: the normalized combinations are themselves two of the five step 0
permits, so a second run matches no rows and passes.

**The lock it takes was measured, not assumed.** `ALTER TABLE ... DISABLE
TRIGGER` takes `ShareRowExclusiveLock`, confirmed by probing `pg_locks` inside
a rolled-back transaction against production. Readers are unaffected for the
whole of the migration; only concurrent writes to `posts` block.

### The contract, and the locks

`20260915000006_canonical_post_classification.sql` makes the normalized shape
the contract, and refuses to run until `000005` has run.

- `content_kind` NOT NULL, `CHECK (content_kind in ('post','article'))`
- `CHECK (article_format is null)`, replacing the old value list and the old
  "only an Article may carry one"
- `CHECK (type in ('blog','essay'))`
- `CHECK (type = case content_kind when 'post' then 'blog' else 'essay' end)`,
  no longer satisfiable by a null `content_kind`
- `CHECK (content_kind = 'post' or nullif(btrim(title),'') is not null)`: the
  product rule, stated once, keyed on `content_kind` alone rather than
  resolved through `effective_content_kind()`

`20260915000007_retire_review_publication_locks.sql` redefines three functions
and refuses to run until `000006` has run. It changes no row and drops
nothing.

---

## 5. Deployment strategy

Expand, deploy, contract. The database learned the new shape first, the
application then stopped reading the old one, and nothing has been dropped.

The ordering constraint was real and is worth stating plainly: the Phase 2I
application reads `content_kind` alone, so deploying it before `000005` would
have left five research rows it has no name for. The migrations therefore run
first. The old application survives them, which is what makes that safe: it
resolves `content_kind` first and falls back to `type`, and every value it
writes (`blog`/`essay`, `post`/`article`, `article_format` null) is already
canonical. There is no window in which publishing breaks.

**All three migrations are applied to production.** Verified 2026-09-16:

```
posts 311   content_kind: post 101, article 210, other 0
type: blog 101, essay 210, other 0     article_format non-null: 0
content_kind NOT NULL: true
statuses: draft 100, pending 1, published 210
```

All five constraints are in force and none admits `research` or
`policy_brief`. `guard_locked_post_write()` no longer names `research` and
still refuses a `citation_id` change. `is_post_editable()` no longer names
`research`. `apply_post_edit_draft()` no longer writes
`editorial_updated_at`. `sync_post_content_classification()` derives `type`
from `content_kind`.

---

## 6. Post creation

A Post is what a writer gets when they do not give the piece a title.

`derivePresentationClassification(title)` in `lib/contribution.ts` returns
`{ title: null, content_kind: "post" }`. `createPost` persists
**`content_kind` and nothing else about classification**. The database derives
`type = 'blog'` and forces `article_format = null`.

Persisted fields on a new Post: `author_id`, `slug`, `title` (null), `excerpt`,
`content`, `tags`, `cover_image_url`, `status` (`draft`), `published_at`
(null), `content_kind` (`post`).

## 7. Article creation

An Article is what a writer gets when they do give the piece a title. The same
function returns `{ title: "...", content_kind: "article" }`, and the database
derives `type = 'essay'`.

Persisted fields on a new Article: the same list, with a non-empty `title` and
`content_kind` of `article`.

There is no type picker and no format picker. Removing the title from a draft
turns it back into a Post on the next autosave, and adding one turns it into an
Article, because the composer derives the kind from the title on every save.

---

## 8. `content_kind`

The classification, and the only one. `lib/contentModel.ts` went from 340 lines
to about 80:

```ts
export type ContentKind = "post" | "article";
isContentKind, parseContentKind, resolveContentKind,
contentKindForTitle, CONTENT_KIND_LABELS, getContentKindLabel,
contentKindRequiresTitle
```

`resolveContentKind` reads `content_kind` and nothing else. The fallback to
`type` is gone, deliberately: every row carries a canonical value, and a
fallback would be a second opinion about a question that now has one answer.

Removed with it: `ArticleFormat`, `resolveArticleFormat`,
`getArticleFormatLabel`, `ARTICLE_FORMAT_LABELS`, `LegacyPostType`,
`isLegacyPostType`, `legacyTypesForContentKind`, `contentKindFromLegacyType`,
`articleFormatFromLegacyType`, `legacyTypeForNewContent`, `isFormallyReviewed`,
`needsEditorialWorkflow`, `isLegacyPolicyBriefInFlight`, `CONTENT_KIND_RULES`
and the four `contentKind*` policy predicates.

## 9. Legacy `type`

No application code reads or writes `posts.type`. It is NOT NULL with no
default, and what satisfies that is the database: a BEFORE ROW trigger runs
before NOT NULL and CHECK are evaluated, so a row inserted with no `type` at
all leaves `sync_post_content_classification()` carrying one.

This is Option A from the brief, chosen over a temporary legacy write in the
application. A compatibility write in TypeScript would have to be threaded
through every write path and removed from every one of them later; a derivation
in the trigger is one place, and it also covers a client this repository does
not control. Both assignments in that function are marked
`LEGACY DB COMPATIBILITY -- REMOVE IN PHASE 2J`.

`type` survives in application code in exactly three places, each keeping an
existing URL working rather than reviving a concept, and each named in the
guard test's allowlist with its reason:

- `app/(main)/explore/exploreFilters.ts` maps a legacy `?type=` link to a shelf
- `lib/feedData.ts` maps a legacy `?type=` link to a feed content filter
- `app/api/og/route.tsx` maps a legacy `type=` parameter so an OG image already
  cached against a shared link still resolves

## 10. `article_format`

Always null in the database, and read nowhere in the application. The one
mention left is `NEVER_AUTHOR_WRITABLE_POST_COLUMNS` in `lib/postPolicy.ts`,
which is what keeps it that way from the application side.

Gone with it: the Explore genre axis and its chips, `getGenreFilterLabel`,
`isGenreRefinementActive`, the in-memory genre refinement and the copy that
explained that genre "does not change review status or credibility" (a sentence
only needed because the filter implied otherwise), the `Article · Essay` and
`Article · Policy Brief` labels on badges, covers, cards, the post page, the
landing page and the dashboard, the OG label suffixes, and the `ArticleMeta`
genre segment on feed cards.

---

## 11. Research compatibility

Research is not a kind, a type, a filter or a label.

- The five rows are Articles. The published one renders as an ordinary Article
  at its own URL; its title, body, slug, author and dates are unchanged.
- The three research drafts open in the composer. They used to 404 there.
- The one pending research submission keeps its `pending` status. `/edit/[slug]`
  shows it the notice for a status the retired review workflow produced. This
  is the single row in production that reaches that notice.
- `RESEARCH_TYPE_QUERY_EXCLUSION` is deleted. It was carried by the feed,
  search, discovery, topics, the dashboard, the sitemap, the landing page,
  suggested people and the bookmarks route. A filter against a value the
  database refuses to store is not a safety net.
- `guard_research_project_write()` still requires a linked output to be
  `type = 'research'`, so it can now never link. `research_projects` is a
  Phase 2D product and this is left for the cleanup phase.

## 12. Policy Brief and Essay compatibility

Both are Articles. The four Policy Briefs kept their statuses (3 draft, 1
published). The 73 rows carrying an `essay` genre kept everything except the
genre.

Legacy URLs still work: `/explore?type=essay` and `/explore?type=policy_brief`
open Articles, `/explore?type=blog` opens Posts, `/explore?type=research` falls
through to All.

A real bug was found and fixed here by the rewritten test: the legacy parameter
map was a plain object, so `?type=toString` resolved through the prototype
chain to `Object.prototype.toString` and returned a function where a filter was
expected. It is a `Map` now.

## 13. Response parent compatibility

`posts.in_response_to` is kept as data and read by nothing. 35 rows carry one,
19 of them drafts, and every parent exists. A Response is an ordinary Post or
Article and renders as one.

`in_response_to` was added to `NEVER_AUTHOR_WRITABLE_POST_COLUMNS`: it is not a
field anything may set, so no new Response can be created even by a patch that
names the column directly.

## 14. Review and citation residue

Removed from the application: the review status reads, the reviews and editor
decisions on the dashboard row, the queue position, the review-era `STATUS`
plumbing in `DashboardPostRow`, and the `citation_id` and
`published_version_id` projections on the post record, the bookmarks list, the
search results, the topics page, the profile and the feed.

Kept, deliberately:

- **`/publication/[citationId]`.** Two published rows carry a `citation_id` and
  those URLs were public and may have been cited elsewhere. The route does its
  own two-column lookup in `lib/citationResolution.ts` and permanently
  redirects to `/post/[slug]`. This is the residual read of `citation_id`, and
  it is the only one.
- **Immutability of both columns.** `checkWorkflowEvidence` refuses a set, a
  clear and a replace, matching the trigger. An author who could clear a
  `citation_id` could break a link somebody else published.

## 15. The classification trigger

`sync_post_content_classification()` was inverted. It used to derive
`content_kind` from `type`. It now does the reverse:

```
content_kind, if absent, from the legacy type, else from the title
type       := case content_kind when 'post' then 'blog' else 'essay' end
article_format := null
```

`content_kind` is authoritative, so a caller cannot reclassify a piece through
the legacy column. Nulling `article_format` unconditionally means a legacy
client cannot reintroduce a genre.

## 16. Admin analytics

"Editorial Trust" is gone: In Review, Pending Revisions, Completed Reviews,
Reviewed Published, Citable Posts, Avg Review Time and Policy Brief
Submissions, along with the `post_reviews` and `post_editor_decisions` queries
and the `policy_brief` post query that fed them. That is three fewer database
round trips on the page.

"Posts by Content Type" is now "Posts and Articles", counted on `content_kind`
and coloured with two values rather than four. The Published Posts card reads
"N Articles / N Posts".

## 17. Explore, Search, Profile and Feed

- **Explore** filters on All, Posts and Articles. One row of chips, no second
  axis, no in-memory refinement.
- **Search** returns Posts and Articles with a one-word badge. The typeahead
  and the search page used to disagree about research, one excluding it and the
  other not; they now agree because there is nothing to disagree about.
- **Profile** tabs are Posts, Articles and About. `PROFILE_KIND_FILTERS` and
  its `legacyTypes` are gone; a tab selects on `content_kind` alone, and
  `profilePublicationKind` is one line. `publicationBranches` lost its
  `legacyTypes` parameter and `PUBLICATION_BRANCHES_SQL` its `legacy` CTE,
  renumbering to $1 to $5.
- **Feed** selects on `content_kind`. `FeedListCriteria` lost
  `researchTypeExclusion` and `LIST_SQL` renumbered from $1 to $10 down to $1
  to $9. `FeedPostRow` lost `type`, `article_format`, `in_response_to` and the
  three `document_*` columns, and `PostCardData` lost those plus `citation_id`
  and `published_version_id`.

### Query and payload reduction

| Surface | Before | After |
|---|---|---|
| Admin analytics | 3 extra queries (policy briefs, reviews, decisions) | 0 |
| Feed list row | 20 columns | 14 |
| Post card payload | 8 classification and review fields | 1 (`content_kind`) |
| Post record | 28 columns | 19 |
| Bookmarks row | 21 columns | 16 |
| Dashboard row | 24 columns + 2 aggregates | 15 columns + 1 aggregate |
| Profile publication row | 11 columns | 9 |

---

## 18. Legacy publication checks

Against a fresh production build on port 3131, asserting page content rather
than status codes. `next start` answers 200 for a not-found page and for an
unmatched path that falls through to `/[username]`, so a status code proves
very little.

| Check | Result |
|---|---|
| Formerly citable publication renders as an Article | ok |
| Legacy citation URL reaches the post | ok |
| Legacy response publication | ok |
| Titleless Post | ok |
| Titled Post | ok |
| Article | ok |
| Landing, Explore, Search, Topics, Sitemap | ok |
| `/explore?type=essay`, `?type=policy_brief`, `?type=research` | ok |
| Profile Posts tab, Profile Articles tab | ok |

17 checks, 0 failed. Every page was also asserted not to contain "Policy
Brief", "Article · ", "Citable" or "Reviewed publication".

One note on the citation redirect: Next issues it as a
`<meta http-equiv="refresh">` carrying `NEXT_REDIRECT;replace;/post/...` rather
than an HTTP 308, because the shell has already been flushed by the time the
lookup resolves. A browser follows it. The first version of this check asserted
an HTTP-level redirect and reported a false failure.

## 19. Legacy draft checks

- The three research drafts open in the composer. They used to 404.
- The 19 response drafts keep their stored parent and open normally.
- Long-form drafts with a title are Articles; drafts without one are Posts, and
  the kind follows the title on every autosave.
- The single pending submission is not a draft and is not editable. It shows
  the notice for a retired review status, which is the honest answer.

---

## 20. Database deferred

Kept, with their values, and unread by the application:

`posts.type`, `posts.article_format`, `posts.in_response_to`,
`posts.citation_id` (read only by the citation redirect),
`posts.published_version_id`, `posts.current_round`, `posts.revision_due_at`,
`posts.document_path`, `posts.document_original_name`,
`posts.document_mime_type`, `posts.document_size_bytes`,
`posts.research_keywords`, `posts.pdf_url`, `posts.featured`.

Tables: `post_reviews` (6), `post_editor_decisions` (4), `post_versions` (6),
`citation_sequences` (1), `submission_tracks` (4).

Functions: `effective_content_kind()`, `withdraw_post_submission()` (selects on
types no row has, so it can only raise), `generate_citation_id()`,
`guard_research_project_write()` (can never link), `notify_post_approved()`.

Views: `profile_record_entries`, which still classifies through
`effective_content_kind()` and exposes `citable`.

Indexes naming the retired classification: `posts_published_type_recency_idx`,
`posts_review_state_idx`, `posts_research_document_idx`,
`posts_published_citable_recency_idx`, `posts_citation_id_idx`,
`posts_in_response_to_idx`, `posts_published_response_parent_recency_id_idx`,
`posts_published_version_idx`.

Plus everything deferred by Phases 2D to 2H, and the onboarding service-role
bridge.

### Two findings recorded rather than fixed

**`notify_post_approved()`** is still the only publish notification, and its
message is `'Your post "' || new.title || '" has been approved and published!'`.
For a titleless Post that concatenation is NULL, and production holds **5
`post_approved` notifications with a null message** out of 195. The copy is
also review-era ("approved"). Both belong to the brand pass, Phase 2K, or to
2J with the trigger.

**`app/api/audio-summary/route.ts`** takes a `postType` string in its request
body and puts it in an LLM prompt ("In this essay, ..."). It has no caller in
this repository. Left alone rather than changing an API shape with no reader.

---

## 21. Files

**Added (7)**

```
supabase/migrations/20260915000005_normalize_post_classification.sql
supabase/migrations/20260915000006_canonical_post_classification.sql
supabase/migrations/20260915000007_retire_review_publication_locks.sql
supabase/migrations/postClassificationMigrations.test.ts
scripts/migration/apply-content-model-migrations.mjs
lib/postArticleOnlyModel.test.ts
PUBLISHING_RESET_PHASE2I.md
```

**Deleted (0).** Nothing was deleted in this phase.

**Modified (93)**

Application: `app/(main)/admin/analytics/page.tsx`,
`app/(main)/admin/analytics/AnalyticsCharts.tsx`,
`app/(main)/bookmarks/page.tsx`, `app/(main)/dashboard/page.tsx`,
`app/(main)/dashboard/PostsTable.tsx`, `app/(main)/edit/[slug]/page.tsx`,
`app/(main)/explore/page.tsx`, `app/(main)/explore/ExploreFeed.tsx`,
`app/(main)/explore/exploreFilters.ts`, `app/(main)/post/[slug]/page.tsx`,
`app/(main)/post/[slug]/PostConversationView.tsx`,
`app/(main)/post/[slug]/PublishedToast.tsx`, `app/(main)/search/page.tsx`,
`app/(main)/topics/page.tsx`, `app/(main)/topics/[tag]/page.tsx`,
`app/(marketing)/landing/page.tsx`, `app/(marketing)/landing/landingData.ts`,
`app/(write)/write/page.tsx`, `app/(write)/write/actions.ts`,
`app/(write)/write/editActions.ts`, `app/(write)/write/MyDrafts.tsx`,
`app/api/bookmarks/route.ts`, `app/api/og/route.tsx`,
`app/dev-preview/feed/page.tsx`, `app/sitemap.ts`.

Components: `components/post/PostCard.tsx`, `components/post/HomeFeedCard.tsx`,
`components/post/PostCover.tsx`, `components/post/PostImage.tsx`,
`components/profile/ProfilePublicationList.tsx`, `components/ui/Badge.tsx`,
`components/ui/SearchOverlay.tsx`.

Library: `lib/contentModel.ts`, `lib/contribution.ts`, `lib/utils.ts`,
`lib/types.ts`, `lib/featureFlags.ts`, `lib/postDisplay.ts`,
`lib/postPolicy.ts`, `lib/postMutations.ts`, `lib/postDeletion.ts`,
`lib/profileTabs.ts`, `lib/profileViewData.ts`, `lib/guestAuth.ts`,
`lib/feedData.ts`, `lib/discoverData.ts`, `lib/notificationData.ts`,
`lib/suggestedPeople.ts`, `lib/auth/viewer.ts`,
`lib/devFixtures/homeFeedFixtures.ts`.

Data layer: `lib/db/types.ts`, `lib/db/readAdapter.ts`, `lib/db/parity.ts`,
`lib/db/postWrites.ts`, `lib/db/feedList.ts`, `lib/db/search.ts`,
`lib/db/dashboard.ts`, `lib/db/bookmarks.ts`, `lib/db/composer.ts`,
`lib/db/postPage.ts`, `lib/db/profilePage.ts`, `lib/db/notifications.ts`,
`lib/db/postgres/posts.ts`, `lib/db/supabase/posts.ts`.

Tests: 24 files, listed in section 22.

Docs: `CLAUDE.md`, `docs/content-model.md` (marked superseded),
`docs/post-write-rules.md` (marked superseded in part).

---

## 22. Tests

Sequential, in order.

| Check | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors |
| `npm test` | 1 failed (baseline), 2,290 passed, 212 skipped |
| `npm run build` | success, 64 routes |
| **New failures** | **0** |

The single failure is the allowed baseline,
`supabase/migrations/parameterizeIdentityRpcsMigration.test.ts > write paths >
check that the row they meant to change existed`, unchanged from Phase 2H.

**New tests.** `supabase/migrations/postClassificationMigrations.test.ts` (25
assertions across the three migrations: the mapping, the guards, the hash
check, the trigger-disable window, the contract constraints and the retired
locks). `lib/postArticleOnlyModel.test.ts` (18 assertions; application code
only, comments stripped, historical SQL and reports deliberately not scanned,
with a four-entry allowlist each naming why that residue survives).

**Rewritten.** `lib/contentModel.test.ts` went from 1,926 lines to 130, because
the model it tested had three kinds, two genres and a legacy fallback.
`lib/postPolicy.test.ts` (45 assertions) and `lib/postMutations.test.ts` (30)
lost the editorial half of their matrices.
`app/(main)/explore/explore.test.ts` lost the genre axis and gained the
prototype-chain case that caught a real bug.

**Updated.** `lib/contribution.test.ts`, `lib/featureFlags.test.ts`,
`lib/guestAuth.test.ts`, `lib/postDisplay.test.ts`, `lib/profileTabs.test.ts`,
`lib/profileViewData.test.ts`, `lib/postWriteBoundary.test.ts`,
`lib/profileContentSplitMigration.test.ts`, `lib/publicationsFirstHome.test.ts`,
`lib/devFixtures/homeFeedFixtures.test.ts`, `lib/db/parity.test.ts`,
`lib/db/postgres/posts.test.ts`, `lib/db/dashboard.neon.test.ts`,
`lib/db/feedList.neon.test.ts`, `lib/db/feed.parity.live.test.ts`,
`lib/db/profilePage.neon.test.ts`, `lib/db/profilePage.parity.live.test.ts`,
`lib/db/viewerDomains.parity.live.test.ts`, `lib/postPolicy.neon.test.ts`,
`lib/postMutations.neon.test.ts`, `components/ui/Badge.test.tsx`,
`components/ui/GuestAuthGateProvider.test.tsx`,
`components/post/PostCard.test.tsx`, `components/post/HomeFeedCard.test.tsx`,
`app/(main)/dashboard/PostsTable.test.tsx`.

---

## 23. Deployment order

Five of the six migrations in this sequence are applied. One remains.

| # | Migration | How | State |
|---|---|---|---|
| 1 | `20260914000001` review reminders cron removal | `apply-cron-removal.mjs` | applied |
| 2 | `20260915000002` daily brief cron removal | `apply-daily-brief-cron-removal.mjs` | applied |
| 3 | `20260915000003` publication recovery cron removal | `apply-publication-recovery-cron-removal.mjs` | applied |
| 4 | `20260915000004` retired trigger stop | `apply-retired-trigger-stop.mjs` | applied |
| 5 | `20260915000005` to `20260915000007` content model | `apply-content-model-migrations.mjs` | **applied** |
| 6 | **application deploy** | Vercel | **outstanding** |
| 7 | `20260915000001` messaging write disablement | `apply-messaging-write-disablement.mjs` | after the deploy |

Steps 1 to 5 are done. The next action is the application deploy, then step 7.

Step 7 stays last because it revokes client writes to the messaging tables, and
the deployed application must already have removed the surfaces that write
them.

**Telemetry.** `20260908000001_database_telemetry.sql` is still unapplied and
still stale: it redefines the four scheduler functions from definitions that
name the review reminder, daily brief and publication recovery jobs. Rebase it
onto `20260915000003` before applying it anywhere. Phase 2I touched the content
model rather than the scheduler, so it does not move that rebase target.

---

## 24. Phase 2J recommendation

2J is the database cleanup phase. Everything in section 20 is its inventory.
Three things are worth doing in a particular order.

**First, the columns the trigger is holding up.** `posts.type` is NOT NULL only
because `sync_post_content_classification()` fills it. Dropping the column
means redefining that function to set `article_format` alone, then dropping
`posts_type_check` and `posts_legacy_type_content_kind_check` with it. Do
`type` and `article_format` together; they are the same edit.

**Second, the objects that can now only fail.** `withdraw_post_submission()`
selects on types no row has. `guard_research_project_write()` requires a linked
output of `type = 'research'`. `generate_citation_id()` mints an identifier
nothing issues. Each can be dropped outright rather than migrated.

**Third, `notify_post_approved()`.** It is the only publish notification, so it
cannot simply be dropped: replace the message before or alongside removing the
review vocabulary, and repair the 5 rows whose message is NULL. This one has a
reader-visible consequence and should not be bundled with a column drop.

Deferred deliberately out of 2J: the onboarding service-role bridge, which
stays as it is, and the brand pass, which is 2K.

Do not begin any of it before the Phase 2I application deploy has shipped and
been observed. Every column in section 20 is still projected by a running
production deployment until then.
