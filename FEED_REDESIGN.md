# Feed redesign summary

This version improves the Indegenius home feed without changing its data model or Supabase schema.

## Mobile refinement pass

- Article and Research cards now keep compact right-side thumbnails on mobile, while social Posts retain immersive full-width media.
- Feed controls use a single native mobile content selector instead of a crowded row of filter chips.
- Live Debate, Writers to Follow, and Topic Spotlight appear after the 3rd, 7th, and 11th feed items.
- Writer and topic discovery modules use horizontal, swipeable cards to reduce page length.
- Small metadata and engagement labels have stronger contrast and readability.
- Repeated image overlays were removed; images remain accessible through the full-screen viewer.
- The desktop reading column is slightly wider and draft continuation is more actionable.

## What changed

- Article cards use a shorter, responsive text-first layout with compact cover media on larger screens.
- Feed images use a restrained 16:10 mobile and 16:9 desktop crop, with the existing full-image viewer retained.
- Posts, articles, and research now surface up to two real topic links for faster discovery.
- Article and research identity badges are clearer, while reviewed/citable labels remain evidence-based.
- Every feed card has a native Share action with clipboard fallback.
- Empty engagement counts are no longer printed as repeated zeros.
- Mobile content filtering uses a compact native selector; desktop retains one-click filter chips.
- Mobile discovery modules begin after three feed items instead of five.
- The desktop discovery rail is wider, more legible, and has clearer featured/topic hierarchy.
- The Editor's Pick card is more compact on small screens.

## Verification completed

- TypeScript typecheck
- ESLint
- 1,570 automated tests
- Next.js production build
