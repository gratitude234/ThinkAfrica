# Feed redesign summary

This version improves the Indegenius home feed without changing its data model or Supabase schema.

## What changed

- Article cards use a shorter, responsive text-first layout with compact cover media on larger screens.
- Feed images use a restrained 16:10 mobile and 16:9 desktop crop, with the existing full-image viewer retained.
- Posts, articles, and research now surface up to two real topic links for faster discovery.
- Article and research identity badges are clearer, while reviewed/citable labels remain evidence-based.
- Every feed card has a native Share action with clipboard fallback.
- Empty engagement counts are no longer printed as repeated zeros.
- Mobile content filtering uses a compact native selector; desktop retains one-click filter chips.
- Mobile discovery modules begin after five feed items instead of eight.
- The desktop discovery rail is wider, more legible, and has clearer featured/topic hierarchy.
- The Editor's Pick card is more compact on small screens.

## Verification completed

- TypeScript typecheck
- ESLint
- 1,568 automated tests
- Next.js production build

