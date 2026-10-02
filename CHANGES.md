## 2026-10-02 — Profile V3 Phase 6 final production hardening

- Hardened Related Thinkers with fail-closed, either-direction block exclusions for both the profile owner and current viewer.
- Removed per-candidate block RPC fan-out; the public profile now uses the shared bounded server-side block-exclusion boundary and filters a six-person reserve down to at most three recommendations.
- Added stale Selected Work recovery in Edit Profile so owners can clear a selection whose publication is no longer published.
- Added graceful cover-image failure handling so deleted or invalid media never leaves a broken profile banner.
- Added `npm run profile:qa`, a dependency-free final Profile V3 architecture audit; 22/22 checks pass in this environment.
- Ran a full source syntax/transpile sweep across 674 TypeScript/TSX files with 0 errors.
- Added the final production-readiness report and deployment checklist.
- Phase 6 adds no database migration; the Phase 2 `set_my_selected_work` migration remains the only Profile V3 schema prerequisite to verify on the real Indegenius Supabase project.

## 2026-10-02 — Profile V3 Phase 4 published-topic intelligence and full record

- Added **Writes about** as a derived signal from normalized topic keys on real published Posts and Articles; reading interests remain a separate feed preference.
- Added provider-neutral publication-topic reads for both Supabase and direct PostgreSQL profile paths, with per-publication topic de-duplication and deterministic ranking.
- Added the live `/:username/record` route as a flat, paginated chronological history of current Posts + Articles only.
- Linked Intellectual Record to the full record page and added profile-funnel tracking for work opened there.
- Consolidated zero-work Overview states: owners get one clear publishing prompt while visitors get a quiet non-actionable state.
- Kept legacy Post titles hidden in the full record and did not restore Research, Debates, Responses, Citations, Peer Review or the old evidence-heavy record system.
- Added responsive record-page styling, a dedicated loading state, dev-preview data and regression coverage for topic derivation, pagination and empty states.
- No Phase 4 database migration is required; the implementation reuses the existing `posts.topic_keys` classification.

## 2026-10-02 — Profile V3 Phase 2 Selected Work

- Added one owner-selected published Post or Article at the top of the public Overview without restoring the retired three-item Featured Work manager.
- Added the `set_my_selected_work(uuid)` migration/RPC with authenticated-only execution, explicit Data API grants, owner/published/content-kind validation, and atomic clear/replace behavior.
- Added provider-neutral Selected Work reads for both Supabase and direct PostgreSQL profile paths.
- Added a Selected Work section to Edit Profile with independent save state and a bounded latest-publications chooser.
- Kept legacy Post titles hidden by using Post excerpts as the selection label and public selected-work text.
- Added a dedicated profile funnel surface for Selected Work opens and prevented Selected Work from immediately repeating in Recent Work.
- Extended Profile V3 regression, repository, migration, settings and component coverage.
- Cover image work remains deferred to the next phase.

## 2026-10-02 — Profile V3 work-first foundation

- Reframed the public member page as a work-first intellectual profile while keeping the existing Indegenius application shell.
- Reordered tabs to Overview, Posts, Articles and About, with Drafts owner-only.
- Added a lightweight Intellectual Record based only on real published Posts + Articles and replaced split previews with one mixed Recent Work stream.
- Added provider-neutral publication counts for both Supabase and direct PostgreSQL profile reads.
- Moved biography/education/location/reading interests into supporting Overview context and stopped presenting reading interests as demonstrated writing topics.
- Extended the two-step onboarding profile with an optional headline and unified composer ProfileGate validation with onboarding identity rules.
- Updated responsive profile geometry, loading/dev-preview states and regression/architecture tests.
- Added `docs/profile-v3-contract.md`; the earlier Intellectual Profile V2 record contract is now historical context.
- No schema migration was added; Featured Work and cover-image reintroduction remain deferred pending deployed-schema verification.

## 2026-09-27 — Write redesign mockup parity restoration

- Audited the live `/write` Post and Article screens against the supplied Write
  Redesign standalone mockup and the original design spec.
- Restored the Post desktop 560px card/workspace treatment, compact mockup
  header, character count, Article bridge card, and phone image toolbar.
- Restored Article Continue/Update Article wording, mobile Preview, mobile save
  row, visible Add cover affordance, title-validation copy, and the dark-green
  mobile formatting bar.
- Made reader preview use the mockup-style mobile Back bar while preserving the
  desktop app navigation.
- Preserved later product improvements: autosave/recovery, sources/history,
  richer formatting, and the Stage 6 feed-card Publish settings workflow.
- Updated focused tests for the restored contracts.

# 24 September 2026 — Feed viewer-context resilience

- Added a first-class feed viewer-context repository with Supabase RPC and direct PostgreSQL implementations.
- Made viewer context part of the existing `feed` read-migration domain so a direct-SQL feed no longer keeps a hidden PostgREST dependency.
- Added an explicit `FEED_VIEWER_POSTGRES_FAILOVER=1` transport escape hatch for verified production-safe `DATABASE_URL` targets; transient Supabase timeouts can fail over without weakening block exclusions.
- Kept missing-RPC compatibility reads for migration lag and preserved fail-closed block handling.
- Extended the live feed parity suite to compare Supabase RPC and direct PostgreSQL viewer context, including depersonalized block exclusions.
- Reworded the Home error state so backend outages are not misreported as the reader's internet connection.

# 24 September 2026 — Home feed switcher UX polish

- Rebuilt the Home `For You` / `Following` control as a balanced 50/50 switcher instead of a left-clustered, horizontally scrollable tab row.
- Made the switcher full-bleed on mobile while keeping publication rows inside the 16px reading gutter, and removed the sticky-state drop shadow in favour of the existing quiet divider.
- Strengthened the active state with a short centred brand indicator, 48px touch targets, 14px labels, and standardized `For You` capitalization.
- Added independent per-tab scroll restoration so returning to a cached feed restores the reader's previous position.
- Stopped automatically refetching a warm cached tab; cached modes switch instantly and only run a background freshness check after 60 seconds or when the app regains focus.
- Added non-disruptive freshness staging: newly published page-one content is held behind a small status dot and never inserted underneath the reader's current snapshot. Reselecting the active tab at the top applies the staged snapshot; reselecting while deep in the feed first returns to the top.
- Kept Feed v4.3 ranking, Following chronology, signed cursor pagination, exposure attribution, and feed API contracts unchanged.
- Updated Home feed regression coverage for equal-width tabs, full-bleed mobile chrome, cache reuse, per-tab scroll restoration, active-tab reselect behavior, freshness staging, and request-race safety.

# 24 September 2026 — Home Feed Screen 02 mockup implementation

- Implemented the approved Home Feed mockup as a presentation-layer pass without changing feed-v4 ranking, cursor, exposure, or live-session freshness logic.
- Set the Home reading column to 704px on desktop and a 16px mobile gutter that begins directly below the compact utility header.
- Aligned the desktop Home rail to the mockup while keeping the shared shell behavior on non-Home routes unchanged.
- Matched Post and Article feed grammar: flat divider rows, responsive byline/avatar sizing, titleless Post prose, natural Post media, Article kicker/headline/excerpt/topics, and 16:9 Article covers.
- Reworked feed actions to place Like/Comment/Share together and Save on the opposite edge, with compact icon/count controls on mobile.
- Matched mobile bottom navigation by removing the filled Write pill, tuned guest copy/notice styling, and changed the guest signup action to “Join.”
- Corrected Article loading skeletons to 16:9 so loading geometry matches rendered cards.

# 24 September 2026 — Feed v4.3 fresh-first reservation

- Changed fresh content from a soft lane preference into a selection-stage reservation: up to 5 of every 12 For You positions are reserved before older personalized/trending/evergreen winners can compete for the rest.
- Kept the protection window at 72 hours with 0-24h, 24-48h and 48-72h priority tiers.
- Stopped treating a lightweight viewport impression as consumption. Recent unread work remains eligible for protected distribution; a qualified read is now the hard per-reader consumption signal.
- Ordered protected inventory by age tier, reader exposure, initial test-audience need and global exposure before reader-fit/quality tie-breakers.
- Kept diversity as a preference without allowing it to silently surrender protected new-content positions to older inventory.
- Aligned the v4.2 live-session layer with the same qualified-read consumption rule.
- Bumped exposure attribution to `feed-v4.3.0` and the anonymous first-page cache key to v4.3.
- Added regression coverage for the production symptom where recent unread publications had prior lightweight impressions but were still buried by month-old winners.

# 24 September 2026 — Feed v4.2 live-session freshness

- Kept the v4 signed snapshot as the authoritative pagination sequence, but added a bounded live-fresh layer for publications created after `snapshotAt`.
- Continuation pages can now inject up to 2 unseen post-snapshot publications into a 12-card page while consuming fewer frozen ids, so the original snapshot order never shifts and no frozen card is skipped.
- Added a resumable live scan watermark and bounded pending queue. Publication bursts are drained over later pages rather than dropping everything beyond the first small batch.
- Live-fresh circulation prefers lower global exposure first and marks these cards as `for_you_live_fresh` for signed exposure attribution.
- Viewer exposure/read history prevents already-consumed post-snapshot work from using live-fresh slots when the signal is available.
- Live freshness is fail-soft: scan or live-card lookup failures fall back to the original frozen continuation instead of failing the feed.
- Guest continuation pages now bypass the anonymous 30-second feed cache so post-snapshot publications are actually discoverable during an active session; only guest page 1 remains cached.
- Existing v4.1 Home cursors are accepted for their remaining one-hour lifetime and upgraded in memory to the v4.2 cursor shape.
- Bumped exposure attribution to `feed-v4.2.0` and public first-page cache key to v4.2.

# 24 September 2026 — Feed v4.1 new-content distribution foundation

- Made new-content circulation a first-class feed rule instead of relying on a freshness score alone.
- Protected 5 of every 12 For You positions (41.7%) for unseen publications under 72 hours old whenever enough inventory exists.
- Reserved protected fresh candidates from personalized/discovery/trending lanes so those lanes cannot accidentally consume the new-content allocation.
- Prioritized publications below the initial 30-impression test audience before already well-exposed fresh winners.
- Replaced the hard 100-impression exploration cutoff with a gradual fade through 250 impressions.
- Added staged age support: strongest at 0-24h, strong at 24-48h, tapering through 48-72h.
- Prevented already-seen/read recent publications from consuming protected fresh slots; they can still rank normally on relevance/quality.
- Bumped exposure attribution to `feed-v4.1.0`, changed the anonymous public-feed cache key to v4.1, and reduced guest-feed staleness from 120s to 30s.
- Kept signed snapshot pagination unchanged; publications created after a snapshot starts still enter on the next fresh page-1 request, not mid-snapshot.

# 23 September 2026 — Feed v4 production stability

- Kept the v4 scoring and signed snapshot pagination, but stopped fully hydrating the entire 192-post first-page ranking window.
- Added bounded `get_feed_ranking_metrics`, `hydrate_feed_cards`, and `get_feed_viewer_context` RPCs so the broad ranking path does not fan out into large PostgREST `IN (...)` reads.
- Full card hydration now runs only for the visible page after ranking.
- Added a strict chronological first-page fallback for ranked candidate-list failures without weakening block exclusions.
- Made `proxy.ts` the authenticated dynamic-request refresh boundary, added the global Supabase timeout there, and moved critical Home/feed/activation identity checks from `getUser()` to verified claims.
- Treat concurrent refresh-token `409` responses as transient instead of confirmed logout.
- See `FEED_V4_STABILITY_FIX.md` and `supabase/migrations/20260923000001_feed_v4_stability.sql`.

# 23 September 2026 — Feed v4

- Replaced mutable offset pagination in **For You** with an HMAC-signed, compressed snapshot cursor so new publications and impression updates cannot reshuffle later pages.
- Added hybrid ranking lanes for personalized, fresh, discovery, trending and evergreen publications.
- Added cold-start exploration for new publications, qualified-read writer/topic affinity, per-reader fatigue and author/topic diversity.
- Kept **Following** chronological with its existing `(published_at, id)` keyset cursor.
- Bumped signed exposure attribution to `feed-v4.0.0` / `ranking_v4`.
- Added regression coverage for new-post page-boundary movement, cursor tampering, snapshot-to-tail continuity and cold-start/diversity behavior.
- See `FEED_V4_IMPLEMENTATION.md`.

# ThinkAfrica V2 Focus & Polish Pass

## Phase 1 — Visual Identity Foundation
- Added `Playfair Display` and `Inter` in `app/layout.tsx` and registered them in `tailwind.config.ts`.
- Introduced `canvas`, `surface`, `ink`, and `ink-muted` tokens and applied the warm off-white shell background.
- Applied `font-display` only to the specified headline surfaces: landing hero, post titles, post cards, profile display name, debate title, and auth headings.
- Increased the landing hero scale and replaced the landing feature SVGs with editorial numerals `01`, `02`, and `03`.
- Cleaned mojibake in the touched headline and landing surfaces.

## Phase 2 — Navigation IA Restructure
- Added `lib/featureFlags.ts` as the single source of truth for surfaced nav sections.
- Reworked desktop nav to `Home`, `Discover`, `Opportunities`, `Write`, plus the persistent search pill.
- Reworked mobile bottom nav to `Home`, `Discover`, elevated `Write`, `Opportunities`, and `Me`.
- Added `/opportunities` as a lightweight aggregator using public `talent_profiles`.
- Hid premature sections from nav and menus without removing their routes.

## Phase 3 — Landing Page Rewrite
- Replaced the landing hero copy with the narrower “Where Africa’s next thinkers are read.” positioning.
- Reversed CTA hierarchy so `Read First` is primary and `Join Free` is secondary.
- Reworked the hero right rail so it always shows 3 cards, padding with editorial placeholders when content is sparse.
- Added the gated “Writers from” proof strip for larger user volume.
- Refreshed the three feature blocks and the bottom CTA copy.

## Phase 4 — Onboarding Simplification
- Collapsed onboarding to a single interests step and redirected to `/?welcome=1` after save or skip.
- Moved the welcome treatment onto the home feed with a one-shot `WelcomeBanner`.
- Added `components/ui/ProfileGate.tsx` and wired it into write and comment flows so profile completion is requested just in time.
- Left `middleware.ts` untouched because it was not hard-gating read access.

## Phase 5 — Write Flow + Quick Take
- Added UI-only Quick Take behavior with `QUICK_TAKE_MAX_WORDS` and `isQuickTake` in `lib/utils.ts`.
- Lowered minimum word thresholds without changing schema.
- Updated `Badge` to render `Quick Take` when a short `blog` qualifies.
- Simplified `PublishDrawer` so tags and inferred type are primary, with cover/excerpt/slug moved into collapsed refinement.
- Replaced hard minimum-word blocking with soft guidance and adjusted editor copy for short-form writing.

## Phase 6 — PostCard Density Cleanup
- Reworked `components/post/PostCard.tsx` to a lighter editorial card with display titles and a single footer row.
- Dropped views, likes, and bookmarks from cards across the feed surface.
- Tightened card styling to `rounded-xl` and `border-gray-200/70`.
- Aligned bookmarks, search, and profile publication surfaces to the lighter reading-first treatment.

## Phase 7 — Final Polish
- Fixed remaining mojibake in auth, debates, navigation, and topic follow surfaces.
- Added accessibility semantics to primary nav and dialog-like overlays: `BottomNav`, `NavClient`, `SearchOverlay`, and `PublishDrawer`.
- Removed `DailyBriefGate` / `DailyBriefStrip` from the home feed while keeping the components in the repo.
- Changed leaderboard UI to weekly-first and hid the all-time tab from navigation while leaving the route logic intact.

## Intentionally Not Changed
- `lib/feedRanking.ts` was left alone because the ranking behavior was explicitly out of scope.
- `components/editor/Editor.tsx` was not rewritten; only small copy adjustments were made where required by the approved phases.
- `/admin/*`, `/api/*`, `supabase/migrations/*`, and `middleware.ts` were not changed unless a phase explicitly required inspection; no schema migrations or RLS changes were made in this pass.
- No new dependencies or tests were added, to keep the pass focused and low-risk.

## Feature Flags Currently False
- `debates`
  - Flip on when there are enough active debates to make the section feel alive, roughly the original threshold of around 50 active debates.
- `webinars`
  - Flip on when the first real webinar is scheduled and the page no longer feels empty.
- `fellowshipsSection`
  - Flip on when fellowships/opportunities inventory is curated enough to justify a dedicated surfaced section instead of the current stub.
- `ambassadors`
  - Flip on when the program is ready for broad public discovery rather than internal or targeted recruitment.
- `talentMarketplace`
  - Flip on when marketplace supply and demand are both present and the route feels active rather than speculative.

## Top 3 Follow-Ups
- Replace the remaining raw `<img>` usage in `landing/page.tsx` and `write/PublishDrawer.tsx` with a safe image strategy so the lingering build warnings are cleared without breaking remote previews.
- Fix the existing `NotificationBell` hook dependency warning and the `UniversitySelect` `aria-expanded` issue; they predated this pass and still show up on build.
- Add a proper `metadataBase` configuration so social metadata stops falling back to `http://localhost:3000` during build.

## 2026-10-02 — Profile V3 Phase 3

- Restored the optional profile cover as a restrained public banner using the existing `profiles.cover_image_url` column.
- Reused the existing `post-images` storage bucket and `CoverImageUploader`; profile covers write to the fixed `covers/{userId}/profile-cover` path and save through the server-side profile media action.
- Added cover support to both public profile identity adapters and Edit Profile settings without making cover part of onboarding or profile completion.
- Added a truthful rolling 12-month Intellectual Record activity timeline from published Posts + Articles only.
- Kept Supabase and direct-Postgres activity reads behaviorally aligned; the Supabase path pages timestamp-only rows instead of downloading full publications or issuing twelve count requests.
- No new database migration is required for Phase 3; it uses schema/storage capabilities already present in the project.

## 2026-10-02 — Profile V3 Phase 5

- Added **Related Thinkers** to the public profile as a topic-grounded intellectual-network surface.
- A recommendation now requires demonstrated overlap in normalized topics from real published Posts/Articles; follows cannot create a match by themselves.
- Public follow relationships are used only as a secondary ranking/context signal, and the current viewer's follow state powers the existing compact Follow control.
- Candidate identity comes from the safe directory projection on Supabase and the equivalent visibility/directory predicate on direct PostgreSQL, so hidden-from-directory profiles do not become recommendations.
- Related Thinkers intentionally excludes the current viewer from their own recommendation list and remains supplemental: a recommendation failure is logged and omitted rather than taking the profile down.
- No new table, RPC or migration was added in Phase 5.
