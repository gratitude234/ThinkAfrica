# Write loading experience

## Updated behaviour

The /write loader now uses the current Post composer's 560px desktop card, warm canvas, compact header and author/body placeholders. On phones it fills the writing screen. A small green spinner and the visible message “Opening your writing space…” communicate the pending state without invented percentage progress. Only the placeholders pulse; the entire screen no longer flashes.

The legacy /create/post entry uses the same loading component. The generic loading shell does not assume whether a saved draft will eventually open as a Post or Article.

Desktop and mobile Write links use Next's pending-link state to replace the pen icon with a spinner while navigation is pending. The side-rail button uses React's navigation transition state and disables repeat clicks while pending. Guest sign-in behaviour is preserved. No timeout or artificial minimum delay was introduced.

Loading status is labelled for assistive technology. Motion is disabled when the user prefers reduced motion.

## Validation

- 20 existing navigation and guest-gating tests passed across CreateTrigger, CreateLauncher, BottomNav and Footer.
- TypeScript check passed.
- ESLint passed for changed production components.
- Tailwind compilation and static rendering of the loading component passed.
- Browser preview could not run: the browser automation process failed to start, and the fallback Chromium download returned an invalid archive. No visual or real-device verification is claimed.
- React review: framework-owned pending state resets with navigation; no timer effects or additional data requests were added.

## Files changed for this update

- app/(write)/write/WriteCanvasSkeleton.tsx
- app/(write)/create/post/loading.tsx
- app/(main)/PendingWriteIcon.tsx
- app/(main)/BottomNav.tsx
- app/(main)/CreateLauncher.tsx
- app/(main)/CreateTrigger.tsx
- app/(main)/CreateLauncher.test.tsx (updated Link mock)

The archive also includes the preceding mobile keyboard/caret fix and its report. This is a source update, not a deployment. After deployment, check Write on mobile and desktop with network throttling, including navigating away during loading and opening Write as a guest.
