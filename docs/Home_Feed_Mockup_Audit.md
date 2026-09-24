# Home feed mockup audit and implementation

Date: September 24, 2026

Inputs: `indegenius(1).zip` and `Indegenius Home Feed (1)(5).html`.

## Assessment

The main implementation was already substantially aligned with Screen 02. The review decoded the bundled HTML and compared its desktop For you, desktop Following, mobile, guest and feed-state frames with the production components, CSS, data contracts and existing tests.

This is a source-and-behaviour audit, not a claim of pixel-perfect browser verification. A local browser could not start; the alternate browser could not access the local server. No live account or production database was used.

## Already implemented

| Mockup feature | Project implementation |
| --- | --- |
| Flat warm-canvas feed; 704px reading column | Home page, AppShell, cardShell |
| 16px mobile reading gutter; desktop/tablet rail; bottom navigation | AppShell, global CSS, SideRail, BottomNav |
| For you and Following, with keyboard tab navigation | PostsFeedTabs |
| Single guest notice; no guest tabs; Join destination | HomeGuestNotice, PostsFeedTabs, navigation |
| Body-first Posts; compact natural-ratio photo viewer | HomeFeedCard, PostImage, PostCover |
| Bodoni article title, gold kicker, stored-word-count reading time | HomeFeedCard |
| Topic chips and 16:9 article cover below text | HomeFeedCard |
| Mobile icons/counts and desktop engagement labels | FeedEngagementActions |
| Like/save optimistic updates, rollback and guest gating; share feedback | FeedEngagementActions |
| Loading, empty, caught-up and error/retry states | FeedSkeleton, FeedEmptyState, FeedErrorState, PostsFeedTabs |
| Frozen For you cursor; chronological Following cursor; freshness reservations | Existing feed data and ranking modules, unchanged |

## Fixed and implemented

1. **Guest Home navigation.** Desktop Home, mobile Home and the header wordmark now link anonymous readers to `/?guest=1`. Previously they linked to `/`, which redirected an anonymous reader to `/landing`.
2. **Compact publication timestamps.** Feed bylines now display `2h`, `1d`, etc., matching the mockup. A semantic `time` element retains the original timestamp, a full UTC tooltip and an accessible relative-time label. Other uses of the global date formatter remain unchanged.
3. **Mobile and desktop detail alignment.** Body/kicker top spacing is now 10px on mobile and 12px on larger screens; desktop fallback-avatar initials are 12px; article headlines retain the mockup's 640px maximum measure. Desktop Home rail padding no longer shrinks and indents its links inside the intended 176px rail.
4. **Skeleton and empty-state alignment.** Removed an extra skeleton metadata bar left over from the older byline. Matched the responsive body/kicker spacing. Empty states now use the mockup's 56px vertical padding and 260px text measure.
5. **Initial retry loading state.** Retrying an initial failure shows loading rather than briefly announcing that there are no publications.
6. **Automatic retry-loop prevention.** Pagination disconnects its observer while loading or showing an error. A failed next-page request waits for an explicit retry instead of automatically reissuing requests while the sentinel stays visible.
7. **Stale-response protection.** Each tab refresh has a version. An older response cannot replace a newer same-tab refresh, and old pagination cannot append itself to a refreshed snapshot. Incoming server-rendered feed props invalidate outstanding work.
8. **Snapshot/session consistency.** Each cached feed retains its own session ID. Pagination uses the session belonging to its cursor, including after an unsuccessful background refresh. Refresh and pagination are prevented from competing for the same displayed snapshot; synchronous guards also prevent duplicate load requests.
9. **Manual pagination fallback.** Added a keyboard-accessible Load more control while pages remain. It also works without IntersectionObserver. Busy state covers refreshes as well as pagination; the caught-up message is suppressed during refresh.
10. **Tests and documentation.** Added nine behavioural regressions for retry, request ordering, snapshot/session handling, manual pagination and guest navigation. Corrected four stale test assumptions: old boxed tab styling, topic chips on Posts rather than Articles, lexical comparison of differently formatted timestamps in the database test double, and treating affinity score as a guarantee of adjacent display slots despite the discovery lane. Updated the outdated feed redesign summary.

## Validation

- `npm run typecheck`: passed.
- ESLint on all changed TypeScript/TSX files: passed.
- Focused regression run: **206 tests passed across 14 test files**. This includes feed cards, engagement, cover handling, feed tabs, shell/navigation, feed API, data/cursors, ranking, tab definitions, fixtures and preview-page tests.
- `npm run build`: passed, including compilation, TypeScript and static-page generation. The build emitted the existing missing-admin-configuration sitemap warning and used static routes for the sitemap; it also emitted the standard edge-runtime and Browserslist notices.
- No dependency, schema, migration or ranking-algorithm changes.
- No deployment performed.

## Verification limits

- Browser screenshots and responsive visual interaction checks could not be completed in this environment. The visual conclusions above are based on decoded mockup markup and implementation/CSS comparison.
- Live sign-in, production feed responses and database-backed mutations were not exercised. Component/API tests use controlled mocks.
- The 206-test run is a targeted regression suite, not the entire repository test suite.
- The mockup's caught-up wording is retained. Existing live-session freshness is evaluated during feed requests/pagination; this patch does not add push delivery or continuous polling of an idle, exhausted feed.

## Applying this project

Use the updated source archive in the existing development workflow, retain the deployment's environment variables, and deploy normally. No SQL migration is required for these changes. Before production sign-off, check desktop and mobile Home with a real member and guest, switch tabs while scrolling, test like/save/share and image viewing, and simulate one failed next-page request to confirm the retry control.
