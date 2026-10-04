# Profile mockup implementation

The project now implements the recommended profile improvements while keeping the application's current Posts and Articles product contract. The existing application navigation and authenticated account flows are retained.

The subsequent visual alignment is documented in [Profile V3 design-system alignment](docs/Profile_V3_Design_System_Alignment_2026-10-04.md), with the checks run for that change. The original mockup validation below is historical.

## Changes

| Recommendation | Implementation |
| --- | --- |
| Header geometry | Cover and identity share the primary column. The avatar overlaps the cover at 108px on desktop and 84px on mobile, with the name alongside it. Profile actions use rounded controls and mobile Follow uses the available width. |
| Typography and palette | The shared Home/Explore canvas and semantic application tokens; Public Sans for interface, metadata and body text; Newsreader for the writer name, headings, Selected Work and publication titles, and the italic headline. Text sizes use rem units to accommodate larger text settings. |
| Selected Work | Articles use a wide 220px desktop / 168px mobile cover, title, excerpt, publication date, stored reading time, and an explicit Read article action. Posts retain a body-first treatment. |
| Recent Work | Author avatar/name and verification, distinct Article/Post presentation, thumbnails where available, and real like/comment/save/share controls. Selected Work is excluded from Recent Work. |
| Sidebar | Desktop context begins beside the cover. About includes a brief bio, structured education, location, public website and join date. Smaller screens place context after the work. |
| Activity and metrics | Numbers appear above their labels. Zero publication months have zero filled height. Month/year/count values are accessible by keyboard and touch. Three metrics stay aligned on mobile. |
| Responsive behaviour | Checks cover 1440, 900, 390 and 320px, long identity text, enlarged text, biography expansion, sticky tabs and keyboard navigation. |
| Selected Work settings | Search all of the owner's published work by title/text, load older pages, deduplicate results, preview the selected publication and preserve selection through searches or errors. Stale selections can still be cleared. |
| Settings quality | Validated website editing uses the existing external URL column. Save is disabled until a section changes; each section retains its independent save/error lifecycle. |
| Data performance | Small database aggregate responses replace Supabase activity/topic scans. Hydration is batched for the bounded publication page. Publication order uses the same date/creation/id keys in the database and renderer. |
| Reliability | One shared public/preview renderer; avatar and cover failures degrade cleanly; existing failing tests and stale TypeScript fixtures are corrected. Visual baselines and SQL permission tests are included. |

## Required database update

Apply `supabase/migrations/20261002193139_profile_mockup_polish.sql` to the project's database through your usual migration deployment process before enabling the new catalogue search in production. For an already-linked Supabase CLI project, the normal command is:

```sh
npx supabase db push
```

The migration adds two publication indexes and three functions:

- `profile_publication_activity`: bounded UTC month aggregates.
- `profile_publication_topics`: normalised, per-publication topic aggregates.
- `search_my_profile_work`: authenticated owner-only, paginated literal substring search.

All three functions use SECURITY INVOKER and an empty search path. Public aggregate reads retain caller RLS and check visible profile identity. The search derives its owner from `auth.uid()` and does not accept an arbitrary profile ID. Aggregate fallback is permitted only while the new function is missing; permission and operational failures remain errors.

No live database migration was applied during this implementation. The migration was executed and tested in an isolated PostgreSQL runtime with representative profiles, publications, RLS policies and anonymous/authenticated roles. Live credentials, storage and production performance should be verified on staging after deployment.

## Original mockup validation (before visual alignment)

- Production build: passed.
- Complete TypeScript check (`npm run typecheck:all`): passed.
- ESLint (`npm run lint`): passed.
- Profile product audit (`npm run profile:qa`): 22 checks passed.
- Vitest: 2,633 tests passed, 197 skipped; 246 test files passed, 15 skipped. Existing credential/environment-gated tests remain skipped.
- Browser verification: nine scenarios, including four responsive visual baselines and the interaction/accessibility states listed above.
- SQL tests cover UTC boundaries under a non-UTC database timezone, zero months, draft exclusion, deduplicated topics, hidden profiles, pagination beyond 50, literal punctuation in search, and catalogue execution privileges.

`tests/browser/profile.spec.ts-snapshots/` contains the reviewed screenshots. `scripts/profile-performance.sql` provides read-only EXPLAIN ANALYZE queries for a representative staging profile; production latency is not inferred from fictional preview data.

## Run locally

```sh
npm ci
# Configure the existing project's environment using .env.example.
npm run dev
```

The real profile remains at `/<username>`. A development-only preview is available at `/dev-preview/profile` and supports `owner=1`, `empty=1`, `sparse=1`, `long=1`, `featured=post`, `cover=0`, `broken=1`, and normal profile tab query parameters.

To run verification:

```sh
npm test
npm run typecheck:all
npm run lint
npm run profile:qa
npm run build
npx playwright install chromium
npm run profile:browser
```

Visual baselines were generated on Linux with Chromium 153. Browser/font/platform differences can require reviewed baseline regeneration with `npm run profile:browser -- --update-snapshots`. `PROFILE_CHROMIUM_PATH` can select an installed Chromium executable.

The preview includes imagery extracted from the supplied mockup; production member data continues to use its stored media URLs. Profile uses the application's registered Public Sans and Newsreader families and does not register a separate interface font.
