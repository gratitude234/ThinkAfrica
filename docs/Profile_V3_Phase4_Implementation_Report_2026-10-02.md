# Profile V3 Phase 4 implementation report

**Date:** 2 October 2026  
**Scope:** Published-topic intelligence, sparse-profile states and the first full Intellectual Record page.

## What changed

### 1. “Writes about” is now earned from published work

The public profile no longer needs to treat onboarding reading interests as a proxy for what a member writes about. Phase 4 derives a separate **Writes about** signal from `posts.topic_keys` on the member's real published Posts and Articles.

Rules:

- only `status = 'published'` rows count;
- only current `content_kind` values `post` and `article` count;
- duplicate topic keys inside one publication count once;
- keys are normalized before aggregation;
- topics are ordered by publication frequency, then most recent use, then key;
- the Overview shows up to 6 and the full record page up to 8;
- counts are used to derive ordering but are not presented as expertise scores.

Reading interests remain labelled **Interests** and continue to mean feed preferences.

### 2. Provider-neutral topic reads

`ProfilePageRepository` now exposes `publicationTopics(...)`.

- Direct PostgreSQL performs one aggregate query over `posts.topic_keys`.
- The Supabase adapter reads only `topic_keys`, `published_at` and `created_at` from published Posts/Articles, pages the read in bounded 500-row chunks, and performs the same de-duplication/ranking in the server layer.
- React components still do not query Supabase directly.

No new table, RPC or Phase 4 migration was introduced.

### 3. Full Intellectual Record route

`/:username/record` is live again, but it is **not** the retired Profile Record/Credibility system.

It is a lightweight, current-product page that shows:

- real Article, Post and total-published counts;
- derived Writes about topics when available;
- every published Post and Article, newest first;
- year grouping;
- Article title/excerpt/read time;
- titleless Post prose (legacy Post titles remain hidden);
- optional publication covers;
- Newer/Older pagination;
- owner-only publishing actions for an empty record.

The old redirect from `/:username/record` to `/:username` was removed. The retired evidence-heavy record modules, RPCs and tables remain out of the application path.

### 4. Better zero-work experience

A member with no published work no longer sees three empty modules in Overview.

**Owner:** one `Build your intellectual record` state with `Write a Post` and `Write an Article` actions.  
**Visitor:** one quiet `No published work yet` state with no owner actions.

Biography and reading interests can still appear as supporting profile context.

### 5. Presentation and responsive behaviour

The full record follows the approved flat editorial profile language: open sections, typography, whitespace and thin dividers rather than a grid of rounded dashboard cards.

A dedicated record loading state mirrors the final geometry. On mobile, metrics reflow, writing topics wrap naturally and year labels stop being sticky.

## Files added

- `app/(main)/[username]/record/page.tsx`
- `app/(main)/[username]/record/loading.tsx`
- `components/profile/ProfileRecordList.tsx`
- `components/profile/ProfileRecordList.test.tsx`
- `lib/db/profilePage.publicationTopics.test.ts`
- `docs/Profile_V3_Phase4_Implementation_Report_2026-10-02.md`

## Major files updated

- `components/profile/ProfileOverview.tsx`
- `components/profile/profile.css`
- `lib/db/profilePage.ts`
- `lib/profileViewData.ts`
- `lib/profileTabs.ts`
- `lib/profileTopics.ts`
- `lib/profileFunnel.ts`
- `app/dev-preview/profile/page.tsx`
- `next.config.mjs`
- `docs/profile-v3-contract.md`
- profile/data/component regression tests

## Database / deployment notes

Phase 4 requires **no new migration**. It relies on the existing normalized `posts.topic_keys` column already maintained by the publishing classification schema.

The Phase 2 migration is still required if it has not yet been applied:

`supabase/migrations/20261002000100_profile_v3_selected_work.sql`

## Verification

Phase 4 includes regression coverage for:

- PostgreSQL topic aggregation;
- Supabase topic aggregation and failure handling;
- mixed full-record pagination;
- derived topic rendering;
- full-record URLs;
- legacy Post-title hiding;
- owner vs visitor empty states;
- the architecture guard distinguishing the new lightweight record route from the retired record/credibility system.

The changed TypeScript/TSX sources are also syntax-transpiled during the delivery check. If the environment cannot install the repository's npm dependency tree, full Vitest/typecheck/Next build results are reported separately rather than assumed.

### Delivery verification result

- Syntax/transpile validation: **653 TypeScript/TSX files checked, 0 failures**.
- Phase 4 architecture checks: passed (record route uses the loader/repository boundary, old record redirect removed, current Posts/Articles filters preserved, reading interests remain separate, retired record/Featured modules remain absent).
- Phase 4 adds **no migration** relative to Phase 3.
- A full `npm ci --offline` could not complete because `zod-validation-error@4.0.2` is not present in the container npm cache. Therefore Vitest, full `tsc --noEmit`, and `next build` are not claimed as passing in this environment.
