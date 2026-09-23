# Global Shell implementation report

Source: supplied `indegenius(1).zip`. Reference: supplied `Indegenius Global Shell (1)(3).html` (the attachment is newer than the filename mentioned in the instructions). Implementation date: 23 September 2026.

## 1. Implemented

Completed the shared utility header, desktop/tablet rail, mobile bottom navigation, global search dialog, and reading-only compact mobile chrome. Existing route content and the completed Writer Profile remain intact. No schema migration or additional application dependency was added. No deployment was performed.

## 2. Exact changed source files

- `app/(main)/AppChromeProvider.test.tsx`
- `app/(main)/AppChromeProvider.tsx`
- `app/(main)/BottomNav.test.tsx`
- `app/(main)/BottomNav.tsx`
- `app/(main)/NavClient.test.tsx`
- `app/(main)/NavClient.tsx`
- `app/(main)/NavUserMenu.tsx`
- `app/(main)/NavigationShell.tsx`
- `app/(main)/SideRail.tsx`
- `app/(main)/navRoutes.test.ts`
- `app/(main)/navRoutes.ts`
- `app/api/search/route.ts`
- `app/dev-preview/shell/page.tsx`
- `app/globals.css`
- `components/ui/SearchOverlay.test.tsx`
- `components/ui/SearchOverlay.tsx`
- `components/ui/search-overlay.css`
- `lib/searchData.ts`
- `lib/searchOverlayData.test.ts`

The archive additionally includes this report, a patch against the supplied source, and verification screenshots/results under `docs/global-shell-verification/`.

## 3. Existing systems reused

The main layout still resolves the session and profile once and passes them to shared navigation. Reused `NavigationShell`, `NavClient`, `NavUserMenu`, `AppShell`, `SideRail`, `BottomNav`, `CreateTrigger`, `navItems`, `AppChromeProvider`, `BrandWordmark`, `UserAvatar`, the guest authentication gate, and visual-viewport handling. Existing route matching keeps Profile active for the account owner's routes, not other writers' pages.

Write still goes directly to `/write` through the existing Post composer flow. Its secondary Article path was not changed. Existing account, notification, settings, full-search, and publication routes remain in use. Writer Profile source files and its URL/tab behavior were not modified.

## 4. Duplicate chrome removed or consolidated

No parallel shell was introduced. The existing shared components were updated in place. The header contains utilities only; primary destinations remain in the responsive rail or bottom bar. Replaced the extra header scroll-shadow listener with a flat header, removed filled active pills from ordinary mobile items, and removed the rail's enclosing border. Focus routes suppress shared navigation. The only added page is a development-only verification fixture that returns 404 in production.

## 5. Search behavior

Desktop trigger and Cmd/Ctrl+K open one native modal dialog. The hint is platform-aware. The dialog autofocuses, makes background content inert, traps Tab, restores focus on close, supports Escape and backdrop dismissal, and provides an explicit Close control. Arrow keys select results and Enter navigates. Clear immediately resets results and cancels pending work.

Requests are debounced by 300ms, aborted on change/close, and protected against stale responses. `/api/search?scope=overlay` reuses the existing visibility-aware repository: up to six published Posts/Articles through its title/excerpt query plus three writers. The server resolves viewer identity; the browser supplies no viewer ID. Post rows display safe text excerpts rather than legacy titles. Article rows retain titles; writer rows show avatar/name/username. Existing `/post/[slug]`, `/[username]`, and `/search?q=` routes are used. Failures have an honest retry message. Empty input retains the existing search invitation without invented suggestions or history.

## 6. Responsive behavior

| Width | Header | Navigation | Search trigger |
| --- | --- | --- | --- |
| 1440px desktop | 64px; 32px horizontal padding | 176px labelled rail | Centred 480px field |
| 900px tablet | 64px; 20px padding | 56px icon rail; accessible labels/titles | 34px icon |
| 390px mobile | 52px; 16px padding | 64px bottom bar plus safe-area inset | 34px icon |

Desktop/tablet search is 560px wide, capped at 420px high, positioned 104px from the top. Mobile uses the available width with 12px margins and viewport/keyboard-aware height. The canvas, borders, emerald action, and shell fonts follow the reference. The brand uses the existing asset and Bodoni wordmark; Public Sans is scoped to shell UI. Editorial fonts remain route-owned. The Profile retains its 740px maximum width, header offsets of 64px/52px, and rail offsets of 176px/56px/0px.

## 7. Compact reading mode

Only `/post/[slug]` detail routes can compact on mobile. Downward travel of 64px beyond the reading threshold hides the header and bottom bar; upward travel of 40px restores them. A shared passive scroll listener schedules one animation frame at a time and cleans up. Navigation, focused inputs, and interaction locks restore or retain chrome. Home, Explore, Profile, Settings, Notifications, and forms remain expanded. Reduced-motion users retain visible navigation without sliding transitions. Normal motion uses the existing 200ms ease-out transform.

## 8. Verification

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=4 --reporter=verbose`: passed. Worker concurrency was bounded for this environment.

```text
Test Files  201 passed | 15 skipped (216)
Tests  2279 passed | 193 skipped (2472)
```

- `npm run build`: passed, including Next.js's complete TypeScript check.
- Browser verification: 114/114 checks passed at 1440px, 900px, and 390px; no browser JavaScript errors.
- Verified signed-in and guest navigation, account menus, own/other Profile states, exact dimensions, no overflow, search keyboard/focus/clear behavior, responsive search, guest Write authentication, reading hide/reveal, reduced motion, focused routes, and Profile sticky alignment.
- Existing composer/navigation tests cover the direct Write flow. Added tests cover writer navigation with Enter, Post excerpts, cancellation after clearing, focus restoration, bounded repository calls, and non-reading route exclusions.
- Production smoke: development-only shell and Profile preview routes return HTTP 404.
- `git diff --check` with existing CRLF handling: passed.

Browser verification used the actual shared components with development session/content fixtures and controlled `/api/search` responses. Live authenticated database queries and hardware-specific mobile safe-area/keyboard behavior were not exercised. The environment-dependent skipped tests require their configured integrations. The existing sitemap fallback warning during builds is unrelated to this shell work. Development screenshots may include the Next.js development indicator; it is absent from production.

## 9. Mock-only elements omitted

No design-board labels, striped page placeholders, sample results, fake notifications/counts, placeholder account initials, recent-search subsystem, retired product features, or new publishing selector were added to production. Search and account content come from existing application data. The original avatar fallback component was retained.

## 10. Remaining visual differences

Existing route content intentionally replaces the reference board's placeholders. Real avatars and the existing avatar fallback replace its sample initial. Guest accounts expose Sign in and Join. Search includes an explicit Close control, writer rows, and a full-results link for usability. The rail occupies the required 176px/56px track; route columns retain their existing widths rather than the board's illustrative 704px column. No known shell geometry or Profile-offset defect remains in the verified viewport sizes.

## 11. Git diff and delivery

The patch is relative to a local baseline of the supplied archive. No remote branch, existing history, or deployment was changed. Application dependencies and lockfiles are unchanged.

```text
 app/(main)/AppChromeProvider.test.tsx |  17 +-
 app/(main)/AppChromeProvider.tsx      |   6 +-
 app/(main)/BottomNav.test.tsx         |   4 +-
 app/(main)/BottomNav.tsx              |  38 ++--
 app/(main)/NavClient.test.tsx         |   9 +-
 app/(main)/NavClient.tsx              |  28 +--
 app/(main)/NavUserMenu.tsx            |   4 +-
 app/(main)/NavigationShell.tsx        |  15 +-
 app/(main)/SideRail.tsx               |  12 +-
 app/(main)/navRoutes.test.ts          |   2 +-
 app/(main)/navRoutes.ts               |  11 +-
 app/api/search/route.ts               |  12 +-
 app/dev-preview/shell/page.tsx        |  23 +++
 app/globals.css                       |  46 ++++-
 components/ui/SearchOverlay.test.tsx  |  62 +++++-
 components/ui/SearchOverlay.tsx       | 353 ++++++++++++----------------------
 components/ui/search-overlay.css      |  29 +++
 lib/searchData.ts                     |   8 +-
 lib/searchOverlayData.test.ts         |  15 ++
 19 files changed, 393 insertions(+), 301 deletions(-)
```

Complete updated project: `Indegenius_Global_Shell.zip`. Source patch: `docs/Global_Shell_Implementation.patch`. Verification evidence: `docs/global-shell-verification/`.
