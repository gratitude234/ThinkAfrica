# Content model migration (Post / Article / Research)

## Target model

Indegenius's publishing model is moving from four flat post types to three
content kinds:

1. **Post** — lightweight, short-form. Title is optional (Phase 2).
   Publishes immediately. Not formally reviewed or citable.
2. **Article** — long-form rich text. Title required. Publishes
   immediately. Essay and Policy Brief are optional *genres* of Article
   (`article_format`), selected in the Article composer (Phase 4A) — never
   top-level creation choices, and never proof of review, credibility, or
   citation by themselves.
3. **Research** — formal research-paper record: title, abstract, PDF,
   authors, topics, references. Goes through the existing editorial review
   workflow. Becomes citable only after acceptance, and only through
   actual workflow evidence (`citation_id`/`published_version_id`) — never
   because of its kind or genre alone.

## Legacy mapping

The existing `posts.type` values map onto the new model as:

| legacy `type`  | `content_kind` | `article_format` |
|----------------|----------------|-------------------|
| `blog`         | `post`         | —                 |
| `essay`        | `article`      | `essay`           |
| `policy_brief` | `article`      | `policy_brief`    |
| `research`     | `research`     | —                 |

`lib/contentModel.ts` is the single source of truth for this mapping and
for resolving a post's effective classification from either column.

## Why expand-and-contract

This is being rolled out as an **expand-and-contract** migration:

- **Expand (Phase 1):** add nullable `content_kind` and `article_format`
  columns additively, backfill them from `type`, and have every write path
  dual-write both the legacy and new columns. `type` keeps its `NOT NULL`
  constraint and existing check constraint — nothing that reads `type`
  breaks. (Phase 2 additionally made `title` optional for `content_kind =
  post`.)
- **Migrate (Phase 3–4A):** Phase 3 locked accepted/removed/withdrawn
  content against direct authenticated writes (see
  `supabase/migrations/20260720000001_lock_accepted_and_removed_posts.sql`).
  Phase 4A (this phase) moves *runtime authority* onto the new columns:
  the top-level creation UI is Post/Article/Research Paper only, an
  Article's genre (Essay/Policy Brief) is optional metadata chosen inside
  the Article composer, "reviewed"/"credible" is evidence-based
  everywhere it's shown, and the Phase 3 database guards resolve content
  classification through new, centralized SQL helpers
  (`effective_content_kind()`/`effective_article_format()`) instead of
  hand-coded `type` checks. **All of this ships in application code and a
  new migration file; the migration itself may still be unapplied to any
  given database — check `supabase/migrations/` and your deployment
  process, don't assume.** See
  `docs/content-model-phase4a-audit.md` for the full dependency audit.
- **Contract (Phase 4B, not started):** once every reader and writer is
  confirmed to work off the new columns and no legacy Policy Brief is
  still mid-workflow, drop the sync trigger, drop `type`, and make
  `content_kind` the required column. See "Phase 4B exit criteria" below.

Doing it this way means the database migration, the application code, and
any rollback can each ship independently without a coordinated cutover.

## Article genres are metadata, not proof of anything

Essay and Policy Brief are optional, descriptive `article_format` values a
user may pick when composing an Article (Phase 4A: see the genre picker in
`app/(write)/write/PublishDrawer.tsx`). Choosing a genre:

- **Never** changes publish timing — every Article publishes immediately,
  regardless of genre.
- **Never** routes the Article into editorial review.
- **Never** counts as evidence of formal review, credibility, or a
  citation — "reviewed"/"citable" badges and counts are derived
  exclusively from `citation_id`/`published_version_id`/completed review
  state (`isFormallyReviewed()` in `lib/contentModel.ts`), never from
  `content_kind` or `article_format`.

A brand-new Policy-Brief-format Article always dual-writes the legacy
`type` column as `"essay"` (see `legacyTypeForNewContent()`) — never the
literal `"policy_brief"` value. That single invariant is what keeps the
temporary legacy-compatibility path below narrowly scoped to genuinely
pre-existing rows; see `docs/content-model-phase4a-audit.md` for the full
reasoning and every place in the codebase that depends on it.

## Legacy Policy Brief compatibility (temporary, Phase 4B removes it)

Existing Policy Brief records predating Phase 4A are preserved exactly:

- A **published/accepted** legacy Policy Brief keeps its `citation_id`,
  `published_version_id`, editorial history, and lock-after-acceptance
  protection — nothing about it changes or is downgraded.
- A **pending/pending_revision** legacy Policy Brief stays inside the
  pre-Phase-4A editorial workflow (reviewer assignment, editor decision,
  revision cycle, withdrawal) exactly as before, via
  `isLegacyPolicyBriefInFlight()` (`lib/contentModel.ts`) and
  `is_legacy_policy_brief_in_flight()` (SQL, added in the Phase 4A
  migration). Both are narrowly scoped to the literal legacy value `type
  = "policy_brief"` combined with an in-flight status — never to
  `article_format = "policy_brief"`, since that would also (wrongly) sweep
  in every new Policy-Brief-*format* Article.
- Both helpers, and every guard/UI branch that calls them, are documented
  as temporary and are deleted in Phase 4B once no legacy row is left
  in-flight (see exit criteria below).

## What stays temporarily

- `posts.type` (`NOT NULL`, existing check constraint) — still dual-
  written by every content-creation path; still the fallback every
  `resolveContentKind()`/`resolveArticleFormat()` call and the new SQL
  `effective_content_kind()`/`effective_article_format()` functions use
  when the new columns are absent.
- `public.sync_post_content_classification()` trigger and
  `posts_legacy_type_content_kind_check` constraint (Phase 1) — backfill/
  enforce consistency for any write path that hasn't been updated to
  dual-write explicitly.
- `posts_title_required_unless_post_check` (Phase 2) — unchanged; already
  implements the same "content_kind first, `type` fallback" pattern
  generalized into SQL helpers this phase.
- A short, explicitly documented list of routing/analytics/gamification
  surfaces that still branch on raw `type` but are *not* live bugs because
  `type` is guaranteed accurate for new content (see
  `docs/content-model-phase4a-audit.md` §6) — left for Phase 4B rather
  than migrated speculatively this phase.

## Phase 4B exit criteria

Phase 4B (the contract step) may begin once **all** of the following hold:

1. `supabase/phase4a_preflight_checks.sql` check 7 (pending/
   pending_revision legacy Policy Briefs) returns zero rows, and has held
   at zero for long enough to be confident no legacy submission is still
   working its way through the old flow.
2. Preflight checks 1–4 (null/invalid `content_kind`, invalid
   `article_format` combinations, new-vs-legacy disagreements, blank
   titles on non-Post rows) all return zero rows.
3. Every routing/editing-permission call site listed in
   `docs/content-model-phase4a-audit.md` §6 has been migrated off raw
   `type` onto `resolveContentKind`/`resolveArticleFormat` (or the SQL
   `effective_content_kind()`/`effective_article_format()` equivalents).
4. `lib/reviewWorkflow.ts`'s `requiresEditorialWorkflow()`,
   `lib/postQuality.ts`'s `requiresReview`, and `lib/editorialTrust.ts`'s
   `typeRequiresFormalReview` have been migrated to distinguish "requires
   review by policy" / "already in a legacy workflow" / "has completed
   review" explicitly (via `contentKindRequiresFormalReview()`/
   `isLegacyPolicyBriefInFlight()`/`isFormallyReviewed()`) instead of a
   single `type` check that happens to be correct today.
5. A product decision has been made on whether a new Policy-Brief-format
   Article's gamification points / feed-ranking weight / analytics
   bucketing should differ from a plain Article's (see audit §6/§8), and
   `lib/utils.ts`'s `POST_POINTS`, `lib/feedRanking.ts`'s `TYPE_WEIGHT`,
   and the admin analytics content-type breakdown have been re-keyed
   accordingly.
6. `isLegacyPolicyBriefInFlight()`, `needsEditorialWorkflow()`, and the
   SQL `is_legacy_policy_brief_in_flight()` function have no remaining
   callers other than historical/audit tooling, and can be deleted.

Once all six hold: drop `posts.type` (and its `NOT NULL`/check
constraints), drop `sync_post_content_classification()` and
`posts_legacy_type_content_kind_check`, simplify
`posts_title_required_unless_post_check` to key off `content_kind` alone,
and make `content_kind NOT NULL`.
