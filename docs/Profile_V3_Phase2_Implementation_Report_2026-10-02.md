# Indegenius Profile V3 — Phase 2 Implementation Report

Date: 2 October 2026

## Scope completed

Phase 2 implements **Selected Work** as a deliberately small extension of Profile V3. It does not restore the retired multi-item Featured Work manager or any retired evidence/credibility systems.

### Public profile

- Added one optional **Selected Work** section before Intellectual Record.
- The selected work must be a real published **Post** or **Article** owned by the profile.
- Visitors see nothing when no work is selected; owners see a quiet link to choose one.
- Selected Work uses the existing editorial/open profile layout rather than a dashboard card.
- If the selected work would also be the first item in Recent Work, it is filtered out there to avoid immediate duplication.
- Added `profile_selected_work` as a first-class profile funnel surface so work opens remain measurable without changing the existing conversion event names.

### Edit Profile

- Edit Profile now has four independent sections: **Profile, Selected Work, Topics, Visibility**.
- Selected Work offers `No selected work` plus up to the latest 50 owned published Posts/Articles.
- If the currently selected work is older than that window, it is loaded separately so it remains editable rather than disappearing from the form.
- Post selection labels use the Post excerpt, not a legacy hidden Post title.
- The section has the same dirty/saving/saved/error lifecycle as the other settings sections.

### Data/read architecture

- Extended `ProfilePageRepository` with `selectedWork(profileId)`.
- Implemented parity on both the Supabase and direct PostgreSQL paths.
- Direct PostgreSQL requires: profile owner, position 1, published status, and content kind `post` or `article`.
- Supabase resolves the position-one pointer and then revalidates the publication against the same owner/status/content-kind rules.
- Public React profile components still do not issue direct database reads.

### Database migration

Added:

`supabase/migrations/20261002000100_profile_v3_selected_work.sql`

The migration reuses the existing `profile_featured_posts` table but introduces a new narrow RPC:

`set_my_selected_work(uuid)`

Properties:

- `SECURITY INVOKER`.
- Requires `auth.uid()`.
- Accepts one published Post/Article owned by the caller, or `NULL` to clear.
- Atomically removes previous selections and writes only position `1`.
- Explicitly grants table SELECT to `anon` + `authenticated` under RLS and INSERT/DELETE to `authenticated`, which the invoker RPC needs.
- Revokes RPC execute from `PUBLIC`/`anon` and grants it to `authenticated` only.
- Leaves the historical replacement RPCs in place for migration/rollback compatibility, but Profile V3 does not call them.

**Important:** this migration is source-controlled in the ZIP; it has not been applied to a live Supabase project from this environment.

## Files added

- `components/profile/ProfileSelectedWork.tsx`
- `app/(main)/settings/profile/sections/SelectedWorkSection.tsx`
- `lib/db/profilePage.selectedWork.test.ts`
- `supabase/migrations/20261002000100_profile_v3_selected_work.sql`
- `supabase/migrations/profileV3SelectedWorkMigration.test.ts`
- `docs/Profile_V3_Phase2_Implementation_Report_2026-10-02.md`

## Main files changed

- `lib/db/profilePage.ts`
- `lib/profileViewData.ts`
- `components/profile/ProfileOverview.tsx`
- `components/profile/profile.css`
- `lib/profileSettings.ts`
- `lib/profileSettingsData.ts`
- `app/(main)/settings/profile/actions.ts`
- `app/(main)/settings/profile/ProfileSettings.tsx`
- `lib/profileFunnel.ts`
- profile/settings/architecture tests and development preview
- `docs/profile-v3-contract.md`
- `CHANGES.md`

## Verification performed

- Compared the implementation tree against the Phase 1 ZIP; changes are limited to the intended profile/settings/data/migration surfaces.
- TypeScript parser/static pass was run across every changed TS/TSX file with global TypeScript 5.8.3. No implementation-specific syntax/type errors were found; remaining diagnostics are environment-only unresolved package/runtime types because dependencies are not installed.
- Checked that runtime code does **not** call `replace_my_featured_posts`, `replace_my_featured_posts_v2`, record-summary RPCs, or the retired profile-record view.
- Checked the new migration for `SECURITY INVOKER`, owner/published/content-kind validation, explicit table grants, and authenticated-only RPC execution.
- Added focused repository, migration, settings and profile component regression coverage.

## Verification limitation

A full `npm ci`/Vitest/typecheck/build run could not complete in this container because npm registry access stalled. A partial `node_modules` directory created by that attempt was removed before packaging. Run the standard project checks in the normal development environment after applying the migration.

## Deployment order

1. Apply `20261002000100_profile_v3_selected_work.sql` to the target database.
2. Run database/migration checks and project tests.
3. Deploy the application code.
4. Test selecting an Article, selecting a Post, changing selection, and clearing selection.
5. Verify public, members-only and owner profile views on desktop/mobile.

## Deliberately not included yet

- Profile cover image upload/display.
- Multi-item Featured Work.
- Feature notes/reasons for selection.
- Research/Debate/Response/Citation/Peer Review metrics.
- Related Thinkers.

The next recommended implementation is the optional **cover image + profile media/settings polish**, followed by the Intellectual Record activity timeline.
