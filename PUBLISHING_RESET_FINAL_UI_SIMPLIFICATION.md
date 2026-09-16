# Indegenius final user-facing simplification

## Summary

This pass finishes the remaining application-level cleanup before Phase 2J. The standalone Writing Dashboard is already retired and the owner manages drafts from the profile. This patch removes the remaining visible/runtime residue found in the uploaded checkpoint.

## Completed in this patch

- Removed the orphaned audio-summary player and all application reads/writes of `posts.audio_summary_url`.
- Removed review assignment access from the publication route. Unpublished work is now readable only by its primary author.
- Removed review/editor/version/coauthor collections from the publication-page repository. Publication detail now loads only current-product collections such as sources, engagement counts and related publications.
- Removed coauthor presentation from Post and Article detail views and author cards.
- Removed coauthored publications from public profile publication lists; profiles now represent work primarily authored by that writer.
- Simplified direct-Postgres publication/reference visibility to published-or-primary-author rules, eliminating runtime dependence on `post_reviews` and `post_authors` for those paths.
- Removed retired review/response/coauthor email preference keys from current Settings types/defaults and email preference typing.
- Neutralized historic review/approval/collaboration notification presentation. Historic rows remain renderable as ordinary activity; `post_approved` now presents as “Published”.
- Simplified Admin user role presentation to `Administrator` or `Member` rather than surfacing retired reviewer/editor identity labels.
- Added `lib/focusedPublishingProduct.test.ts` to guard the simplified product surface.

## Intentionally deferred to Phase 2J

The database still contains legacy review/coauthor/audio-summary columns/tables and historic rows. This pass removes current application product dependencies; Phase 2J owns physical schema deletion, RLS rewrites, historic compatibility decisions and removal of remaining internal safety/owner-row compatibility.

Trust-and-safety block logic is not weakened in this UI pass.

## Additional simplification

- Admin account verification is now binary internal verification; the page no longer presents researcher/faculty/institution verification types or reviewer/editor choices.
- Admin Users presents accounts as `Administrator` or `Member`, rather than surfacing retired editorial roles.
- Historic review/collaboration notification rows ignore their stored retired-product copy and links, rendering through neutral compatibility descriptors instead.
- Feed/profile/publication runtime reads no longer use accepted co-author credits as a visible product concept. The temporary `post_authors` owner-row write remains only because the current database reference RLS still depends on it; Phase 2J must replace that RLS before dropping the table.

## Validation performed in this archive workspace

- Parsed all 592 TypeScript/TSX files with the TypeScript compiler parser: 0 syntax diagnostics.
- Ran a compiler-program diagnostic pass over all changed production files while filtering only missing third-party type packages from this isolated ZIP workspace: 0 relevant code diagnostics.
- Static residue checks confirm no active publication-page reads of `post_reviews`, `post_editor_decisions`, `post_versions`, or `audio_summary_url`.
- Full npm install/test execution could not be completed in this isolated container because npm failed during dependency installation (`Exit handler never called`). The source ZIP itself did not include `node_modules`.
