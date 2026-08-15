# Phase 0: product truth and production verification

Last repository audit: 2026-08-15

## Status and scope

This document records what the current repository implements and what still
depends on configuration, unreleased database candidates, or live-environment
verification. "Implemented" below means **present in this checkout**. It does
not prove that the feature is deployed, configured, populated, or working in
staging or production.

This Phase 0 pass was repository-only. It did **not**:

- start the application or a local server;
- connect to Supabase, Vercel, analytics, email, push, or AI providers;
- inspect staging or production environment variables;
- run database probes or apply migrations;
- deploy or publish anything.

Accordingly, the staging and production migration/catalog state remains
**UNKNOWN** until the checklist later in this document is completed and its
evidence is recorded.

## Canonical content model

The user-facing publishing model has three kinds:

| Kind | Authoring contract | Publication path | Trust meaning |
|------|--------------------|------------------|---------------|
| **Post** | Lightweight body, optional title, maximum 2,000 characters | Publishes directly | Not formally reviewed or citable |
| **Article** | Title and long-form rich text | Publishes directly | Essay and Policy Brief are optional genres; neither implies review, credibility, or citation |
| **Research** | PDF, title, abstract, keywords, authors, optional topics, and references | Formal editorial review before publication | Becomes reviewed and citable only after actual acceptance evidence exists |

`lib/contentModel.ts` is the application source of truth. A record is formally
reviewed only when workflow evidence such as `citation_id` or
`published_version_id` exists. A content kind or Article genre is never enough
to make that claim.

### Legacy compatibility

The database still carries the legacy `posts.type` column during the
expand-and-contract migration:

| Legacy `posts.type` | Canonical `content_kind` | Optional `article_format` |
|---------------------|--------------------------|---------------------------|
| `blog` | `post` | — |
| `essay` | `article` | `essay` for a legacy Essay; otherwise optional |
| `policy_brief` | `article` | `policy_brief` |
| `research` | `research` | — |

New Posts and Articles are still dual-written to the legacy column for database
compatibility. Existing Policy Briefs that were already in an editorial review
state may complete that old workflow. New Policy Briefs are Article genres and
publish directly. Phase 4B, which removes the legacy column and compatibility
branches, has not started. See `docs/content-model.md` for its exit criteria.

### Comments and Responses

A Comment is a lightweight discussion row that remains on its parent page. A
Response is a publication stored as a `posts` row with `in_response_to`; it has
its own slug, page, feed card, and profile presence. Response is a relationship
between publications, not a fourth `content_kind`.

### Quality language

The current verified workflow is **formal editorial review**, not peer review.
Public copy must not use "Peer Reviewed" until a separate, rigorous
peer-review process has been specified, implemented, and verified. The proposed
brand ladder — Published, Indegenius Selected, Indegenius Reviewed, and Peer
Reviewed — is not yet a complete product contract and must not be presented as
live functionality.

## Repository feature-state matrix

| Surface | Repository state | Control and dependency | Production truth |
|---------|------------------|------------------------|------------------|
| Home and Explore | Implemented and primary navigation | Core Supabase content/profile data | Unknown; not runtime-verified in this pass |
| Post composer | Implemented at `/create/post` | Authenticated user and current schema | Unknown |
| Article composer | Implemented at `/write?kind=article` | Authenticated user; new Articles dual-write legacy `type=essay` | Unknown |
| Research submission and review | Implemented at `/submit/research` and `/admin/review` | Storage, review tables/RPCs, roles, and current executable migrations | Unknown |
| Comments and Responses | Implemented | Comments and post relationship migrations/RLS | Unknown |
| Debates V1.5 | Implemented; `FEATURE_FLAGS.debates` is `true` | Navigation respects the static flag; debate schema and deadline cron also matter | Unknown |
| Debates V2 | Code exists but activation is env-gated | Exact `DEBATE_V2_ACTIVATION_ENABLED=1`; deployed V2 ledger/catalog and cron state are unresolved | Unknown; keep off until `docs/debate-deployment-state.md` is completed |
| Opportunities | Implemented and primary navigation | Opportunity inventory and related tables | Unknown |
| Fellowships | Implemented route and linked from Opportunities | `fellowshipsSection=false` does not currently gate the route | Unknown; not a hard-disabled feature |
| Ambassadors | Implemented route | `ambassadors=false` hides the footer link, but other direct links/routes remain | Unknown; not a hard-disabled feature |
| Talent discovery | Implemented direct route | `talentMarketplace=false` has no runtime route guard | Unknown; not surfaced as a primary destination |
| Policy Hub, Alumni, Leaderboard | Implemented direct routes | Not controlled by the static flags above; not primary navigation | Unknown |
| Messages and Bookmarks | Implemented; authentication-gated actions | Messaging/bookmark tables and RLS | Unknown |
| Author subscriptions and publication delivery | Application code present, release-gated | Exact `NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED=1`; SQL remains in `supabase/pending/` | Not released by repository evidence |
| Author Subscriptions UX V2 | Application code present, release-gated | Requires Author, Topic, and UX V2 flags all equal to `1`; SQL candidate remains pending | Not released by repository evidence |
| Topic subscriptions | Application code present, release-gated | Requires Author and Topic flags equal to `1`; SQL remains pending | Not released by repository evidence |
| AI topic suggestions | Application code present, release-gated | Exact `NEXT_PUBLIC_AI_TOPIC_SUGGESTIONS_ENABLED=1`, pending SQL, and Gemini configuration | Not released by repository evidence |
| Realtime enhancements | Client support present, env-gated | Exact `NEXT_PUBLIC_ENABLE_REALTIME=1` | Unknown; default example is off |
| Daily Brief | Feed UI removed; components and daily cron remain | `DAILY_BRIEF_DRY_RUN=1` is the safe default; push credentials, recipients, and cron require verification | Unknown; do not enable delivery yet |
| `/discover` | Redirect-only compatibility route | Preserves query parameters and redirects to `/explore` | Deterministic in code |
| `/subscriptions` | Conditional route | Redirects to notification settings unless subscription UX V2 prerequisites are enabled | Depends on flags and pending database releases |

Static feature flags control surfacing only. They are not authorization checks
and, unless a route explicitly reads one, they do not make the route
unreachable.

## Product-truth corrections and remaining blockers

### Unsupported adoption figures removed in this pass

The audited public surfaces previously contained conflicting hard-coded
figures:

- the landing page states 142 universities and 38 African countries;
- the About page states 14+ universities, 3 countries, and 200+ essays.

Those figures were removed rather than replaced with invented values. The
landing page now displays only database-derived registered-profile and
published-post counts when those queries return data. Before adding another
adoption claim, record:

1. the authoritative query or source;
2. the inclusion rules (for example, registered profile versus active writer);
3. the environment from which it was measured;
4. the date and owner of the verification.

The removed numbers must not be restored without that evidence.

### Profile privacy is an expand-and-contract rollout

The executable Phase 0 migration adds owner-only private reads, profile
visibility enforcement, protected profile writes, and authoritative messaging
checks. Broad profile-column SELECT remains intentionally compatible during the
expand step. The reviewed revocation candidate is
`supabase/pending/profile_private_projection_contract.sql`; it must not be
promoted until the new application call sites are deployed and verified in
staging. Until then, explicitly requested private columns on otherwise visible
profiles remain a known exposure.

`show_in_directory=false` also remains a stored preference rather than a fully
enforced discovery boundary. A helper exists, but every discovery/search query
has not yet been moved behind an authoritative directory projection.

### Feature flags are not route gates

`fellowshipsSection`, `ambassadors`, and `talentMarketplace` describe intended
surfacing state, but they do not consistently guard their corresponding routes
or every link. Product and release decisions must not treat a `false` static
flag as proof that a feature is inaccessible.

### Pending SQL is not executable migration history

Everything under `supabase/pending/` is a reviewed release candidate, not part
of normal migration execution. Do not copy, timestamp, or apply a candidate
until its release document's prerequisites are met and the live migration
ledger/catalog have been reconciled.

## Production verification checklist — NOT RUN

**Current result: NOT RUN. All staging and production answers remain UNKNOWN.**

This checklist is intentionally read-only first. Record outputs in a dated
verification artifact before authorizing any write or migration.

### A. Identify and protect the target

- [ ] Record the Supabase project reference, application environment, region,
      and responsible operator.
- [ ] Confirm the connection is staging before running the checklist there.
- [ ] Confirm backups and recovery expectations with the database owner.
- [ ] Confirm no pending SQL file or migration command will be executed during
      the evidence-gathering pass.

### B. Reconcile migration ledger and catalog

- [ ] Export the complete `supabase_migrations.schema_migrations` ledger.
- [ ] Compare every on-disk executable migration with the ledger.
- [ ] Run the read-only object fingerprints in
      `docs/debate-deployment-state.md` against staging.
- [ ] Record whether ledger and catalog agree for every Debate V2/V1.5 object.
- [ ] Record the deployed `notifications_type_check` definition and the
      distinct stored notification types.
- [ ] Confirm the content-model columns, constraints, resolver functions, sync
      trigger, and accepted-publication locks expected by `docs/content-model.md`.
- [ ] Confirm research document storage, review tables/RPCs, and citation
      sequence objects exist with the expected grants.
- [ ] Stop if the ledger and catalog disagree. Do not run `db push` or repair
      the ledger without a separately reviewed remediation plan.

### C. Verify authorization and data boundaries

- [ ] With read-only catalog inspection, record RLS enablement and policies for
      profiles, posts, reviews, comments, messages, opportunities, debates, and
      notifications.
- [ ] In a controlled staging account, verify a user can edit ordinary profile
      fields but cannot self-assign roles, verification, points, suspension, or
      other privileged fields.
- [ ] Verify reviewer, editor, admin, and bootstrap-admin capabilities match
      `lib/roles.ts` and `lib/adminAccess.ts`.
- [ ] Verify private research documents, messages, blocked content, and hidden
      moderation records cannot be read by an unrelated user.

### D. Verify configuration and scheduled work

- [ ] Record effective values, without exposing secrets, for every flag in
      `.env.example`. Confirm enabled flags use the exact value `1`.
- [ ] Keep `DAILY_BRIEF_DRY_RUN=1`; invoke only the approved staging dry-run and
      verify that no push delivery occurs.
- [ ] Confirm `CRON_SECRET`, push/VAPID, email, AI, and application URL settings
      are present only where required.
- [ ] Record the status and latest result of review reminders, daily brief,
      Debate V1.5 deadlines, and debate notification crons.
- [ ] Confirm Debate V2 round advancement is not assumed to be scheduled merely
      because an API route exists.

### E. Controlled staging walkthrough

- [ ] Sign up and confirm account/onboarding behavior with a test identity.
- [ ] Publish one Post and one Article; verify both appear with canonical labels
      and neither claims formal review or citation.
- [ ] Submit Research with a test PDF; verify it remains non-public while
      pending and only gains reviewed/citable evidence after the approved
      editorial workflow.
- [ ] Verify Comment versus Response behavior, feed/profile placement, and
      protected actions for a guest.
- [ ] Walk through Debates V1.5, Opportunities, messaging, blocking, reporting,
      and role-restricted editorial/admin surfaces.
- [ ] Keep every pending subscription/AI feature off unless its SQL candidate
      has been promoted, applied, and verified through its release document.

### F. Production decision

- [ ] Attach staging evidence and list every unresolved difference.
- [ ] Obtain explicit approval for a production read-only verification pass.
- [ ] Repeat the read-only ledger, catalog, RLS, configuration, and cron checks
      in production.
- [ ] Create a separate, reviewed rollout or remediation plan for every write,
      migration, flag activation, or delivery enablement.
- [ ] Mark production state known only after evidence is dated, attributable,
      and stored with the release record.

## Exit criteria for Phase 0 product truth

Phase 0 is complete only when:

1. staging and production migration/catalog state are recorded and reconciled;
2. privileged profile and administrative fields are proven protected;
3. public content and review language matches the canonical model;
4. implemented, surfaced, gated, pending, and legacy features are accurately
   inventoried;
5. critical activation and repeat-publication events have verified baselines;
6. conflicting adoption claims are removed or supported by dated evidence.

This repository-only pass implements the source changes for items 2 through 6,
including removal of the contradictory adoption figures. It does not prove any
database change is deployed, does not establish a live numeric baseline, and
cannot satisfy item 1 or the production-verification portions of items 2 and 5.
