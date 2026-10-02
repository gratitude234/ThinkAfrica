# Profile V3 Phase 3 Implementation Report

Date: 2 October 2026

## Scope

Phase 3 builds on the Phase 2 work-first profile and adds two approved capabilities without reviving retired product domains:

1. An optional, restrained public profile cover.
2. A truthful rolling 12-month Intellectual Record activity timeline based only on published Posts and Articles.

No Research, Debate, Response, Citation, Peer Review or retired profile-record product was restored.

## 1. Optional profile cover

### Public identity

`profiles.cover_image_url` has been restored to the public profile identity projection in both database adapters:

- `lib/db/supabase/profiles.ts`
- `lib/db/postgres/profiles.ts`
- `lib/db/types.ts`
- `lib/profileIdentity.ts`

The cover is rendered by `components/profile/ProfileHeader.tsx` only when a URL exists. No empty band is reserved when a member has no cover.

The design is deliberately restrained:

- desktop height: 156px
- mobile height: 112px
- no full-screen hero treatment
- no cover controls on the public page
- profile identity remains readable without a cover

### Edit Profile

The Profile section now contains an optional Cover control alongside the existing photo control.

Files:

- `app/(main)/settings/profile/sections/ProfileSection.tsx`
- `lib/profileSettings.ts`
- `lib/profileSettingsData.ts`

Cover remains optional and is **not** added to onboarding or profile-completion requirements.

### Storage path

The implementation reuses the existing public `post-images` bucket and its existing `covers/{userId}` policy path.

Profile covers use one stable object path:

`covers/{userId}/profile-cover`

Using a stable path means replacement uploads overwrite the previous profile-cover object instead of creating a new timestamped object each time.

`components/ui/CoverImageUploader.tsx` now also persists the selected file MIME type when uploading.

### Server-side persistence

`saveProfileMedia` now accepts either:

- `avatarUrl`
- `coverUrl`

Both URLs are still normalized to this project's own Supabase Storage host before they can reach the profile row.

File:

- `app/(main)/settings/profileActions.ts`

No arbitrary third-party image URL was added.

## 2. Intellectual Record activity timeline

### Data contract

The profile repository now exposes:

`publicationActivity({ profileId, startMonth, months })`

It returns ordered UTC calendar buckets:

`{ month: "YYYY-MM", count: number }`

File:

- `lib/db/profilePage.ts`

### Direct PostgreSQL path

The direct PostgreSQL adapter calculates all requested month buckets in one aggregate query using `generate_series` and a left join over published Posts/Articles.

The publication timestamp is:

`coalesce(published_at, created_at)`

This keeps older published rows with a null `published_at` from disappearing from the record.

### Supabase/PostgREST path

The Supabase adapter does not issue twelve count requests and does not download full publication bodies.

It reads only:

- `published_at`
- `created_at`

for published Posts/Articles inside the requested activity window, in bounded pages of 500, then aggregates the timestamps into the same month buckets in application code.

This keeps the result exact even if a writer has more than the platform's normal single-response row limit.

### Overview loader

`lib/profileViewData.ts` now loads the last 12 calendar months as part of the Overview data contract.

The current Overview remains:

1. Selected Work, when chosen
2. Intellectual Record
3. Recent Work
4. Supporting About/Interests context

### UI

`components/profile/ProfileOverview.tsx` now renders a small open activity chart beneath the three real metrics:

- Articles
- Posts
- Published works

The chart:

- uses real month counts
- keeps the most recent month visually distinct
- includes accessible text for every month/count
- shows an explicit empty state when the last 12 months contain no publications

No decorative/fake values are generated in production.

## 3. Responsive behaviour

`components/profile/profile.css` now includes:

- short cover dimensions for desktop/mobile
- 12-column activity chart sizing
- smaller mobile labels/gaps

The profile remains a normal full page and does not introduce a device frame, dashboard container or giant rounded profile card.

## 4. Tests and guard updates

Updated existing profile guards/tests so they reflect the current Profile V3 contract instead of the Publishing Reset rule that banned covers entirely.

Updated:

- `lib/simpleWriterProfile.test.ts`
- `lib/db/supabase/profiles.test.ts`
- `lib/db/postgres/profiles.test.ts`
- `lib/profileViewData.test.ts`
- `components/profile/ProfileHeader.test.tsx`
- `components/profile/ProfileExperience.test.tsx`
- `app/(main)/settings/profile/ProfileSettings.test.tsx`
- `components/ui/CoverImageUploader.test.tsx`

Added:

- `lib/db/profilePage.publicationActivity.test.ts`

The new repository test covers both database adapters and the failure behaviour for incomplete activity data.

## 5. Contract/documentation updates

Updated:

- `docs/profile-v3-contract.md`
- `CHANGES.md`

The Profile V3 contract now explicitly states that:

- cover is optional and non-blocking
- the cover is a restrained banner
- Intellectual Record includes a real rolling publication timeline

## 6. Database and migration impact

**Phase 3 adds no new schema migration.**

It reuses:

- the existing `profiles.cover_image_url` column
- the existing `post-images` bucket
- the existing `covers/{userId}` storage-policy path

The Phase 2 migration `20261002000100_profile_v3_selected_work.sql` is still required if it has not already been applied, because Selected Work remains part of the Overview.

## 7. Verification performed

Completed in this environment:

- ZIP source diff against the delivered Phase 2 build
- TypeScript/TSX syntax transpilation for all 25 changed source/test files: **0 syntax errors**
- static contract checks confirming:
  - cover is in the public identity projection
  - cover is loaded in Edit Profile
  - cover writes through the server-side media action
  - the public header renders the cover
  - the activity repository exists
  - Overview renders the 12-month activity surface
  - onboarding still contains no cover requirement

## 8. Verification limitation

A full Vitest/typecheck/build run could not be completed in this execution environment.

`npm ci --offline` fails because `zod-validation-error@4.0.2` is not present in the local npm cache, while registry access is unavailable. No partial `node_modules` directory is included in the delivered project.

Before production deployment, run in the normal development environment:

```bash
npm ci
npm test
npm run typecheck
npm run build
```

Then manually verify:

1. Existing profile without a cover: no blank cover area appears.
2. Upload profile cover: public profile updates and image persists after refresh.
3. Replace profile cover: same stable storage path is overwritten.
4. Remove profile cover: banner disappears from public profile.
5. Mobile profile: cover stays short and identity/actions remain readable.
6. Intellectual Record: 12 months display in chronological order.
7. Sparse/new profile: timeline empty state is readable and no fake data appears.
8. Profile with Selected Work: Selected Work still stays above Intellectual Record.
9. Posts and Articles tabs remain unchanged.
10. Onboarding remains name/username + optional photo/headline/bio + Topics, with no cover requirement.
