# Profile V3 — Phase 6 Final Production Readiness

**Date:** 2 October 2026  
**Scope:** Final integration, privacy hardening, edge-state recovery and release verification for the Indegenius Profile V3 rebuild.

## Final status

Phase 6 closes the planned Profile V3 implementation sequence. It does not add another major profile feature. It hardens the Phase 1–5 product so that the profile can move into normal application QA and deployment.

The resulting profile lifecycle is:

**Signup → Onboarding identity → Edit Profile enrichment → Optional cover → Selected Work → Intellectual Record → Writes about → Recent Work → Full Record → Related Thinkers.**

Current public contribution truth remains **Posts + Articles only**.

## Phase 6 changes

### 1. Related Thinkers now fails closed around blocks

Related Thinkers is supplemental discovery, so uncertainty about block state must never leak a blocked relationship.

The final implementation:

- loads a small reserve of up to six topic-matched candidates;
- obtains either-direction block exclusions for the **profile owner** through the shared server-side blocking boundary;
- when the current viewer differs from the owner, also obtains the viewer's either-direction block exclusions;
- filters all excluded IDs before returning at most three Related Thinkers;
- omits the Related Thinkers section entirely if the strict block-exclusion read fails.

This also removes a first hardening attempt that could have performed one block RPC per recommendation candidate. The final path uses one bounded exclusion read for the owner and, when necessary, one for the viewer.

The underlying Related Thinkers repositories remain responsible only for demonstrated topic overlap, safe public-directory hydration and follow context.

### 2. Stale Selected Work can be recovered by the owner

A Selected Work pointer can outlive its publication. A Post or Article may be unpublished or otherwise stop resolving after it was selected.

Phase 6 now:

- detects when the stored Selected Work pointer no longer resolves to an owned published Post/Article;
- surfaces that state in Edit Profile;
- explains that the previous selection is no longer published;
- always exposes **No selected work**, even when the member currently has no other published work;
- lets the owner save `null` to clear the stale pointer.

Public profile reads continue to hide stale/unpublished selections.

### 3. Broken cover media disappears cleanly

If a stored cover URL later stops loading—for example because the storage object was removed—the profile no longer leaves a broken image/banner.

`ProfileHeader` now removes the cover presentation after an image load failure and resets that state when the cover URL changes.

Cover remains optional and settings-only. It is not part of onboarding or profile-completion rules.

### 4. Dependency-free final Profile V3 audit

A new command is available:

```bash
npm run profile:qa
```

It runs `scripts/profile-v3-final-audit.mjs` and requires no third-party packages. The audit currently checks 22 architecture/product invariants, including:

- tab order and owner-only Drafts;
- no direct Supabase reads from profile components;
- current Posts/Articles-only Intellectual Record;
- full record route through the profile data boundary;
- cover failure handling;
- stale Selected Work recovery;
- safe `profile_directory` usage;
- bounded block-aware Related Thinkers filtering;
- no per-candidate block-query fan-out;
- Selected Work RPC security and product-kind validation;
- onboarding remaining lightweight;
- composer ProfileGate sharing onboarding identity validation.

**Result in this environment: 22/22 passed.**

## Verification completed in this environment

### Full source syntax/transpile sweep

A dependency-independent TypeScript transpile sweep was run across:

- `app/`
- `components/`
- `lib/`
- `supabase/`

**674 TypeScript/TSX files checked.**  
**0 syntax/transpile errors.**

### Migration inventory

- Migration files before Phase 6: **141**
- Migration files after Phase 6: **141**
- Phase 6 introduces **no new database migration**.

The Profile V3 schema prerequisite remains:

`supabase/migrations/20261002000100_profile_v3_selected_work.sql`

That migration creates the narrow `set_my_selected_work(uuid)` mutation as `SECURITY INVOKER`, restricts execution to authenticated callers, and validates that a selection is the caller's own published Post or Article.

### Package integrity / dependencies

A full dependency-backed test/build pass could not be executed in this container. The project archive does not include `node_modules`, and:

```bash
npm ci --offline --ignore-scripts --no-audit --no-fund
```

fails because `zod-validation-error@4.0.2` is not present in the local npm cache.

This means the following checks are **not claimed as passing here**:

- full Vitest suite;
- semantic TypeScript `typecheck` using the project's installed dependency tree;
- Next.js production build.

They remain mandatory before production deployment.

## Live Supabase verification

No live Indegenius database was mutated during Phase 6.

The connected Supabase workspace available in this environment exposes a different project (`Delaw Dev`), not the Indegenius project represented by this repository. The wrong project was intentionally left untouched.

Before deploying Profile V3, the actual Indegenius Supabase project should be checked to confirm that `20261002000100_profile_v3_selected_work.sql` is applied. After any required migration is applied, run Supabase security and performance advisors.

## Required production release checklist

Run these steps in the normal Indegenius development/CI environment with registry and database access:

1. `npm ci`
2. `npm run profile:qa`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`
6. Verify/apply `20261002000100_profile_v3_selected_work.sql` on the actual Indegenius Supabase project.
7. Run Supabase security and performance advisors after migration verification.
8. Smoke-test the full member journey: signup → verification → onboarding → publish Post/Article → Edit Profile → add/remove cover → choose/clear Selected Work → public profile → Full Intellectual Record → Related Thinkers.
9. Verify owner, signed-in visitor and signed-out visitor states.
10. Verify empty, sparse and high-volume profiles.
11. Verify members-only, suspended and directory-opt-out identities remain unavailable where required.
12. Verify either-direction block relationships never appear under Related Thinkers for either the profile owner or current viewer.
13. Unpublish/delete a selected publication and confirm public hiding + Edit Profile recovery.
14. Remove/break a cover object and confirm the profile falls back cleanly.
15. Verify Follow/Unfollow from Related Thinkers and follower/following counts.
16. Test username changes and all profile/record URLs.
17. Test mobile, tablet and desktop layouts, including long names, usernames, headlines and topic labels.
18. Keyboard/focus/accessibility pass for profile tabs, actions, Selected Work, Related Thinkers and record pagination.
19. Review profile-page query timings/logs under representative data volume.
20. Confirm analytics events for profile view, work open, Selected Work and Related Thinkers follow actions.

## Profile V3 completion boundary

After the release checklist passes, Profile V3 should be considered complete.

Future concepts such as citations, peer-review reputation, debate history, institutional verification or richer graph visualisation are separate product milestones. They should not be folded back into this rebuild without their own live product/data contracts.
