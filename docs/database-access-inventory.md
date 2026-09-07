# Database access inventory

Everything in this repository that talks to the database, classified for the
move from Supabase PostgREST to a direct PostgreSQL data layer.

Written as the Phase 1 audit and updated after Phase 2. Production is on
Vercel + Supabase and stays there.

**Phase 2 changed §3.** Direct browser database writes are now zero: all
twenty table writes and all five write-RPCs moved behind server actions and one
route handler, each with explicit authorization in front of the statement. The
before-and-after is in §3, and the boundary is enforced by
[lib/browserWriteBoundary.test.ts](../lib/browserWriteBoundary.test.ts) rather
than by a note in a document.

Everything else here still describes the Phase 1 state.

Companion documents:

- [neon-migration-plan.md](neon-migration-plan.md) - driver choice, `lib/db`,
  Neon and Hyperdrive, environment variables.
- [auth-and-rls-migration.md](auth-and-rls-migration.md) - `auth.users`, RLS,
  and where authorization has to move to.
- [post-page-query-path.md](post-page-query-path.md) §8 - the article fan-out,
  query by query.
- [rpc-identity-migration.md](rpc-identity-migration.md) - the 22 `auth.uid()`
  RPCs, and which six are parameterised.
- [pending-migration-decisions.md](pending-migration-decisions.md) - the five
  unapplied release candidates, and why none of them reaches Neon.

---

## 1. How this was produced, and what it is worth

Three scripts under [scripts/audit/](../scripts/audit/) walk the repository and
the SQL, and write JSON next to themselves:

| Script | Output | Covers |
|---|---|---|
| `dbAudit.mjs` | `db-audit.json` | Every `.from()`, `.rpc()`, `.auth.*` and `.storage` call site |
| `rlsAudit.mjs` | `rls-audit.json` | Every `CREATE POLICY`, with the drops and dropped tables applied in order |
| `fnAudit.mjs` | `fn-audit.json` | Every `CREATE FUNCTION`, with the traits that decide portability |

```bash
node scripts/audit/dbAudit.mjs
node scripts/audit/rlsAudit.mjs
node scripts/audit/fnAudit.mjs
node scripts/audit/report.mjs browser   # or: loc, writes, service, summary
```

They are static analysis over source text, which makes them a floor and not a
ceiling. Two limits worth stating plainly:

- **A table name held in a variable is invisible.** Every `.from()` in this
  repository names its table as a literal, which is why the technique works at
  all, but `admin.storage.from(BUCKET)` in
  [app/api/research-project-assets/upload/route.ts](../app/api/research-project-assets/upload/route.ts)
  proves the exception exists. Storage sites are therefore recorded with an
  unresolved target rather than dropped.
- **The SQL files are the migration history, not the database.** They are
  cumulative and idempotent, so the scripts replay them in order and keep the
  last definition. That reconstruction is good enough to plan against and is
  not good enough to migrate against. Before any schema is copied, the
  authoritative lists must come from the live database:

```sql
select schemaname, tablename, policyname, cmd, roles, qual, with_check
  from pg_policies where schemaname not in ('pg_catalog','information_schema');
select n.nspname, p.proname, p.prosecdef, pg_get_functiondef(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public','private');
select extname, extversion from pg_extension;
```

---

## 2. Totals

**927 database call sites in 185 files**, outside tests.

### By execution location

| Location | Sites | Files | Tables | RPC | Auth | Storage |
|---|---:|---:|---:|---:|---:|---:|
| Server component | 282 | 58 | 236 | 10 | 36 | 0 |
| Server action | 262 | 38 | 208 | 13 | 41 | 0 |
| `lib/` (called from server contexts) | 218 | 34 | 190 | 21 | 7 | 0 |
| **Browser** | **65** | **36** | **38** | **10** | **12** | **5** |
| Route handler | 47 | 11 | 29 | 0 | 9 | 9 |
| `generateMetadata` (+ its route) | 28 | 3 | 26 | 0 | 2 | 0 |
| Cron | 22 | 3 | 21 | 1 | 0 | 0 |
| Middleware ([proxy.ts](../proxy.ts)) | 2 | 1 | 1 | 0 | 1 | 0 |
| Webhook | 1 | 1 | 0 | 1 | 0 | 0 |

`server-component+metadata` is a file-level label: a route that exports
`generateMetadata` gets it for all of its call sites, because a regex cannot
tell which function a line sits in. All 28 are in the three post/profile
routes.

### By operation

| Operation | Sites |
|---|---:|
| SELECT | 566 |
| RPC | 56 |
| UPDATE | 87 |
| INSERT | 54 |
| UPSERT | 21 |
| DELETE | 21 |
| Auth | 108 |
| Storage | 14 (a floor; see §1) |

**183 write sites**, of which **20 are in the browser**. That number is the
whole of §3.

### By client

| Client | Sites | Notes |
|---|---:|---|
| `lib/supabase/server.ts` (anon key + user cookie, RLS enforced) | most of the server total | 8s fail-fast deadline on REST and Auth |
| `lib/supabase/admin.ts` (`SUPABASE_SERVICE_ROLE_KEY`, RLS bypassed) | 114 sites in 22 files | No deadline, deliberately |
| `lib/supabase/client.ts` (browser, anon key, RLS enforced) | 65 sites in 36 files | §3 |

Note for readers of [CLAUDE.md](../CLAUDE.md): the browser client is
`lib/supabase/client.ts`, not `lib/supabase/browser.ts`.

---

## 3. Browser-side database access

**This is the section that gates everything else**, and Phase 2 closed the
half of it that matters.

Neon must never be reachable from browser code. In Phase 1, 26 client
components held a Supabase client and spoke to PostgREST directly, with RLS as
the only thing between a reader and the table. There is no equivalent of that
arrangement in the target stack: a Worker holding a PostgreSQL connection
cannot hand it to a browser, and it must not try.

Every write has become:

```
browser  →  Server Action or Route Handler  →  explicit authorization  →  database
```

### Before and after

| | Phase 1 | After Phase 2 |
|---|---:|---:|
| Client components touching tables or RPCs | 26 | **15** |
| Table + RPC call sites | 48 | **22** |
| **Table writes** | **20** | **0** |
| **Write RPCs** | **5** | **0** |
| Reads | 18 | 18 |
| Read-only RPCs | 4 | 4 |
| Auth calls (move with Better Auth) | 12 | 12 |
| Storage calls (move with R2) | 5 | 5 |

Zero is enforced, not asserted:
[lib/browserWriteBoundary.test.ts](../lib/browserWriteBoundary.test.ts) scans
every `"use client"` file for a PostgREST mutation, holds an exhaustive
allowlist of the four remaining browser RPCs (all reads), and fails if a client
component imports a `server-only` module. A regression there is not a style
problem: it is a write that still works today through RLS and silently becomes
unauthorized the day the adapter changes.

### Where each write went

| Was | Now | Authorization |
|---|---|---|
| `DELETE posts` ×2 (PostsTable, MyDrafts) | [deleteActions.ts](<../app/(write)/write/deleteActions.ts>) → [lib/postDeletion.ts](../lib/postDeletion.ts) | Signed in; post exists; viewer is the author; status is `draft`; predicates repeated in the statement; deleted row ids checked |
| `UPDATE profiles` ×9 (6 components) | [profileActions.ts](<../app/(main)/settings/profileActions.ts>) → [lib/profileMutations.ts](../lib/profileMutations.ts) | Signed in; row is the viewer's own; column allowlist mirroring the database's own default-deny trigger; row count checked |
| `UPDATE conversation_participants`, `UPDATE messages` ×2 | [messages/[id]/actions.ts](<../app/(main)/messages/[id]/actions.ts>) | Signed in; viewer is a participant; viewer is the sender; not already deleted; row count checked |
| `INSERT contact_requests` | [/api/partner-contact](../app/api/partner-contact/route.ts) | Unauthenticated by design: validation, normalization, and three rate limits |
| `INSERT fellowship_applications` | [applyActions.ts](<../app/(main)/fellowships/[id]/applyActions.ts>) | Signed in; opportunity exists and is open; 200-word minimum; attached work is the applicant's own |
| `UPSERT talent_profiles` | [opportunityActions.ts](../components/opportunities/opportunityActions.ts) | Signed in; row keyed on the session; URL scheme allowlist |
| `DELETE`/`UPSERT saved_opportunities` ×2 | [opportunityActions.ts](../components/opportunities/opportunityActions.ts) | Signed in; row keyed on the session; opportunity exists |
| `save_onboarding_path`, `save_onboarding_identity`, `save_onboarding_topics`, `complete_onboarding` | [onboarding/actions.ts](<../app/(onboarding)/onboarding/actions.ts>) | Signed in; input bounded before the RPC decides |
| `toggle_comment_vote` | [commentActions.ts](<../app/(main)/post/[slug]/commentActions.ts>) | Signed in; the RPC still owns the counter |

No action anywhere takes a user id, profile id or owner id as an argument.
That property is asserted directly, against the exported signatures, in
[lib/profileMutations.test.ts](../lib/profileMutations.test.ts).

### The Phase 1 write inventory, for the record

Kept because it names what each write was relying on, which is the thing that
had to be reproduced in application code.

<details>
<summary>The 20 browser writes as they were</summary>

#### Browser writes (20 sites) - highest risk

| File | Operation | Table | What RLS is enforcing today |
|---|---|---|---|
| [app/(main)/dashboard/PostsTable.tsx:277](<../app/(main)/dashboard/PostsTable.tsx#L277>) | DELETE | `posts` | `auth.uid() = author_id` |
| [app/(write)/write/MyDrafts.tsx:94](<../app/(write)/write/MyDrafts.tsx#L94>) | DELETE | `posts` | `auth.uid() = author_id` |
| [app/(main)/settings/ProfileForm.tsx](<../app/(main)/settings/ProfileForm.tsx>) (×4: 224, 239, 254, 305) | UPDATE | `profiles` | `auth.uid() = id` |
| [app/(main)/settings/PrivacyForm.tsx:31](<../app/(main)/settings/PrivacyForm.tsx#L31>) | UPDATE | `profiles` | `auth.uid() = id` |
| [app/(main)/settings/NotificationsForm.tsx:181](<../app/(main)/settings/NotificationsForm.tsx#L181>) | UPDATE | `profiles` | `auth.uid() = id` |
| [app/(main)/settings/profile/sections/IdentitySection.tsx:63](<../app/(main)/settings/profile/sections/IdentitySection.tsx#L63>) | UPDATE | `profiles` | `auth.uid() = id` |
| [app/(main)/explore/ExploreTopicsGrid.tsx:49](<../app/(main)/explore/ExploreTopicsGrid.tsx#L49>) | UPDATE | `profiles` | `auth.uid() = id` |
| [app/(main)/topics/TopicsClient.tsx:54](<../app/(main)/topics/TopicsClient.tsx#L54>) | UPDATE | `profiles` | `auth.uid() = id` |
| [components/ui/ProfileGate.tsx:110](../components/ui/ProfileGate.tsx#L110) | UPDATE | `profiles` | `auth.uid() = id` |
| [app/(main)/messages/[id]/MessageThread.tsx](<../app/(main)/messages/[id]/MessageThread.tsx>) (157, 301, 317) | UPDATE | `conversation_participants`, `messages` | conversation membership |
| [app/(main)/fellowships/[id]/FellowshipApply.tsx:82](<../app/(main)/fellowships/[id]/FellowshipApply.tsx#L82>) | INSERT | `fellowship_applications` | `auth.uid() = user_id` |
| [app/(main)/partners/PartnerContactForm.tsx:23](<../app/(main)/partners/PartnerContactForm.tsx#L23>) | INSERT | `contact_requests` | **nothing: `with check (true)`** |
| [components/opportunities/OpportunityProfileEditor.tsx:80](../components/opportunities/OpportunityProfileEditor.tsx#L80) | UPSERT | `talent_profiles` | `auth.uid() = user_id` |
| [components/opportunities/SaveOpportunityButton.tsx](../components/opportunities/SaveOpportunityButton.tsx) (35, 47) | DELETE / UPSERT | `saved_opportunities` | `auth.uid() = user_id` |

`contact_requests` is the one that needs attention beyond a mechanical port: it
is an unauthenticated public insert with no rate limit other than what
PostgREST happens to impose. Moving it behind a route handler is an
improvement, not a regression, but the route has to add the throttle that
nothing currently provides.

</details>

### Browser reads (18 sites) - still browser-side, classified

These were deliberately not migrated. The brief for Phase 2 was writes first,
and turning all 48 call sites into endpoints would have been a rewrite rather
than a migration.

| Read | Files | Class | Why |
|---|---|---|---|
| `posts` typeahead | [SearchOverlay](../components/ui/SearchOverlay.tsx), [TagInput](../components/ui/TagInput.tsx) | **migrate now (next)** | Public, cacheable, already endpoint-shaped. The cheapest three to move. |
| `posts`, `profiles`, `fellowships` search | [search/page.tsx](<../app/(main)/search/page.tsx>) | migrate now (next) | Four queries in one component; one route handler replaces all four |
| `profiles` username availability | [ProfileForm](<../app/(main)/settings/ProfileForm.tsx>), [ProfileGate](../components/ui/ProfileGate.tsx) | migrate later | Public read, but it is an existence check on a username. Wants rate limiting when it moves, so it is not a pure lift |
| `profiles` co-author lookup | [CoAuthorPicker](../components/collaboration/CoAuthorPicker.tsx) | migrate later | Public directory read |
| `posts` draft list | [MyDrafts](<../app/(write)/write/MyDrafts.tsx>), [ContinueDraftRow](<../app/(main)/ContinueDraftRow.tsx>) | migrate later | Owner-scoped by RLS. Safe today, needs an owner predicate when it moves |
| `post_revisions` | [RevisionHistory](<../app/(write)/write/RevisionHistory.tsx>) | migrate later | Owner-scoped by RLS |
| `bookmarks` | [bookmarks/page.tsx](<../app/(main)/bookmarks/page.tsx>) | migrate later | Owner-scoped by RLS |
| `messages`, `conversation_participants` | [MessageThread](<../app/(main)/messages/[id]/MessageThread.tsx>), [MessagesUnreadBadge](../components/ui/MessagesUnreadBadge.tsx) | **realtime-specific** | These sit alongside a `postgres_changes` subscription. Supabase Realtime has no successor in the target stack, so the read and the subscription move together or not at all |
| `profiles` onboarding state | [OnboardingClient](<../app/(onboarding)/onboarding/OnboardingClient.tsx>), [ResearchSubmissionForm](<../app/(main)/submit/research/ResearchSubmissionForm.tsx>) | safe temporarily | Owner-scoped; moves with the rest of onboarding |

Every one is a read of public data or of the viewer's own row, so none of them
can leak another member's data through a forged argument. That is why they are
second in the order, not because they can stay.

### The Phase 1 read notes

`posts` (5), `profiles` (3), `conversation_participants` (2), `messages` (1),
`bookmarks` (1), `fellowships` (1), `post_revisions` (1), plus
[app/(main)/search/page.tsx](<../app/(main)/search/page.tsx>) which runs four of
them for live search.

Two of these are already server-shaped and only need a route handler:
[components/ui/SearchOverlay.tsx](../components/ui/SearchOverlay.tsx) and
[components/ui/TagInput.tsx](../components/ui/TagInput.tsx) both query `posts`
for typeahead, which is a public read with an obvious cache.

### Browser RPCs: 10 before, 4 after

| RPC | Called from |
|---|---|
| `save_onboarding_path`, `save_onboarding_identity`, `save_onboarding_topics`, `complete_onboarding`, `get_my_onboarding_state`, `get_my_profile_private`, `get_public_profile_record_summary` | [app/(onboarding)/onboarding/OnboardingClient.tsx](<../app/(onboarding)/onboarding/OnboardingClient.tsx>) |
| `get_my_profile_private` | [components/ui/NotificationBell.tsx](../components/ui/NotificationBell.tsx) |
| `set_notification_preference` | [app/(main)/settings/NotificationsForm.tsx](<../app/(main)/settings/NotificationsForm.tsx>) |
| `toggle_comment_vote` | [app/(main)/post/[slug]/CommentThread.tsx](<../app/(main)/post/[slug]/CommentThread.tsx>) |

The six that write are gone. `save_onboarding_path`,
`save_onboarding_identity`, `save_onboarding_topics` and
`complete_onboarding` moved to
[app/(onboarding)/onboarding/actions.ts](<../app/(onboarding)/onboarding/actions.ts>);
`set_notification_preference` and `toggle_comment_vote` moved to
[profileActions.ts](<../app/(main)/settings/profileActions.ts>) and
[commentActions.ts](<../app/(main)/post/[slug]/commentActions.ts>).

**Four remain, and all four are reads**: `get_my_profile_private` (×2),
`get_my_onboarding_state`, `get_public_profile_record_summary`.

Every one of the ten is a `SECURITY DEFINER` function deriving the acting user
from `auth.uid()`, which returns null once Supabase Auth is gone. Six of the
22 such functions are now parameterised in SQL; see
[rpc-identity-migration.md](rpc-identity-migration.md) and
[auth-and-rls-migration.md](auth-and-rls-migration.md) §4.

### Browser Auth and Storage (17 sites)

Out of scope for the database migration and listed for completeness: 12 Auth
calls (login, signup, password reset, sign-out, `getUser`) move with Better
Auth; 5 Storage calls (avatar, cover image, editor image, research asset
upload) move with R2.

---

## 4. Tables and views

**68 distinct tables and views** are touched by application code. Full counts
are in `db-audit.json`; the shape of the problem:

| Rank | Table | Sites | Operations | Browser |
|---|---|---:|---|---:|
| 1 | `posts` | 161 | S/I/U/D | 8 |
| 2 | `profiles` | 111 | S/U | 16 |
| 3 | `post_authors` | 36 | S/I/U/D | 0 |
| 4 | `notifications` | 33 | S/I/U | 0 |
| 5 | `post_references` | 22 | S/I/U/D | 0 |
| 6 | `follows` | 21 | S/I/D | 0 |
| 7= | `post_reviews`, `comments` | 16 | S/U/D | 0 |
| 9 | `conversation_participants` | 15 | S/U | 3 |
| 10= | `talent_profiles`, `broadcasts` | 14 | S/U/I | 1 / 0 |

`posts` and `profiles` are 29% of all table access between them. They are also
the two tables with the most browser access. Any migration order that does not
start by taking the browser off those two tables is planning to do the risky
part last.

### Category A: application data, migrates to Neon

All 68 above, plus the tables that exist and are only written by triggers.
Grouped by domain, which is also a workable migration order:

| Domain | Tables |
|---|---|
| Identity | `profiles`, `user_onboarding_preferences`, `universities`, `user_activity_days`, `user_badges`, `badges` |
| Content | `posts`, `post_versions`, `post_authors`, `post_references`, `post_edit_drafts`, `post_draft_shares`, `post_revisions`, `citation_sequences` |
| Editorial | `post_reviews`, `post_editor_decisions`, `submission_tracks` |
| Engagement | `likes`, `bookmarks`, `comments`, `comment_votes`, `follows`, `post_like_counts`, `post_bookmark_counts`, `post_reference_counts`, `post_engagement_events` |
| Distribution | `notifications`, `push_subscriptions`, `author_subscriptions`*, `topic_subscriptions`*, `publication_events`*, `publication_deliveries`*, `author_subscription_events`* |
| Messaging | `conversations`, `conversation_participants`, `messages` |
| Trust and safety | `reports`, `user_blocks`, `admin_audit_events` |
| Opportunities | `fellowships`, `fellowship_applications`, `saved_opportunities`, `opportunity_outcomes`, `opportunity_outcome_events`, `talent_profiles`, `talent_inquiries` |
| Research | `research_projects`, `research_project_members`, `research_project_updates`, `research_project_events`, `research_project_assets`, `research_collaboration_requests`, `researcher_profiles`, `research_expansion_targets` |
| Campus | `campus_cohorts`, `campus_cohort_memberships`, `campus_programs`, `campus_ambassadors`, `campus_ambassador_activity`, `campus_editorial_prompts`, `campus_prompt_submissions` |
| Partnerships | `institutional_partners`, `sponsor_placements`, `policy_briefs_featured`, `contact_requests` |
| Email broadcasts | `broadcasts`, `broadcast_segments`, `broadcast_contacts`, `broadcast_delivery_events`, `broadcast_sync_runs`, `broadcast_sync_state` |
| Measurement | `activation_events`, `profile_featured_posts` |

\* Defined only in [supabase/pending/](../supabase/pending/) and gated by a
feature flag. They are not in the production database yet. See §7.

### Category B: provider-owned schemas, do not copy

`auth`, `storage`, `realtime`, `supabase_functions`, `vault`, `net`,
`extensions`, `graphql`, `pgbouncer`, `supabase_migrations`.

Two of these carry data the application depends on and cannot simply be left
behind:

- **`auth.users`** holds every member's identity and their email address. See
  [auth-and-rls-migration.md](auth-and-rls-migration.md) §1: the ids must
  survive, the schema must not be copied.
- **`storage.objects`** holds five buckets' worth of files. Storage moves to
  R2 in a later phase; the object *paths* stored in application columns
  (`posts.document_path`, `profiles.avatar_url`, `research_project_assets.storage_path`)
  are application data and travel with the tables.

`realtime` is already inert: `20260521000001_disable_realtime_for_launch_stability.sql`
removed the application's tables from the `supabase_realtime` publication, and
`NEXT_PUBLIC_ENABLE_REALTIME` gates what little client code remains.

### Category C: app-owned database infrastructure

Reconstructed from the migrations, so treat the counts as approximate until
they are read off the live database:

| Object | Count | Migrates? |
|---|---:|---|
| Functions (`public` + `private`) | 203 defined, 18 of them pending-only | Mostly yes; see §5 |
| `SECURITY DEFINER` functions | 165 | Yes, but the reason they exist changes |
| Triggers | ~59 | Yes, except the one on `auth.users` |
| Views | 8 (incl. `public_citation_edges`, `public_review_signals`, `public_opportunity_outcomes`, two telemetry delta views) | Yes |
| RLS policies | 146 live across 64 tables | See [auth-and-rls-migration.md](auth-and-rls-migration.md) §2 |
| Cron jobs | 7 | No: `pg_cron` + `pg_net` are Supabase-hosted. Rehost on Cloudflare Cron Triggers |
| Extensions | `uuid-ossp`, `pgcrypto`, `pg_stat_statements`, `pg_cron`, `pg_net` | First three yes; last two no |

### Category D: obsolete, verify before removing

| Object | Evidence | Verdict |
|---|---|---|
| `debate*` (17 tables) | Dropped by `20260906000004_remove_debate_schema.sql`; no code references | Already gone. Confirm they are absent in the live database before writing the Neon schema |
| `webinars`, `webinar_attendees`, `webinar_questions` | Created in `20260403000000_phase3_schema.sql`. **Zero** references in `app/`, `components/`, `lib/` | Strong obsolete candidate. Do not migrate without checking for rows first |
| `badges`, `user_badges` | 1 read site (`user_badges`), 0 for `badges` | Live but nearly unused. Migrate; do not build on |
| `EMAIL_FROM` | Read nowhere; [CLAUDE.md](../CLAUDE.md) says it is no longer read | Confirmed dead. Remove from the environment |

Nothing in this table has been removed. "Verify callers first" means verify
against the live database as well as against the code: an unused table can
still hold rows somebody wants.

---

## 5. RPC and function audit

**41 distinct RPCs are called from application code, at 56 call sites.** All 41
resolve to a definition in `supabase/`; 5 of them resolve only to
[supabase/pending/](../supabase/pending/) and are therefore feature-flagged off
in production.

| Trait | Count of the 203 defined functions |
|---|---:|
| `SECURITY DEFINER` | 165 |
| References `auth.uid()` | 105 |
| References `auth.role()` | 19 |
| References `auth.users` | 1 (`list_broadcast_contact_emails`) |
| Uses `pg_net` | 4 (all `private.*` cron dispatch) |
| Uses `cron.*` | 7 (all `private.*`) |
| Uses `vault.*` | 6 (`private.*` cron dispatch + one removed provisioner) |
| Uses an advisory lock | 1 (`claim_broadcast_for_campaign`) |

### The 41 called RPCs, by disposition

**Keep as a database function, portable as written** - no Supabase dependency,
and the reason they are functions is atomicity, which application code cannot
reproduce:

`generate_citation_id`, `record_post_engagement`, `record_post_revision`,
`is_blocked_pair`, `claim_broadcast_for_campaign`, `supersede_broadcast_drafts`,
`mark_broadcast_provider_sent`, `mirror_broadcast_unsubscribe`,
`claim_publication_events`, `claim_publication_event_for_post`,
`renew_publication_event_lease`, `renew_publication_delivery_lease`,
`get_campus_candidates`, `get_campus_cohort_metrics`,
`get_research_expansion_metrics`, `get_phase0_measurement_baseline`,
`get_public_credibility_summary`, `get_public_profile_record_summary`,
`get_public_profile_record_summary_v2`.

Several of these exist precisely because a multi-statement version was wrong in
production. `claim_broadcast_for_campaign` takes an advisory lock on a campaign
fingerprint and does the duplicate check *inside* the claim, because doing it
from the application let two identical broadcasts out two minutes apart. That
argument does not weaken when the database moves; it is the strongest reason in
the codebase to keep logic in SQL.

**Keep, but the identity source has to be rewritten** - `SECURITY DEFINER`
functions that call `auth.uid()` to decide who is acting:

`get_my_profile_private`, `get_my_onboarding_state`, `save_onboarding_path`,
`save_onboarding_identity`, `save_onboarding_topics`,
`save_onboarding_preferences`, `complete_onboarding`,
`set_notification_preference`, `toggle_comment_vote`,
`replace_my_featured_posts`, `replace_my_featured_posts_v2`,
`set_topic_subscription`, `submit_opportunity_outcome`,
`dispute_opportunity_outcome`, `set_opportunity_outcome_visibility`,
`withdraw_post_submission`, `apply_post_edit_draft`,
`create_research_collaboration_request`, `find_or_create_conversation`,
`record_user_activity_day`, `get_reader_affinity`,
`get_viewer_post_engagement`.

**22 of the 41.** Every one becomes an explicit `p_user_id uuid` parameter
supplied by the server after it has authenticated the caller. The rewrite is
mechanical; the danger is that the *un*rewritten version does not fail loudly.
`auth.uid()` on a database with no Supabase Auth returns null, so a function
that guards with `where user_id = auth.uid()` becomes a no-op that updates
nothing and reports success. Treat every one of these as a required change, not
an optional one, and see [auth-and-rls-migration.md](auth-and-rls-migration.md)
§4 for the pattern.

**Do not migrate** - Supabase-hosted infrastructure:

`private.dispatch_indegenius_cron`, `private.install_indegenius_cron_jobs`,
`private.remove_indegenius_cron_jobs`, `private.inspect_indegenius_cron_jobs`,
`private.prune_indegenius_cron_history`,
`private.reconcile_indegenius_cron_http_requests`. These are `pg_cron` +
`pg_net` + `vault`, none of which Neon offers. The seven scheduled jobs move to
Cloudflare Cron Triggers hitting the same `/api/cron/*` routes; the routes
themselves are unaffected.

`private.capture_db_telemetry` and its four snapshot tables are a judgement
call. They depend on `pg_stat_statements` (available on Neon) and on `pg_cron`
(not). Either rehost the schedule the same way as the other jobs, or drop the
telemetry: it was built to diagnose the Supabase outages and its purpose ends
with them.

---

## 6. Service-role usage

114 call sites in 22 files use `createAdminClient()` and bypass RLS entirely.
That number matters because after the migration it stops being exceptional: a
direct PostgreSQL connection is a service-role connection, permanently. The 22
files are where the application *already* does its own authorization, so they
are the best available model for what the other 163 files will have to grow.
[lib/adminAccess.ts](../lib/adminAccess.ts) and
[requireAdmin()](../lib/supabase/admin.ts) are the two existing gates.

---

## 7. Feature-flagged schema that is not in production

Five RPCs and seven tables live only in [supabase/pending/](../supabase/pending/):
author subscriptions, topic subscriptions, publication delivery, AI topic
suggestions, and the private profile projection contract. Their flags
(`NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED`, `NEXT_PUBLIC_TOPIC_SUBSCRIPTIONS_ENABLED`,
`NEXT_PUBLIC_AI_TOPIC_SUGGESTIONS_ENABLED`) are off.

For the Neon migration this is a decision, not a detail. Either apply them to
Supabase first and migrate one schema, or leave them out of the Neon schema
entirely and apply them afterwards. What must not happen is migrating a schema
that is half-applied on one side and fully applied on the other, because the
code paths behind those flags select columns that would then exist in one
database and not the other. The same trap is already documented in
[CLAUDE.md](../CLAUDE.md) for `NEXT_PUBLIC_PROFILE_POSITIONING_ENABLED`.

---

## 8. What Phase 1 changed

One thing: the core post lookup now goes through `lib/db` instead of naming
Supabase directly. The query, the filters and the error message are unchanged,
and Supabase is still the default and only working adapter.

See [neon-migration-plan.md](neon-migration-plan.md) §3.
