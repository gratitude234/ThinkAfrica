# Profile V3 Phase 5 implementation report

**Date:** 2 October 2026  
**Scope:** Topic-grounded Related Thinkers / Intellectual Network.

## What changed

### 1. Related Thinkers is now a real profile feature

The public Overview can now show up to three **Related Thinkers**.

A person is eligible only when their real published Posts or Articles share at least one normalized `posts.topic_keys` value with the profile owner's demonstrated **Writes about** topics. This is intentionally stricter than a generic social recommendation:

- reading interests do not create a match;
- university, field of study, profile type and points do not create a match;
- follows do not create a match;
- bookmarks and other private preference signals are not read;
- the profile owner and current viewer are not recommended to themselves.

### 2. Public follow relationships are secondary context

For writers who already qualify through shared published topics, Phase 5 checks the public `follows` graph.

That signal can strengthen ordering and is rendered only as restrained context such as:

- `Mutual follow`
- `Follow connection`

The primary explanation remains the shared writing topics, for example:

`Writes about Politics & Governance · Education Policy`

### 3. Safe candidate identity and discoverability

The Supabase implementation hydrates candidate identity through `profile_directory`, the existing safe discovery projection. That keeps suspended, non-viewable, opted-out and username-less profiles out of the recommendation surface.

The direct-Postgres implementation reproduces the same rules explicitly with the shared profile-visibility SQL plus `show_in_directory`.

The current viewer's own follow state is returned with each thinker so the existing compact Follow control can render correctly without a client-side discovery query.

### 4. Bounded provider-neutral reads

`ProfilePageRepository` now exposes `relatedThinkers(...)`.

Both adapters use the same product rule:

1. normalize the profile owner's demonstrated writing topics;
2. inspect the newest 300 published Posts/Articles matching those topics;
3. aggregate candidates by distinct shared topics;
4. retain at most 72 candidates before identity hydration;
5. prefer more shared topics, then stronger follow-network connection, then more recent publishing;
6. return at most the requested display limit (the Overview requests 3).

This keeps the feature bounded and avoids scanning an unbounded publication graph on every profile request.

### 5. Related Thinkers is deliberately degradable

Follower counts, publication lists, selected work and Intellectual Record facts remain strict profile data. A failure in those reads still reaches the profile error boundary.

Related Thinkers is different: it is supplemental discovery context. If its query fails, the server logs the failure and the public profile renders normally without the section.

### 6. Presentation

The section lives in the existing supporting profile aside, immediately after **Writes about**. It stays within the flat editorial profile language:

- no dashboard card;
- compact avatar/name/handle;
- optional one-line headline;
- shared-topic explanation;
- optional follow-network context;
- existing compact Follow button.

On tablet it participates in the existing two-column aside layout; on mobile it drops into the normal single-column stack.

## Files added

- `components/profile/ProfileRelatedThinkers.tsx`
- `components/profile/ProfileRelatedThinkers.test.tsx`
- `lib/db/profilePage.relatedThinkers.test.ts`
- `docs/Profile_V3_Phase5_Implementation_Report_2026-10-02.md`

## Major files updated

- `components/profile/ProfileOverview.tsx`
- `components/profile/profile.css`
- `lib/db/profilePage.ts`
- `lib/profileViewData.ts`
- `lib/db/profilePage.parity.live.test.ts`
- `lib/profileViewData.test.ts`
- `components/profile/ProfileExperience.test.tsx`
- `app/dev-preview/profile/page.tsx`
- `docs/profile-v3-contract.md`
- `CHANGES.md`

## Database / deployment notes

Phase 5 requires **no new database migration**. It reuses:

- `posts.topic_keys`;
- `profile_directory`;
- `follows`;
- existing profile visibility/directory rules.

The Phase 2 Selected Work migration is still required if it has not been applied:

`supabase/migrations/20261002000100_profile_v3_selected_work.sql`

## Verification

Phase 5 adds regression coverage for:

- direct-Postgres Related Thinkers mapping and visibility SQL;
- Supabase topic eligibility, current-viewer exclusion and follow context;
- Related Thinkers rendering and explanation copy;
- same-database Supabase/Postgres parity when live test credentials are available.

Verification completed before packaging:

- **656/656 TypeScript/TSX files** across `app`, `components`, and `lib` passed source-level TypeScript transpilation with zero parse failures.
- The Related Thinkers component contains no direct `.from(...)` or `.rpc(...)` database access; all reads remain behind `ProfilePageRepository`.
- Supabase candidate identity uses `profile_directory`; direct PostgreSQL reproduces the same visibility/directory constraints.
- Phase 5 adds **no new migration** (141 migration files before and after).
- The Phase 4 → Phase 5 diff is limited to the intended profile data, UI, tests, preview, contract, and documentation surfaces.

The full dependency-based Vitest/typecheck/Next build suite could not run in this container because `npm ci --offline` is missing cached `zod-validation-error@4.0.2`, while registry access is unavailable. That check is therefore **blocked**, not reported as passing.
