# Profile V3 design-system alignment — 4 October 2026

Profile now uses the same canvas, semantic colour system and interface typeface as Home/Explore while preserving the standalone mockup's composition, information hierarchy and editorial personality.

## Visual changes

- Removed the Profile-only main background override. The page inherits the application canvas; the overlapping avatar border and compact profile bar use `--ta-canvas-rgb`.
- Replaced the standalone palette with the existing RGB tokens from `app/globals.css`: primary/soft/muted ink, dividers, card surfaces, resting/hover card borders, emerald ink and emerald brand. Filled controls, verification marks and activity bars use brand emerald; links, tabs and textual accents use emerald ink. Activity bars retain their quieter resting treatment through token opacity.
- Public Sans now supplies interface, metadata and body text, including Recent Work post excerpts and full-record post bodies. Newsreader remains on the writer name, editorial headline, major headings, Selected Work and publication titles, and display metrics. Removed the unused separate interface-font registration, font binary and licence file.
- Removed the header's parent-based colour/shape overrides and the broad shared display-font override. The shared `FollowButton` source is unchanged. Its normal and Following states retain the shared component styles, and mobile Follow still fills the space beside Share and More.
- Edit and Share use `rounded-lg`; More already used that geometry and now retains it. Header actions retain their 44px targets through their own component classes and dimensions.
- About topics, Writes About, Interests and full-record topic pills keep their shapes and sizes, with card backgrounds, card borders and soft ink at rest. Interactive topic links use emerald ink, a brand border and a token-derived tint on hover and keyboard focus. Static Interests remain static.
- Publication hover/focus styles target the individual link. Hovering a thumbnail or the row does not recolour the title and comment link together.
- On widths below 768px, the Profile root extends 4px into each side of the shared shell's 20px padding, producing a 16px reading gutter. The compact bar uses matching 16px padding. Desktop widths, grids, gaps and route handling are unchanged; the full record shares the same Profile root.

## Preserved composition and behaviour

The cover, overlapping avatar, writer identity, Selected Work, Intellectual Record, activity chart, Recent Work, About rail, Writes About, Interests, Related Thinkers, tabs and full intellectual-record page remain in place. Sections retain the open editorial layout.

The original ZIP was compared byte-for-byte against the finished project. Outside the listed visual files, documentation, refreshed screenshots and removed font assets, all original files are unchanged. This includes the shared FollowButton, routes, data loaders, Supabase queries, privacy and publication rules, relationship/moderation/share handlers, analytics, content model, database code and package manifests.

## Changed files

| File | Change |
| --- | --- |
| `components/profile/profile.css` | Semantic colours, typography, shared-style cleanup, chips, link hover and scoped mobile gutter. |
| `components/profile/ProfileHeader.tsx` | Edit action radius and semantic hover fill only. |
| `components/profile/ShareButton.tsx` | Share action radius only. |
| `app/layout.tsx` | Remove the unused Profile-only font registration/import. |
| `docs/profile-v3-contract.md` | Update the visual contract. |
| `PROFILE_IMPLEMENTATION_REPORT.md` | Update the typography/palette description and distinguish historical validation from this change. |
| `tests/browser/profile.spec.ts-snapshots/profile-{1440,900,390,320}-linux.png` | Refresh and visually review the four intentional style baselines. |
| This report | Record this change and its validation. |

Removed the unused font binary and licence from `app/fonts/`.

## Validation for this change

Dependencies were installed from the project's unchanged lockfile. These checks actually ran in this workspace:

| Check | Result |
| --- | --- |
| Focused Profile/component/contract tests | **127 passed** across 14 files. |
| `npm run profile:qa` | **22 checks passed**. |
| `npm run typecheck` | **Passed**. |
| `npm run typecheck:all` | **Passed**. |
| ESLint on the three changed TSX files | **Passed**, no errors or warnings. |
| Profile CSS parsing | **Passed**, 268 rules parsed. |
| Existing Profile browser suite | **9 scenarios passed**, using Chromium 153 on Linux; four screenshot baselines refreshed and visually reviewed. |
| Temporary computed-style checks on the development fixture | **18 passed**: shared canvas, fonts, controls, Follow/Following, owner Edit, chip hover/focus, 16px mobile gutter, independent publication-link hover, token changes and the shared full-record shell class. No page errors were observed. |
| Source and archive scope audit | **Passed**; no old palette literals, removed font variable or Profile main-background override remain in active Profile code. |

The browser suite also exercised clipboard sharing, More-menu keyboard focus, sticky tabs, biography/activity interaction, owner/empty/sparse/broken-media states, long text and enlarged-text navigation. Full-record rendering is covered by the focused component tests; the computed-style check verifies its shared shell class rather than a live database-backed record route.

The original implementation report's full build/full-suite results are historical and are not presented as checks rerun for this visual change.
