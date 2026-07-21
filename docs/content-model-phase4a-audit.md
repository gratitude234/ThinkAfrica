# Phase 4A legacy dependency audit

Companion to [`docs/content-model.md`](./content-model.md). This is the
complete legacy-dependency audit required before/during Phase 4A of the
Post/Article/Research content-model migration: every place application
code, database objects, or tests make a behavioral decision based on
`posts.type`, the literal legacy values `blog`/`essay`/`policy_brief`/
`research`, `POST_TYPE_LABELS`, `requiresEditorialWorkflow()`, or a
name-based (rather than evidence-based) "reviewed"/"credible" check.

Every entry is classified as one of:

- **Compat** — required temporary dual-write compatibility (must survive
  until Phase 4B).
- **Display** — historical display/migration mapping; safe to keep, no
  correctness impact.
- **Fixed** — was incorrect under the new product decision; fixed in this
  phase (file/line reflects the *post-fix* state).
- **Deferred** — a genuine Phase 4A candidate, intentionally left for
  Phase 4B or a dedicated follow-up, with a stated reason.

A recurring, load-bearing fact behind several "Display"/safe-by-default
classifications below: **`legacyTypeForNewContent()`
(`lib/contentModel.ts`) guarantees every brand-new Article dual-writes
`type = "essay"` regardless of its chosen `article_format` genre.** A new
Policy-Brief-format Article's `type` is never `"policy_brief"` — only a
row that predates Phase 4A (or that a not-yet-migrated write path
produces) carries that literal legacy value. This means a bare `type ===
"policy_brief"` (or `type IN ('research','policy_brief')`) check, while
architecturally not "new-model aware," is not automatically a live bug —
it already excludes every new Policy-Brief-format Article by construction,
as long as nothing ever sets `type = "policy_brief"` for new content. That
invariant is exactly what this phase protects (see the genre picker in
`app/(write)/write/PublishDrawer.tsx` and `NEW_ARTICLE_TYPE` in
`app/(write)/write/actions.ts`).

That distinction is why this audit separates **"already safe because
`type` is guaranteed accurate"** (Display) from **"was actually wrong
regardless of era"** (Fixed) — the former was a robustness/architecture
gap, the latter a real bug (usually the `type === X || citation_id`
pattern, which conflates "requires review" with "has been reviewed" and
is wrong even under the pre-Phase-4A model).

## 1. Centralized model/workflow helpers (new this phase)

`lib/contentModel.ts` gained three additions (see file for full doc
comments):

- `isLegacyPolicyBriefInFlight(record)` — "already entered a legacy review
  workflow": `type === "policy_brief" && status IN (pending,
  pending_revision)`. Narrowly scoped to the literal legacy value and to
  the two in-flight statuses.
- `needsEditorialWorkflow(record)` — composite: `contentKindRequiresFormalReview(resolveContentKind(record))
  || isLegacyPolicyBriefInFlight(record)`. Available for any new call site
  that needs "should this go through reviewers right now" without relying
  on `type` staying accurate.
- (Existing, unchanged) `contentKindRequiresFormalReview` ("requires
  review by product policy" — kind-only, research only),
  `isFormallyReviewed` ("has completed formal review" — evidence-only),
  `resolveContentKind`/`resolveArticleFormat`, `legacyTypeForNewContent`.

These three concepts are deliberately kept separate per record/helper —
see the doc comment above `needsEditorialWorkflow` in `lib/contentModel.ts`
for why they must never collapse into one boolean.

**Why `lib/reviewWorkflow.ts`'s `requiresEditorialWorkflow(type)`,
`lib/postQuality.ts`'s `requiresReview`, and
`lib/editorialTrust.ts`'s `typeRequiresFormalReview` were NOT rewritten to
call `needsEditorialWorkflow()`:** all three currently compute `type ===
"research" || type === "policy_brief"` directly. Because `type` is
guaranteed accurate (see above), this is already behaviorally correct
under the new product decision — a new Policy-Brief-format Article always
has `type = "essay"` and so never trips these checks; a legacy
`policy_brief` row (pending, pending_revision, *or already published/
locked*) always does. Naively swapping in `needsEditorialWorkflow()`
would have been **wrong** for at least one of their real call sites:
`app/(main)/edit/[slug]/actions.ts`'s `post.status === "published" &&
requiresEditorialWorkflow(post.type)` lock check needs "is this the kind
of content whose acceptance made it permanently locked" (true for a
published legacy Policy Brief, unconditionally), not "is this actively
mid-workflow right now" (which `needsEditorialWorkflow`/
`isLegacyPolicyBriefInFlight` correctly scope to pending/pending_revision
only, and would wrongly return `false` for an already-accepted legacy
Policy Brief — silently unlocking it). **Classification: Display** —
architecturally implicit rather than explicit, flagged as a Phase 4B
cleanup candidate (see §7), not touched this phase to avoid this exact
class of regression.

## 2. Fixed this phase — evidence-based "reviewed"/"citable" bugs

These were wrong under **any** model, not just the new one: they treat
`type`/genre membership as proof of completed review, when only
`citation_id`/`published_version_id` (or, for research specifically,
Phase 3's own locking invariants) actually prove it. A pending or draft
research/policy_brief record was always incorrectly counted as "reviewed"
by these before the fix.

| File | What changed |
|---|---|
| `lib/feedData.ts` (`fetchCitableFeedUncached`) | Removed the `.in("type", ["research","policy_brief"])` fallback that padded the "Citable" shelf with non-evidence rows; now evidence-only (`citation_id IS NOT NULL`), returning fewer than `pageSize` items if that's all that qualifies. |
| `lib/applicationReview.ts` (`proofSignalFor`, `reviewedCount`) | Both now use `isFormallyReviewed()` instead of `type === "research" \|\| type === "policy_brief"`. |
| `lib/opportunityMatch.ts` (`hasReviewedOrSourceBackedWork`) | Same fix. |
| `lib/opportunityReadiness.ts` (`hasReviewedOrReferencedWork`) | Same fix. |
| `lib/talentDiscovery.ts` (`countReviewedOrCitable`) | Same fix. |
| `app/(main)/admin/analytics/page.tsx` (`reviewedProfileUsers`, `reviewedProofApplications`) | Same fix; added `published_version_id` to the two underlying `posts` selects so `isFormallyReviewed()` has both evidence fields available. |
| `app/(main)/dashboard/page.tsx` (`reviewedOrCitableCount`) | Same fix. |
| `app/(main)/admin/review/page.tsx` (per-post `credibilitySummary.reviewedCount`) | The worst instance: this loop only ever runs over posts still sitting in the *pending* review queue, so `requiresEditorialWorkflow(post.type) ? 1 : 0` unconditionally reported "1 reviewed work" for every research/policy_brief submission shown to the editor — including ones that had never been looked at. Now `isFormallyReviewed(post) ? 1 : 0`, which is correctly always `0` for anything still in this queue. |

**Classification: Fixed.**

## 3. Fixed this phase — new-model correctness bugs

Unlike §2, these were only wrong *because* of the new model — they filter
by the legacy `type` column directly for a genre (`policy_brief`) that a
brand-new Article no longer carries on `type` at all.

| File | What changed |
|---|---|
| `lib/feedData.ts` (`applyPostFilters`) | The "Policy Briefs" feed filter chip did `.eq("type", "policy_brief")`, which is invisible to every Policy-Brief-format Article created after Phase 3 (their `type` is `"essay"`). Now `.eq("article_format", "policy_brief")`. The "Blogs"/"Research" chips now filter by `content_kind` too, for the same robustness reason (no live bug there today, but no reason to leave two of four chips inconsistent with the other two). |
| `app/(main)/explore/page.tsx` (`filterPostsByType`) | Same bug, same fix, client-side (`resolveArticleFormat`/`resolveContentKind` over already-fetched `PostCardData[]` instead of `post.type` membership). `TYPE_FILTERS`' now-unused `types` field was removed. |

**Classification: Fixed.**

## 4. Fixed this phase — composer / creation UX

| File | What changed |
|---|---|
| `app/(write)/write/PublishDrawer.tsx` | Added an optional Article genre picker (General / Essay / Policy Brief), rendered only when `postType === "essay"` (i.e. never for a legacy Policy Brief draft, whose `postType` is `"policy_brief"`). Explicit copy: "Descriptive metadata only — it doesn't change when or how this Article publishes." Selecting a genre never touches `postType`/`isInstantPublish`/`publishLabel`, all of which depend only on `postType`. |
| `app/(write)/write/actions.ts` (`publishPost`) | Added optional `articleFormat` input, applied **only** when `effectiveType === NEW_ARTICLE_TYPE` (`"essay"`) — i.e. only for a brand-new or still-drafting generic Article, never a legacy Policy Brief (`effectiveType === "policy_brief"` there, so the guard excludes it regardless of what the client sends). Validated with `parseArticleFormat()`, which fails safe to `null` ("General") on anything unrecognized. |

Top-level creation UI was **already correct** before this phase —
`app/(main)/createActions.ts`'s `CREATE_ACTIONS` (consumed by
`CreateLauncher.tsx`, the only launcher in the app) already exposes
exactly `Post` / `Article` / `Research Paper`, with a regression test
(`createActions.test.ts`) explicitly asserting no `essay`/`policy brief`/
`blog`/`quick take` label appears. **Classification: Fixed** (genre
picker, previously missing entirely) / **already correct, unchanged**
(top-level chooser).

Legacy `/write?type=essay` / `/write?type=policy_brief` links still
resolve (via `resolveWriteRedirectPath()` in `writeConfig.ts`) to the
generic Article composer without ever seeding a workflow state from the
query string before a real draft loads — `postType` local state in
`page.tsx` is seeded `"essay"` by default and only overwritten once a
loaded draft (`initialData`) actually arrives, never from the query
param directly (see the comment at `page.tsx`'s `postType` declaration).
No change needed. **Classification: Display** (harmless legacy redirect).

## 5. Fixed this phase — badges/labels

| File | What changed |
|---|---|
| `components/post/PostCover.tsx` | Added optional `content_kind`/`article_format` props, mirroring `components/ui/Badge.tsx`'s existing label logic exactly, so the fallback cover placeholder text (shown when there's no cover image) can stay consistent with the resolved label shown in an adjacent `Badge` for the same post. Backward compatible — callers that don't pass the new props still get the legacy-`type`-only label, unchanged. |

**Not chased this phase:** the ~10 call sites of `<PostCover>`
(`post/[slug]/page.tsx`, `FeaturedPostLead.tsx`, `EditorPicksRow.tsx`,
`PostCard.tsx`, `FeaturedWork.tsx`, `landing/page.tsx`,
`FeaturedPostBanner.tsx`) were not individually updated to pass the new
props — each would require confirming its underlying query already
selects `content_kind`/`article_format` (most do; a couple would need a
`select()` change first). The component is now content-model-aware and
backward compatible; wiring individual callers is a natural, low-risk
follow-up as each file's data-fetching is next touched.
**Classification: Deferred** (component fixed; caller wiring deferred).

## 6. Deferred — safe-by-construction, not touched this phase

Every entry below checks `type` (or `type IN ('research','policy_brief')`)
directly rather than through `resolveContentKind`/`resolveArticleFormat`.
Per the load-bearing invariant at the top of this document, none of these
are *live* bugs — `research` is unambiguous under both models, and
`policy_brief` as a raw `type` value only ever appears on legacy rows.
They are listed here because the task's required-work section names them
explicitly ("review routing, editing permissions... any remaining
reviewed/credible calculation"), and because leaving them un-migrated is a
conscious scope decision, not an oversight.

**Routing/editing-permission checks on `type === "research"`** (all
unambiguous, all safe):
`app/(main)/post/[slug]/page.tsx` (`isResearchPost`, the research-hero
layout branch; the `ResearchDocumentPanel` gate; the `/api/og` `type`
query param), `app/api/og/route.tsx` (`typeLabel` map — has no
`content_kind`/`article_format` awareness at all, so it also can't yet
render a correct "Policy Brief" label for a new-model Policy-Brief
Article's share card; low severity since the label falls back to
"Article", not something misleading), `app/(main)/dashboard/PostsTable.tsx`
(`reviewedPublication`, the research-vs-article routing branches, the
`reviewedType`-driven status label), `app/(main)/dashboard/page.tsx`
(`workUnderReviewItems`/`reviewedDraftMissingReferences`/
`reviewedDraftReady`, the submit-research routing link),
`app/(main)/admin/review/page.tsx` (queue grouping by raw `type`, the
"Policy Briefs — Feature for Institutions" eligibility query, the Research
PDF panel gate), `app/(main)/admin/review/actions.ts` (accepted-publication
notification/email text interpolating the raw lowercase `type` value
instead of `getContentKindLabel`/`getArticleFormatLabel`; revision-request
notification routing), `app/(main)/admin/page.tsx` (editorial-queue
dashboard stat), `app/(main)/policy/page.tsx` (Policy Hub listing query),
`app/(main)/FeaturedPostLead.tsx` (PDF-vs-read-time label).

**Reason deferred:** each is a single- or few-line, low-risk, purely
mechanical swap to `resolveContentKind`/`resolveArticleFormat`, but there
are enough of them across enough files that batching them into this phase
risked spreading review thin across the genuinely load-bearing changes
(the evidence-based bug fixes in §2–3, the SQL migration, and the new
helpers). None of them can currently misclassify a new-model Policy-Brief
Article as research or vice versa. **Recommended:** fold into Phase 4B
alongside the `requiresEditorialWorkflow()`/`postQuality.ts`/
`editorialTrust.ts` cleanup in §1, once `type` itself is being retired and
these call sites have to move off it anyway.

**Analytics/points/ranking keyed by raw `type`:**
`lib/utils.ts`'s `POST_POINTS` (gamification points per legacy type,
`blog:10, essay:20, policy_brief:30, research:50`), consumed by
`app/(main)/leaderboard/page.tsx`, `app/(main)/admin/digest/{page,actions}.ts`
(weekly digest email content), `app/(main)/dashboard/PostsTable.tsx` and
`app/(main)/post/[slug]/page.tsx` ("points earned" toasts);
`lib/feedRanking.ts`'s `TYPE_WEIGHT` (feed ranking multiplier,
`research:3.0, policy_brief:2.5, essay:2.0, blog:1.0`);
`app/(main)/admin/analytics/page.tsx`'s "Posts by Content Type" breakdown
and `AnalyticsCharts.tsx`'s `TYPE_COLORS`/chart bucketing.

**Reason deferred — this is a product decision, not a mechanical fix:**
re-keying these off `resolveContentKind`/`resolveArticleFormat` instead of
raw `type` would, for the first time, make a *new* Policy-Brief-format
Article eligible for the same elevated points/ranking-weight/analytics
bucket a *legacy* Policy Brief got — but the legacy value was elevated
specifically because it required (and typically received) formal review,
which a new Policy-Brief-format Article explicitly does not. Silently
carrying that elevated weight forward would contradict "an Article genre
must not by itself imply review, credibility, or citation." Deciding what
a new Policy-Brief-format Article *should* score is a product decision
this phase does not make unilaterally. Until decided, leaving these keyed
on the legacy `type` column is actually the *safer* choice: a new
Policy-Brief Article's `type` is `"essay"`, so it already scores/ranks as
a plain Article — no genre-based inflation happens today, which is
consistent with the product decision even though the mechanism (still
reading raw `type`) isn't yet the new-model-native one.
**Classification: Deferred**, blocking on a product decision (see §8).

## 7. Compat — required temporary dual-write compatibility

- `posts.type` itself (`NOT NULL`, existing check constraint) — still
  written on every insert/update, still read by every not-yet-migrated
  surface listed in §6.
- `public.sync_post_content_classification()` (Phase 1 trigger) and
  `posts_legacy_type_content_kind_check` (Phase 1 constraint) — untouched
  by this phase; still the backstop for any write path that hasn't been
  updated to dual-write explicitly.
- `posts_title_required_unless_post_check` (Phase 2 constraint) —
  untouched; already implements the same "prefer content_kind, fall back
  to type" pattern this phase's new `effective_content_kind()` SQL
  function generalizes.
- `legacyTypeForNewContent()` (`lib/contentModel.ts`) — the single
  chokepoint deciding what legacy `type` a brand-new Post/Article
  dual-writes (`post → "blog"`, `article → "essay"` regardless of genre,
  `research → null`, since research has its own submission flow). This is
  the function every "safe by construction" classification in this
  document ultimately depends on.
- `isLegacyPolicyBriefInFlight()` / `is_legacy_policy_brief_in_flight()`
  (SQL) — new this phase, explicitly temporary. See §7 exit criteria in
  `docs/content-model.md`.
- `submission_tracks` (DB table, `20260420193000_journal_system.sql`) —
  keyed by literal `post_type` values (`blog`/`essay`/`policy_brief`/
  `research`). Confirmed (via full-repo grep) to have zero other SQL
  readers/joins; consumed only from `lib/reviewWorkflow.ts`'s
  `getSubmissionTrack()`. Left untouched this phase — its `post_type` key
  continues to correctly resolve for every row because `type` itself
  stays accurate (same invariant as §1/§6).

## 8. Explicitly deferred — Phase 4B contract cleanup

Everything that only makes sense once `type` is actually retired, or that
requires a product decision this phase doesn't make:

- Drop `posts.type`, its `NOT NULL` constraint, and its check constraint.
- Drop `sync_post_content_classification()` and
  `posts_legacy_type_content_kind_check`.
- Simplify `posts_title_required_unless_post_check` to key off
  `content_kind` alone.
- Make `content_kind` `NOT NULL`.
- Migrate `lib/reviewWorkflow.ts`'s `requiresEditorialWorkflow()`,
  `lib/postQuality.ts`'s `requiresReview`, and `lib/editorialTrust.ts`'s
  `typeRequiresFormalReview` off raw `type` (see §1 for why not now).
- Migrate the routing/editing-permission call sites in §6 off raw `type`.
- **Product decision required:** should a new Policy-Brief-format
  Article's gamification points (`POST_POINTS`), feed-ranking weight
  (`TYPE_WEIGHT`), and analytics bucketing differ from a plain Article's?
  Once decided, re-key `lib/utils.ts`/`lib/feedRanking.ts`/
  `AnalyticsCharts.tsx` off `resolveContentKind`/`resolveArticleFormat`.
  See §6.
- Retire `submission_tracks`' `post_type` key (or repoint it at
  `content_kind`/`article_format`) once nothing reads raw `type` anymore.
- Wire `content_kind`/`article_format` through the remaining `<PostCover>`
  call sites (§5).
- Delete `isLegacyPolicyBriefInFlight()` / `needsEditorialWorkflow()` /
  `is_legacy_policy_brief_in_flight()` once preflight check 7
  (`supabase/phase4a_preflight_checks.sql`) returns zero rows and stays at
  zero — i.e. every legacy pending/pending_revision Policy Brief has been
  accepted, rejected, or withdrawn, and no code path can produce a new one.

See "Phase 4B exit criteria" in `docs/content-model.md` for the exact,
checkable conditions gating each of the above.
