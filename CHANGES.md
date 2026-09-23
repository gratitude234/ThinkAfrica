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
