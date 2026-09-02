# Publishing Core v2: backend and domain audit

Status: audit only. No code or schema has been changed.

Scope: everything below the UI. Tables, migrations, functions/RPCs, triggers,
RLS, storage, scheduled jobs, server actions, service modules, types and
business-logic hooks.

Target product: a publishing platform with exactly two formats, Microblog and
Article. Everything else is removable.

---

## 1. Headline findings

**1. The product is already most of the way there, and nobody noticed.**
`20260823000001_universal_publishing.sql` (applied) plus `UniversalComposer`
already implement a two-format model: one composer, one table, and the format
is decided by whether the writer typed a title. Title present publishes an
Article, title absent publishes a Microblog. There is no separate microblog
table, no separate article table, and no separate publish path between them.

**2. But the model is encoded three times, in three shapes that disagree.**
A single row carries the answer to "what is this" in three columns:
`posts.type` (legacy, `NOT NULL`, `blog|essay|research|policy_brief`),
`posts.content_kind` (`post|article|research`), and `posts.article_format`
(`essay|policy_brief`). Eight database objects exist purely to keep them in
sync. The mapping is also implemented twice more, once in SQL
(`effective_content_kind()`) and once in TypeScript (`resolveContentKind()`),
each with its own documented edge cases. This is the single biggest source of
accidental complexity in the backend.

**3. Roughly half of the write path is dead code.**
`app/(write)/write/actions.ts` is 1,417 lines and contains two complete,
parallel draft-and-publish pipelines. Only one has callers.
`ensureDraft()` / `publishPost()` / `savePostReferences()` (about 700 lines) are
referenced by nothing except their own test file. Same story for
`lib/shortPostContent.ts` and `lib/shortPostHtml.ts`, a whole microblog body
model with a 2,000 character limit that no runtime code imports.

**4. There are two live "edit a published post" implementations with different
semantics.** `/edit/[slug]` deliberately never reclassifies a post.
`/write?post=` recomputes `type`/`content_kind` from the title on every save,
inside the `apply_post_edit_draft()` RPC. Both are reachable today. They
disagree about what editing means.

**5. Debates is the largest thing in the repo, by a wide margin.**
49 of 175 database functions, 17 tables, roughly 7,700 lines of SQL across five
migrations, three parallel UI versions (V1, V1.5, V2), and 4 of the 8 scheduled
cron jobs. Two of those five migrations rewrite each other's functions, and
`docs/debate-deployment-state.md` records that nobody currently knows which of
them ran in production. Deleting Debates removes the single largest correctness
liability in the codebase.

**6. `CLAUDE.md` is stale about the schema.** It names `editor_assignments`,
`opportunity_applications` and `ambassador_applications` as key tables. None of
the three exists in any migration. Do not use it as a schema reference during
the reset.

---

## 2. Scale of the current surface

| Thing | Count | Removed by this reset |
|---|---|---|
| Tables | 89 (88 `public`, 1 `private`) | 54 |
| Migration files | 114 applied + 5 release gated candidates | all superseded |
| SQL lines | 24,079 | ~16,000 |
| Functions / RPCs | 181 (175 `public`, 6 `private`) | ~100 |
| Triggers | 58 distinct | ~25 |
| `CREATE POLICY` statements | 299 (190 distinct names) | ~180 |
| Storage buckets | 5 | 2 |
| Scheduled jobs | 8 pg_cron jobs into 6 HTTP cron routes | 5 of 6 routes |
| Server action files | 46 | 27 |
| `lib/` modules | ~200 files, 39,632 lines | ~90 files |
| Test files | 204 | ~90 |

---

## 3. Database inventory and verdicts

### 3.1 Tables

#### KEEP (18)

Core publishing and social graph. These survive with column edits only.

| Table | Note |
|---|---|
| `profiles` | Keep. Strip the ~15 columns belonging to deleted domains (see 3.6). |
| `posts` | REBUILD in place, see 3.2. Listed here because row identity and the slug space are preserved. |
| `comments` | Keep as is, including `hidden_at`/`hidden_by` moderation. |
| `comment_votes` | Keep. |
| `likes` | Keep. |
| `post_like_counts` | Keep. Trigger maintained counter, no client writes. Correct design. |
| `bookmarks` | Keep. |
| `post_bookmark_counts` | Keep, same pattern. |
| `follows` | Keep. |
| `post_references` | Keep. Not a research feature. Inline citations in Article bodies anchor to `post_references.id`, so these row ids are part of the published document. |
| `post_reference_counts` | Keep, same counter pattern. |
| `post_engagement_events` | Keep. Backs impressions, opens and qualified reads, and feeds the ranker via `get_reader_affinity()`. |
| `notifications` | Keep, with the type check constraint rewritten (see 3.3). |
| `push_subscriptions` | Keep. |
| `reports` | Keep. Trust and safety. |
| `user_blocks` | Keep. Trust and safety. |
| `admin_audit_events` | Keep. |
| `profile_featured_posts` | Keep. Publishing native: an author pinning their own work. |

#### MERGE (4)

Four tables model "unsaved writing" in four different shapes. Collapse to one.

| Table | Current role |
|---|---|
| `posts` rows with `status='draft'` | The composer's cloud autosave target for new work. |
| `post_edit_drafts` | Private staging for edits to an already published post. Applied via `apply_post_edit_draft()`. |
| `post_revisions` | Throttled snapshots (one per 3 min, pruned to 40) written by `record_post_revision()`. |
| `post_draft_shares` | One unlisted read token per draft, revoked by stamping `revoked_at`. |

Verdict: keep the concepts (draft, edit staging, history, share link) but merge
them into a single `post_drafts` + `post_revisions` pair keyed off a `post_id`,
so "editing a draft" and "editing a published post" stop being two different
subsystems with two different action files.

#### REBUILD (2)

| Table | Why |
|---|---|
| `posts` | Three overlapping classification columns, 7 statuses of which 5 are review only, 4 research document columns, and a `title` constraint that routes through a SQL helper. See 3.2. |
| `post_authors` | Co-authorship is entangled with the editorial workflow (`post_versions` snapshots author lists per round). Rebuild as a plain, invite based collaborator list, or delete it if co-authoring is out of scope for v2. Decision needed. |

#### DELETE (54)

**Editorial review workflow (7)** `post_reviews`, `post_editor_decisions`,
`post_versions`, `submission_tracks`, `citation_sequences`,
`policy_briefs_featured`, `contact_requests`. Nothing in the two format model is
reviewed. `citation_sequences` already has zero references in application code.

**Research (8)** `research_projects`, `research_project_members`,
`research_project_updates`, `research_project_assets`, `research_project_events`,
`research_collaboration_requests`, `researcher_profiles`,
`research_expansion_targets`.

**Debates (17)** `debates`, `debate_rounds`, `debate_arguments`,
`debate_argument_sources`, `debate_argument_sources_v1`, `debate_ballots`,
`debate_cross_exchanges`, `debate_memberships`, `debate_moderation_events`,
`debate_motion_votes`, `debate_notification_events`, `debate_participants`,
`debate_reactions`, `debate_slots_v1_5`, `debate_subscriptions`,
`debate_v1_5_reminders`, `debate_votes`.

**Opportunities / Fellowships / Talent / Partners (10)** `fellowships`,
`fellowship_applications`, `saved_opportunities`, `opportunity_outcomes`,
`opportunity_outcome_events`, `talent_profiles`, `talent_inquiries`,
`institutional_partners`, `sponsor_placements`, `campus_ambassadors`.

**Campus (7)** `campus_ambassador_activity`, `campus_cohorts`,
`campus_cohort_memberships`, `campus_programs`, `campus_editorial_prompts`,
`campus_prompt_submissions`, `universities`.

**Dead already (5)** `webinars`, `webinar_attendees`, `webinar_questions`,
`user_activity_days`, `user_onboarding_preferences`. Zero application references
between them. `next.config.mjs` still redirects `/webinars/*`.

**Gamification (2)** `badges`, `user_badges`. Points are awarded by
`award_points_on_publish()` at 50 for research, 30 for policy briefs, 10 for
everything else. With only two formats the scale collapses to one value, which
makes the whole mechanism decorative. Recommend delete. Decision needed if you
want to keep a points display.

#### DECIDE (8)

Not legacy domains, but not obviously in scope either.

| Tables | Question |
|---|---|
| `conversations`, `conversation_participants`, `messages` | Direct messaging. Not a publishing format. Recommend DELETE for v2 and re-add later if readers ask for it. |
| `author_subscriptions`, `author_subscription_events`, `topic_subscriptions`, `publication_events`, `publication_deliveries` | Email delivery of new publications to subscribers. Publishing native in principle, but the whole feature sits behind three env flags and its migrations were never applied (they are release gated in `supabase/pending/`). Recommend DELETE the pending SQL and rebuild a much smaller "notify my followers on publish" in v2. |
| `activation_events`, `ai_topic_suggestion_quotas` | Onboarding funnel measurement, and a Gemini daily quota. Recommend keep `activation_events`, delete the quota table with AI topic suggestions. |
| `private.cron_http_requests` | Keep only if any cron job survives (see 3.5). |

---

### 3.2 `posts`: the table to rebuild

Current shape, accumulated over 114 migrations:

```
id, author_id, slug, title, content, excerpt,
type              NOT NULL  CHECK (blog|essay|research|policy_brief)   <- legacy
content_kind      nullable  CHECK (post|article|research)              <- new model
article_format    nullable  CHECK (essay|policy_brief)                 <- genre
status            NOT NULL  CHECK (draft|pending|pending_revision|
                                   published|rejected|removed|withdrawn)
tags[], topic_keys[], word_count, cover_image_url,
citation_id, published_version_id, current_round, revision_due_at,     <- review only
document_path, document_original_name, document_mime_type,
document_size_bytes, pdf_url,                                          <- research only
audio_summary_url,
in_response_to, featured, view_count, impression_count, read_count,
like_count (dropped, re-added, locked, then replaced by a table),
hidden_at, hidden_by, created_at, updated_at, editorial_updated_at, published_at
```

Objects that exist only to reconcile `type` / `content_kind` / `article_format`:

1. `posts_content_kind_check`
2. `posts_article_format_check`
3. `posts_article_format_requires_article_check`
4. `posts_legacy_type_content_kind_check`
5. `posts_title_required_unless_post_check` (redefined twice, now calls a function)
6. `sync_post_content_classification()` plus the `posts_sync_content_classification` trigger
7. `effective_content_kind()` / `effective_article_format()` SQL helpers
8. `resolveContentKind()` / `resolveArticleFormat()` / `legacyTypeForNewContent()` /
   `isLegacyPolicyBriefInFlight()` in `lib/contentModel.ts` (325 lines, 1,926 lines of tests)

`docs/content-model.md` calls the removal of all eight "Phase 4B" and lists six
exit criteria for it. This reset satisfies all six by fiat, because every
criterion is about legacy research and policy brief rows that are now being
deleted outright.

---

### 3.3 Functions and RPCs (181)

| Domain | Count | Verdict |
|---|---|---|
| Debate (V1, V1.5, V2) | 49 | DELETE |
| Review / editorial / citation / versioning / badges / points | 13 | DELETE |
| Research and collaboration | 12 | DELETE |
| Opportunity / fellowship / talent / ambassador / campus / cohort | 12 | DELETE |
| Content classification (`effective_content_kind`, `sync_post_content_classification`, ...) | 4 | DELETE, replaced by one column |
| Subscriptions and publication delivery | ~10 | DELETE (never applied) |
| Onboarding (`save_onboarding_*`, `complete_onboarding`, `get_my_onboarding_state`) | 6 | REBUILD, much smaller |
| Profile privacy and security (`get_my_profile_private`, `can_view_profile`, `protect_profile_privileged_columns`, `is_admin`, `is_suspended`, `is_blocked_pair`) | ~10 | KEEP |
| Counters (`increment`/`decrement_post_like_count`, bookmark, reference, `count_visible_comments_by_post`) | ~8 | KEEP |
| Engagement and ranking (`record_post_engagement`, `get_reader_affinity`, `get_viewer_post_engagement`) | 3 | KEEP |
| Publishing core (`record_post_revision`, `apply_post_edit_draft`, `post_revision_retention`, `count_post_words`, `posts_set_word_count`, `normalize_topic_key`, `derive_post_topic_keys`, `sync_post_topic_keys`) | 8 | MERGE into a smaller publishing API |
| Post locking (`guard_locked_post_write`, `guard_locked_post_child_write`, `is_post_editable`, `is_post_owner`, `is_post_coauthor`, `is_post_reviewer`, `withdraw_post_submission`) | 7 | REBUILD. All seven encode review state rules. v2 needs only "author owns it and it is not removed". |
| Cron plumbing (`private.*`) | 6 | KEEP if any job survives |
| Misc (`handle_new_user`, `generate_citation_id`, `find_or_create_conversation`, `promote_alumni`, ...) | rest | mixed, mostly DELETE |

Special call out: `20260718000003_debate_v2_lifecycle_permissions.sql` issues
`CREATE OR REPLACE FUNCTION` for six live V1 debate RPCs, and `20260721000003`
redefines nine functions first created in earlier migrations.
`docs/debate-deployment-state.md` states plainly that it is unknown which of
these ran. Deleting the Debate domain resolves this rather than requiring the
production probes that document asks for.

---

### 3.4 Triggers (58 distinct)

**KEEP (12)** `on_auth_user_created`, `posts_touch_updated_at`,
`posts_word_count_trg`, `posts_seed_aggregate_counts`, `posts_sync_topic_keys`,
`on_like_insert_count`, `on_like_delete_count`, `bookmarks_increment_count`,
`bookmarks_decrement_count`, `post_references_sync_count`,
`profiles_protect_privileged_columns` plus its `_on_insert` twin.

**KEEP, retune (5)** the notification triggers `on_comment_insert`,
`on_follow_insert`, `on_like_insert`, `on_new_follower`, `on_post_commented`.
Consolidate: there are near duplicate pairs from different migration eras
(`notify_on_comment`/`notify_post_commented`, `notify_on_like`/`notify_post_liked`,
`notify_on_follow`/`notify_new_follower`).

**DELETE (~25)** every `debate_*` trigger (10), `research_project*` and
`researcher_profiles` guards (5), `guard_post_review_submission`,
`guard_locked_post_*` (3), `on_post_approved`, `on_review_submitted_points`,
`on_post_published_badges`, `posts_capture_first_publication_event`,
`profiles_assign_selected_campus_cohort`, `campus_cohort_backfill_memberships`,
`fellowships_touch_updated_at`, `talent_inquiries_touch_updated_at`,
`user_blocks_remove_author_subscriptions`,
`author_subscriptions_capture_ux_event`, `messages_*` (2).

**DELETE (1, important)** `posts_sync_content_classification`. This is the
trigger that keeps `type` and `content_kind` agreeing. It goes with `type`.

**REBUILD (4)** the points triggers `on_post_published_points`,
`on_comment_points`, `on_like_points`, `on_like_delete_points`. Only if points
survive the decision in 3.1.

---

### 3.5 RLS, storage, cron

**RLS.** 299 `CREATE POLICY` statements, 190 distinct names, layered across 114
migrations. `public.posts` alone has been the target of 46 policy statements.
Because policies were dropped and recreated repeatedly, the live policy set
cannot be reliably derived from the files. This is the strongest argument for a
squashed baseline (see 6.2 Step 5): v2 should declare its policy set once, in
one file, rather than inherit an unknown accumulation. Expect ~20 policies total
in v2 against the current ~100 live ones.

**Storage buckets (5).**

| Bucket | Public | Verdict |
|---|---|---|
| `post-images` | yes | KEEP. Path convention `posts/<uid>/` and `covers/<uid>/` enforced in the INSERT policy. |
| `avatars` | yes | KEEP. |
| `audio-summaries` | yes | DECIDE. Backs `/api/audio-summary` (Claude plus Google TTS). Not a publishing format, but it is a reading feature on articles. Recommend keep. |
| `research-documents` | no | DELETE, with the four `posts.document_*` columns. |
| `research-project-assets` | no | DELETE (50MB limit, wide MIME allowlist). |

**Scheduled jobs.** Since `20260827110918`, scheduling lives in Supabase pg_cron,
not `vercel.json` (which does not exist). Eight jobs dispatch through
`private.dispatch_indegenius_cron()` to HTTP routes, authenticated by a Vault
secret.

| Job | Route | Verdict |
|---|---|---|
| `indegenius-daily-brief` 08:00 | `/api/cron/daily-brief` | DECIDE. Reader digest email, publishing adjacent. |
| `indegenius-review-reminders` 09:00 | `/api/cron/review-reminders` | DELETE |
| `indegenius-debate-v2-advance` */5 | `/api/cron/advance-debate-rounds` | DELETE |
| `indegenius-debate-v2-notifications` | `/api/cron/process-debate-notifications` | DELETE |
| `indegenius-publication-recovery` | `/api/cron/process-publication-deliveries` | DELETE (feature never applied) |
| `indegenius-debate-v15-deadlines` | `/api/cron/debate-v15-deadlines` | DELETE |
| `indegenius-cron-http-reconcile` | internal | KEEP if any job survives |
| `indegenius-cron-history-prune` | internal | KEEP if any job survives |

**Edge Functions.** None. There is no `supabase/functions/` directory. All
server logic runs as Next.js server actions and route handlers on Vercel. Keep
it that way: Fluid Compute is the right default here, and nothing in this
product needs the edge runtime.

---

### 3.6 `profiles`: columns to strip

`profiles` is the second most accreted table. Delete with their domains:
`is_alumni`, `graduation_year`, `open_to_mentoring`, `university`
(campus/alumni), the `verified_type` values `researcher`/`faculty`/`institution`,
`profile_type` / `secondary_profile_types` / `organization_name` /
`organization_website` / `professional_title` (persona onboarding),
`positioning_statement` (unapplied migration), `interests` (feed personalization
now comes from `get_reader_affinity`), `points` (if badges go), `signup_email`,
and the campus cohort assignment columns.

Keep: `id`, `username`, `full_name`, `bio`, `avatar_url`, `cover_image_url`,
`country`, `role`, `verified`, `privacy_settings`, `notification_prefs`,
`suspended_at`, `suspended_reason`, `onboarding_completed*`, and the push
cooldown columns.

---

## 4. Application layer

### 4.1 The publication logic problem, in detail

This is the part worth reading twice. There are currently four ways a post gets
written, and they disagree.

```
                     |- ensureContributionDraft --> posts(status=draft)     [LIVE]
  UniversalComposer -|  publishContribution     --> posts(status=published) [LIVE]
   (/write)          |
                     |- savePublishedEditDraft  --> post_edit_drafts        [LIVE]
                        applyPublishedEditDraft --> RPC apply_post_edit_draft

  EditForm           --- saveEditedPost         --> posts (direct UPDATE)   [LIVE]
   (/edit/[slug])

  (no callers)       --- ensureDraft            --> posts                   [DEAD]
                        publishPost             --> posts                   [DEAD]
                        savePostReferences      --> post_references         [DEAD]
```

Concrete inconsistencies:

- **Classification.** `derivePresentationClassification()` in
  `lib/contribution.ts` writes `{title, type:'essay', content_kind:'article'}` or
  `{title:null, type:'blog', content_kind:'post'}`. The `apply_post_edit_draft()`
  RPC re-derives the same thing in SQL, with its own
  `CASE WHEN normalized_title IS NULL`. `saveEditedPost()` deliberately does
  neither and preserves whatever was there. Three implementations of one rule,
  two of which can disagree with the third on the same row.
- **Where the rule lives.** One copy in TypeScript, one in a `SECURITY DEFINER`
  function, one absent. Changing the rule requires a migration and a deploy, in
  the right order.
- **Reference handling.** `syncReferences()` in the server action does a
  delete-and-reinsert style sync. `apply_post_edit_draft()` does a careful three
  way diff (delete removed, update kept, insert new) precisely because
  reinserting would break inline citation anchors. The server action path has
  the bug the RPC documents avoiding.
- **Dead weight.** `publishPost()` still contains the entire editorial
  submission branch: review track lookup, version snapshotting, editor
  notification, `pending` status. None of it is reachable.
- **Two content models for microblogs.** `lib/shortPostContent.ts` defines a
  2,000 character plain text microblog with its own excerpt derivation and HTML
  builder. `UniversalComposer` ignores it entirely and sends Tiptap HTML for
  both formats. So there are two definitions of what a microblog body is, and
  the more principled one is dead.

### 4.2 Server actions (46 files)

**KEEP (10)** `post/[slug]/likeActions.ts`, `bookmarkActions.ts`,
`commentActions.ts`, `components/ui/followActions.ts`,
`components/moderation/reportActions.ts`, `blockActions.ts`,
`notifications/actions.ts`, `settings/pushActions.ts`,
`(auth)/accountEmailActions.ts`, `admin/moderation/actions.ts`.

**MERGE (5 into 1)** `write/actions.ts`, `write/editActions.ts`,
`write/revisionActions.ts`, `write/shareActions.ts`, `edit/[slug]/actions.ts`
collapse into one publishing action module (see 5.3).

**REBUILD (3)** `[username]/actions.ts`, `settings/profile/actions.ts`,
`components/topic/topicActions.ts` (strip deleted domain fields).

**DELETE (27)** all `debates/*` (6), `admin/{ambassadors,campuses,fellowships,
partners,sponsors,research,review,verification,digest,analytics}` (10),
`ambassadors/*` (2), `research/actions.ts`, `submit/research/actions.ts`,
`review/actions.ts`, `policy/actions.ts`, `messages/[id]/actions.ts`,
`settings/profile/outcomeActions.ts`, both `opportunityInquiryActions.ts`.

### 4.3 `lib/` modules

**KEEP (~35)** `supabase/{browser,server,admin}.ts`, `feedData.ts`,
`feedRanking.ts`, `feedExposure.ts`, `readerSignals.ts`, `postCounts.ts`,
`postEngagementServer.ts`, `postEngagementToken.ts`, `postDisplay.ts`,
`postSlug.ts`, `postReferences.ts`, `citationResolution.ts`,
`sanitizePostHtml.ts`, `articleTypography.ts`, `commentContent.ts`,
`commentThread.ts`, `commentSort.ts`, `tags.ts`, `roles.ts`, `adminAccess.ts`,
`blocking.ts`, `suspension.ts`, `email.ts`, `emailSenders.ts`, `push.ts`,
`pushClient.ts`, the five `notification*.ts`, `profileIdentity.ts`,
`profileUsername.ts`, `profilePrivate.ts`, `profilePrivilegeGuard.ts`,
`utils.ts`, `utils-date.ts`, `cronAuth.ts`, `site.ts`, `brand.ts`.

**REBUILD (6)** `contentModel.ts` (325 lines down to ~30), `types.ts` (drop 8 of
14 interfaces), the `PostType`/`POST_POINTS`/`MIN_WORD_COUNTS`/`POST_TYPE_LABELS`
block in `utils.ts`, `featureFlags.ts` (delete the whole file: after the reset
there is nothing left to flag), `contribution.ts` (fold classification into the
new model), `postQuality.ts` (460 lines, mostly review gating).

**DELETE (~90)** every `debate*` (14 modules plus 14 test files), every
`research*` (4), `opportunit*` (4), `talentDiscovery`, `campus*` (3),
`academicIdentity`, `universityDomains`, `intellectualRecord`,
`credibilityGraph*` (3), `demonstratedExpertise`, `profileCredibility`,
`profileRecord*` (4), `profileCommandCenter*` (3), `editorialTrust`,
`reviewWorkflow`, `applicationReview`, `collaboration`, `citationId`,
`dailyBrief` (decide), `publicationDelivery`, `publicationDistribution`,
`geminiDebateRecap`, `geminiTopicSuggestions`, `topicSuggestions`, `messaging`,
`realtime`, `shortPostContent`, `shortPostHtml`, `contribution` (merged), plus
13 migration verification test files (`*Migration.test.ts`) that exist only to
assert facts about migrations being deleted.

### 4.4 Routes

| Keep | Delete |
|---|---|
| `/`, `/landing`, `/[username]`, `/post/[slug]`, `/write`, `/edit/[slug]`, `/draft/[token]`, `/r/p/[token]`, `/dashboard`, `/settings`, `/bookmarks`, `/notifications`, `/search`, `/topics/[tag]`, `/discover`, `/onboarding`, `/admin/moderation`, auth routes | `/debates/*` (683K, largest dir), `/research/*`, `/submit/research`, `/review/[postId]`, `/publication/[citationId]`, `/opportunities`, `/fellowships/*`, `/talent`, `/ambassadors/*`, `/partners`, `/campus`, `/alumni`, `/leaderboard`, `/messages/*`, `/subscriptions`, `/policy`, `/stats`, `/editorial-standards`, `/explore` (merge into `/discover`), `/create/post` (redirect shim), and 10 of 12 `/admin/*` sections |

API routes: keep `/api/feed`, `/api/og`, `/api/upload-image`,
`/api/posts/[slug]/{view,read,impression}`, `/api/notifications/[id]/read`,
`/api/activation`, `/api/cron/health`. Delete `/api/debate-recap`,
`/api/research-document/*`, `/api/research-project-assets/*`,
`/api/topic-suggestions`, `/api/universities`, and 5 of 6 cron routes. Decide on
`/api/audio-summary` and `/api/cron/daily-brief`.

---

## 5. Publishing Core v2

### 5.1 Principles

1. **One table, one classification column, one composer, one publish path.**
2. **The format is declared, not inferred.** Today it is derived from title
   presence in three places. In v2 the client sends `kind`, the column stores it,
   and nothing derives it. A microblog can then have a title if that ever becomes
   desirable, and an article without one is a validation error rather than a
   silent reclassification.
3. **Business rules live in one layer.** Publishing rules in TypeScript server
   actions. The database enforces only invariants that must hold no matter who
   writes: ownership, immutability of removed rows, counter integrity.
4. **Counters stay trigger maintained, never client writable.** The existing
   `post_like_counts` pattern is correct and should be the template.
5. **No feature flags.** Delete `lib/featureFlags.ts` entirely.

### 5.2 Schema

```sql
create type post_kind  as enum ('microblog', 'article');
create type post_state as enum ('draft', 'published', 'removed');

create table posts (
  id              uuid primary key default gen_random_uuid(),
  author_id       uuid not null references profiles(id) on delete cascade,
  kind            post_kind  not null,
  state           post_state not null default 'draft',

  title           text,                    -- required when kind = 'article'
  slug            text unique,             -- assigned at publish, never before
  body_html       text not null default '',
  excerpt         text,
  cover_image_url text,

  tags            text[] not null default '{}',
  topic_keys      text[] not null default '{}',   -- derived, trigger maintained
  word_count      integer not null default 0,     -- derived, trigger maintained

  in_response_to  uuid references posts(id) on delete set null,

  view_count       integer not null default 0,
  impression_count integer not null default 0,
  read_count       integer not null default 0,

  hidden_at    timestamptz,
  hidden_by    uuid references profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz,

  constraint posts_article_needs_title
    check (kind <> 'article' or (title is not null and btrim(title) <> '')),
  constraint posts_published_needs_slug
    check (state <> 'published' or (slug is not null and published_at is not null))
);
```

Gone from the current table: `type`, `content_kind`, `article_format`,
`citation_id`, `published_version_id`, `current_round`, `revision_due_at`,
`document_path`, `document_original_name`, `document_mime_type`,
`document_size_bytes`, `pdf_url`, `featured`, `editorial_updated_at`, and 5 of
the 7 statuses.

Supporting tables:

```
post_drafts       (post_id unique, author_id, title, body_html, excerpt,
                   tags[], cover_image_url, reference_snapshot jsonb, updated_at)
                   -- one table for both "new draft" and "edit published"
post_revisions    (unchanged: throttled snapshots, pruned to 40)
post_share_tokens (renamed post_draft_shares, unchanged semantics)
post_references   (unchanged; article citation anchors)
post_reference_counts / post_like_counts / post_bookmark_counts  (unchanged)
likes / bookmarks / comments / comment_votes / follows            (unchanged)
post_engagement_events                                            (unchanged)
notifications     (type check narrowed to: like, comment, follow,
                   response_post, moderation_post_removed,
                   moderation_comment_hidden, account_suspended)
```

Indexes to add. The feed currently relies on partial indexes added piecemeal
across four migrations: `posts(state, published_at desc, id desc)`,
`posts(author_id, state, published_at desc)`,
`posts(kind, state, published_at desc)`, and a GIN index on `topic_keys`.

### 5.3 The publishing API (one module)

`lib/publishing/` replaces five action files and eight RPCs:

```
saveDraft({ postId?, kind, snapshot })   -> { postId }
publish({ postId })                       -> { slug }
saveEdit({ postId, snapshot })            -> stages into post_drafts
applyEdit({ postId })                     -> atomic, RPC backed
unpublish({ postId })                     -> back to draft
remove({ postId })                        -> state = 'removed'
createShareToken / revokeShareToken({ postId })
listRevisions / restoreRevision({ postId, revisionId })
```

Exactly one function decides classification, and it is a validator rather than
an inferrer:

```ts
// lib/publishing/validate.ts
export function validate(kind: PostKind, snapshot: Snapshot): string | null {
  if (kind === "article" && !snapshot.title.trim())
    return "An article needs a title.";
  if (kind === "microblog" && plainText(snapshot.body).length > MICROBLOG_MAX)
    return `Keep a microblog under ${MICROBLOG_MAX} characters.`;
  if (!plainText(snapshot.body)) return "Write something before publishing.";
  return null;
}
```

Only `applyEdit` stays a `SECURITY DEFINER` RPC, because the reference diff and
the post update must be one transaction. Every other operation is a plain server
action under RLS.

### 5.4 RLS, restated in full

Roughly 20 policies, declared once:

```
posts          select: state='published' and hidden_at is null
                       or author_id = auth.uid()
                       or is_admin()
               insert/update/delete: author_id = auth.uid() and state <> 'removed'
               update (moderation): is_admin()
post_drafts    all: author_id = auth.uid()
post_revisions select: owner of the post; insert: RPC only
post_references select: parent post is visible; write: post author
*_counts       select: everyone; write: nobody (trigger only, SECURITY DEFINER)
likes/bookmarks select: everyone; write: user_id = auth.uid()
comments       select: not hidden, or author, or admin; write: own
notifications  select/update: user_id = auth.uid(); insert: service_role only
profiles       select: public projection via can_view_profile(); write: own
               privileged columns guarded by the existing trigger
```

---

## 6. Migration strategy

### 6.1 Do not try to reverse 114 migrations

They are not reversible, several redefine each other, and
`docs/debate-deployment-state.md` records that the live state of five of them is
unknown. Forward only, in ordered pieces.

### 6.2 Sequence

**Step 0, before any SQL: snapshot production.**
Full `pg_dump` to cold storage, plus a CSV export of `posts`, `profiles`,
`comments`, `likes`, `follows`, `post_references`. This reset is destructive by
design and there is no rollback.

**Step 1: application code first, database untouched.**
Delete routes, components, server actions and `lib/` modules for the removed
domains. The app must build and the remaining tests must pass while the old
schema is still fully present. Nothing here can break production data, and it
shrinks the blast radius of everything after.

**Step 2: `20260902000001_publishing_core_v2_teardown.sql`.**
One migration, in dependency order:

```
1. cron.unschedule() the 5 dead jobs
2. drop the ~25 dead triggers
3. drop the ~100 dead functions (cascade where safe)
4. drop the 54 dead tables, children first:
   debates -> research -> campus -> opportunities -> editorial -> dead-already
5. delete the storage buckets research-documents and research-project-assets
   (objects first, then the bucket row)
6. drop the ~180 dead policies
```

**Step 3: `20260902000002_publishing_core_v2_posts.sql`.**
The `posts` rebuild, the only step with real data risk:

```
1. create the two enums
2. add kind, state as nullable
3. backfill:
     kind  = case when effective_content_kind(type, content_kind) = 'post'
                  then 'microblog' else 'article' end
     state = case status when 'published' then 'published'
                         when 'removed'   then 'removed'
                         else 'draft' end
4. delete rows where effective_content_kind(...) = 'research'
     (or migrate them to articles first, if any are worth keeping)
5. backfill title for any article-kind row that lacks one
6. set kind, state NOT NULL; add the two check constraints
7. drop status, type, content_kind, article_format and all 5 legacy
   constraints; drop sync_post_content_classification and its trigger;
   drop effective_content_kind / effective_article_format
8. drop the 12 review and research columns
9. create the 4 new indexes; drop the ~8 superseded partial indexes
10. rewrite the notifications type check
```

Run steps 3 and 4 as a `SELECT` first and read the counts before committing.
Step 4 is the irreversible one.

**Step 4: `20260902000003_publishing_core_v2_policies.sql`.**
`DROP POLICY IF EXISTS` for every name this audit found on surviving tables,
then create the ~20 policies from 5.4. This is what converts an unknown
inherited policy set into a declared one.

**Step 5: squash the baseline.**
Replace `supabase/schema.sql`, `schema_phase2-5.sql` and all 114 migration files
with a single `supabase/schema.sql` generated by `pg_dump --schema-only` from
the migrated database, and start a fresh migration timeline. Delete
`supabase/pending/` entirely: all five candidates belong to deleted domains or
to subscriptions being dropped.

**Step 6: rebuild the publishing core.**
`lib/publishing/`, the merged composer path, the one validator. This is the only
step that adds code.

### 6.3 Ordering constraints

- Step 1 before Step 2, or the app 500s on tables that vanished.
- Step 2 before Step 3: `guard_locked_post_write` and friends reference
  `posts.status` and `posts.type`, so they must be dropped before the columns.
- Step 3 before Step 4: several current policies reference `posts.status`.
- Step 5 after everything, and only after a verified staging run.
- Keep Step 6 on a separate branch. Do not mix teardown with new architecture in
  one reviewable change.

### 6.4 Decisions needed before Step 2

1. **Direct messaging.** Delete or keep? (Recommend delete.)
2. **Points and badges.** Delete, or keep a single flat value per publication?
   (Recommend delete.)
3. **Co-authorship** (`post_authors`). Rebuild as a simple collaborator list, or
   drop for v2?
4. **Author subscriptions and publication delivery.** Recommend deleting the
   pending SQL outright and rebuilding "notify my followers on publish" as a
   trigger, since none of it was ever applied.
5. **Audio summaries** (`/api/audio-summary`, the `audio-summaries` bucket,
   `ANTHROPIC_API_KEY`, `GOOGLE_TTS_API_KEY`). A reading feature on articles.
   Keep?
6. **Daily brief email** and its cron job. Keep?
7. **Research rows in production.** Delete outright, or convert to articles with
   the PDF link preserved before dropping the document columns?
8. **Responses** (`in_response_to`). Publishing native and cheap to keep, but it
   is a third content relationship. Confirm it stays.

### 6.5 What "done" looks like

| | Before | After |
|---|---|---|
| Tables | 89 | ~22 |
| Functions | 181 | ~35 |
| Triggers | 58 | ~16 |
| Policies | ~100 live, unknowable | ~20, declared in one file |
| Migration files | 114 plus 5 pending | 1 baseline |
| Publish paths | 4 (1 dead, 3 live and inconsistent) | 1 |
| Classification columns | 3 plus 6 sync objects | 1 enum |
| Cron jobs | 8 | 0 to 3 |
| `lib/` modules | ~200 | ~45 |
