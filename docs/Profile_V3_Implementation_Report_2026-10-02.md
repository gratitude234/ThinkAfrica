# Indegenius Profile V3 — Phase 1 Implementation Report

Date: 2026-10-02

## Scope implemented

This phase establishes the work-first profile foundation without restoring retired product domains or adding database schema.

### Public profile

- Reordered public tabs to **Overview → Posts → Articles → About**; owners additionally receive **Drafts**.
- Rebuilt Overview around a truthful, lightweight **Intellectual Record** derived from published Posts and Articles.
- Added exact Article, Post and combined Published work totals.
- Replaced separate Recent Articles / Recent Posts previews with one mixed newest-first **Recent Work** stream.
- Kept biography, education, location, joined date and reading interests as supporting context rather than the lead experience.
- Renamed the public preference surface to **Interests** and explicitly describes it as reading-feed choices; the profile no longer treats those preferences as demonstrated writing expertise.
- Widened Overview into an editorial main-column + contextual-aside layout while retaining the existing Indegenius application shell.
- Kept the visual system open and flat: typography, whitespace and dividers do the hierarchy work instead of adding a dashboard of rounded containers.
- Added responsive collapse so the context aside moves below work and Intellectual Record metrics reflow on smaller screens.
- Updated the profile loading state and developer preview to match the V3 geometry.

### Data layer

- Added `publicationCounts(profileId)` to the provider-neutral profile page repository.
- PostgreSQL uses one aggregate over published `public.posts` rows.
- Supabase uses exact head counts for published Article and Post rows.
- Added a mixed `loadProfileRecentWork` loader and a new `loadProfileOverview` contract.
- Kept all public profile reads behind `lib/profileViewData.ts` and `lib/db/profilePage.ts`; no React profile component queries Supabase directly.
- No new table, view, RPC, policy or migration is introduced in Phase 1.

### Onboarding and profile completion

- Kept onboarding at two steps: **Profile** then optional **Topics**.
- Required identity remains display name + username.
- Added optional one-line **Headline**, persisted through the existing `profiles.professional_title` field.
- Photo and bio remain optional.
- University, country, field of study and graduation year remain out of onboarding and stay in Edit Profile.
- Reused the same onboarding identity validator inside the composer `ProfileGate` and its server action so legacy/incomplete accounts no longer have a separate definition of profile completeness.
- Onboarding topics remain reading preferences rather than being presented as expertise.

### Product truth deliberately preserved

Phase 1 does **not** add or fake:

- Research Notes
- Debates
- Responses as a standalone profile type
- Citations
- Peer Reviews
- credibility/evidence metrics
- the retired record tables/RPCs
- Featured Work curation
- cover-image profile UI

The live profile therefore reflects the current publishing system: **Posts + Articles**.

## Tests and guards updated

- Updated profile tab order tests.
- Updated Overview experience tests for Intellectual Record, Recent Work, About and Interests.
- Updated profile loader tests for a mixed work query plus exact counts.
- Added repository tests for publication counts on PostgreSQL and Supabase implementations.
- Updated onboarding validation tests for the optional headline limit.
- Updated the simple-writer profile architecture guard so a lightweight V3 Intellectual Record is allowed while retired evidence, credibility and Featured Work systems remain blocked.

## Verification completed in this environment

- TypeScript/TSX syntax transpilation passed for all changed source and test files.
- Static contract scans confirmed the new tab order, work-first Overview data path and absence of new legacy record-table reads.
- Full `npm test`, `npm run typecheck` and production build could not be executed because package installation hit an external npm registry/DNS `EAI_AGAIN` failure and the uploaded archive did not include a complete `node_modules` tree.

## Deferred Phase 2

The next phase should be isolated from this foundation:

1. Verify the deployed state of legacy `profile_featured_posts` / related functions before deciding whether to reuse or replace them.
2. Add a deliberately small **Pin/Selected Work** capability backed by verified schema.
3. Decide whether profile cover images should return; if yes, restore them through the existing controlled media mutation path rather than arbitrary remote URLs.
4. Derive public "writes about" topics from actual published work tags if/when the product wants that signal; do not reuse reading interests as evidence.
5. Run visual browser regression at desktop/tablet/mobile after dependencies are available, followed by full unit, typecheck and production-build gates.
