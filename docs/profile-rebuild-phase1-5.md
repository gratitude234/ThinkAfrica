# Profile rebuild, Phase 1.5

Visual verification pass over the Phase 1 identity shell, against the approved
standalone mockup. Companion to
[`profile-rebuild-phase1.md`](./profile-rebuild-phase1.md) and
[`profile-rebuild-audit.md`](./profile-rebuild-audit.md).

**Phase 2 was not started.** No schema was touched, no migration was written,
no tab was built.

---

## 1. Was browser rendering performed

**Yes, in a real browser, on the real page, with real production data.**

It took three passes to get there, and the first two are worth recording
because they were the only options while the database was unavailable:

1. **Component render, repo fixtures.** The real `ProfileHeader` component
   rendered through the repo's existing Vitest/Testing Library setup, its
   markup styled by the actual `next build` stylesheet and photographed in
   headless Chrome. This is what produced the six state variants.
2. **Live dev server, no data.** `next dev` served the route, but every
   Supabase query returned Cloudflare 522 after 92 seconds, so `/[username]`
   resolved to the app's 404.
3. **Live production server, real data.** The database recovered mid-pass.
   `next build && next start` on port 3124, real profiles, five viewports.
   This is what the final screenshots are.

No npm dependency was added. No database record was created. No fake profile
was seeded. The capture harness was a temporary file, deleted after each run;
`git status` confirms nothing of it remains.

---

## 2. Tools

| | |
|---|---|
| Browser | Google Chrome 152.0.7977.76, `--headless=new` |
| Driver | Chrome's own CLI (`--screenshot`, `--dump-dom`, `--virtual-time-budget`, `--enable-logging=stderr`) |
| Servers | `next dev -p 3123` and `next start -p 3124`, Next.js 16.2.4 |
| Measurement | An injected DOM probe reporting `scrollWidth` and every element crossing the viewport edge |

Playwright, Puppeteer and Cypress are **not** installed and no e2e or visual
config exists in the repo. Chrome was already on the machine, so nothing was
installed to do this.

**One finding about the tooling itself, because it nearly produced a false
bug report.** Headless Chrome on Windows clamps its window to roughly 500 CSS
pixels wide. `--window-size=320` renders at 504px and crops the image to 320,
which looks exactly like content overflowing its container. The first 320px
screenshot showed a clipped meta line and I was about to "fix" a layout that
was not broken. Every sub-500px viewport in this report was therefore rendered
inside an `<iframe>` of the exact width, which gives the inner document a true
viewport. The probe confirms `innerWidth=320`.

---

## 3. Routes and profiles inspected

Real accounts, chosen to cover states that actually exist in the data:

| Profile | State it covers |
|---|---|
| `/mofope` (Mofopefoluwa Idowu) | The full state: cover image, avatar, bio, affiliation, verified, 63 followers, 45 following, 3 topics, 7 publications |
| `/chidiokeke` (Chidi Okeke) | The empty state: no cover, no avatar, no bio, no affiliation, 0 followers, 0 following, no topics, no record |
| `/adesinaoreoluwa1301` (Ikeade Oreoluwa) | Verified with a bio and avatar but no cover |
| `/mofope/record` | Confirms the record view still renders after the Phase 1 header change |
| `/mofope/followers` | The Phase 1 bug fix, on real data |
| `/explore` | A route this work never touched, used as the control |

Component-level states, from the fixtures already in `ProfileHeader.test.tsx`:
visitor, owner, anonymous, verified with a positioning statement and an
opportunity badge, a 52-character name with a 39-character handle, and a
profile with nothing filled in.

---

## 4. Viewports

320, 360, 768, 1024 and 1440, for every state above.

**No horizontal overflow anywhere.** The probe checked every element in the
document against the viewport edge at each width and reported zero, for every
state including the long-name one.

---

## 5. Comparison against the mockup

### Overall impression

It now reads as a writer's identity page. Cover, then a serif name, then a
quiet metadata line, then the person's own words, then the subjects they write
about, set in the display face. The character is recognisably the mockup's.

What still separates the two is not styling, it is that the mockup is
showing Phases 3 and 4: tabs, a Selected Work grid, a right rail with About,
Recognition, Interested in and Links. Ours ends after the identity block and
falls into the existing record list. Everything below the header is what
Phase 3 and Phase 4 replace.

### Identity hierarchy

The mandated order renders exactly, in DOM order and visually, at every width:
cover, avatar, name and verification, handle and descriptor, affiliation and
counts, opportunity state, bio, actions, Writes about.

The bio is materially more important than the platform metrics inside the
identity block. It is 15.5px at 1.62 line height against 13.5px muted
metadata, it sits above the actions, and it is the first thing at full
contrast after the name.

### Typography

Bodoni Moda carries the name (28px on phones, 32px from `sm`) and now also
carries the topics. Inter carries everything else. Descriptor is 14px
semibold; metadata 13.5px muted; bio 15.5px. Line length is capped at the
68ch `max-w-measure`, so at 1440 the bio wraps at roughly 90 characters rather
than running the full 1180px column.

The one typographic change this pass made was the topics, described below.

### Spacing

The header reads as one composed block. Cover to avatar is a 48px overlap
(`-mt-12`, `-mt-14` from `sm`); the grid supplies 12px row gaps on phones and
14px from `sm`; the bio opens at `mt-4` and the topic row at the grid gap. No
stray vertical gaps were visible at any width. The transition into the record
strip is a single rule and a `bg-canvas/70` change, and into the content below
it is the existing section rhythm.

### Actions

Confirmed mismatch, deliberately not fixed. The mockup's actions are outlined
pills, including Follow. Ours are `rounded-lg`, with Follow filled.

`AuthorRelationshipControls` accepts `className` on its wrapper only; the
radius and the fill are set on the button inside it, and there is no prop for
either. There is no profile-specific styling mechanism to use, so per the
instruction this is reported rather than forced. Restyling the shared control
would change the mobile sticky bar, the feed interludes and the V2 variant at
the same time, which is a controlled refactor rather than a QA fix.

Visually it does not clash. The row reads as one group because the heights,
the gaps and the type match; only the corner radius and Follow's fill differ.

### Cover

Kept full bleed. With a real cover image at 1440 it is the strongest thing on
the page and it works, so there was no reason to inset it.

The empty state did need work and got it, below.

### Writes about

This was the largest gap and it is now closed.

The mockup sets the topics as words in the display face with a small count
beside each: `Nigeria 18   Youth 19   Poetry 18`. Phase 1 had shipped the old
green pills with a new heading over them, which is exactly the "renamed
labels" failure mode. They are now 17px `font-display` semibold in ink, with
an 11px muted count, spaced on a 24px gap.

Two supporting changes came out of seeing it on real data. It moved out of the
metadata column into its own grid area after the actions, which is where the
mandated order puts it. And the labels are capitalised through the existing
`formatInterestLabel` helper, because real tags are stored as the author typed
them: the live page was rendering `education policy`, `african culture` and
`nigeria` in a serif display face, which read as a mistake rather than as a
signature. It now reads `Education Policy 3   African Culture 2   Nigeria 2`.
The helper leaves anything already carrying a capital alone, so `pan-African`
survives.

No URL filtering was added. The links are the Phase 1 record links, unchanged.

---

## 6. Problems found

### Fixed this pass

1. **Every avatar-less profile had a white square painted around it.**
   `UserAvatar`'s fallback renders a circular SVG inside a plain `div`, and the
   4px card-coloured border this call site adds was drawn on the square. Highly
   visible on the sparse profile, where the avatar is the only graphic.
2. **A wrapped metadata line began with a separator.** At 320 and 360 the meta
   line broke as `University of Lagos · Nigeria · 128 followers ·` then
   `· 64 following`, and the handle line as `@oluwagbemiga…` then
   `· Political Science student`. A leading `·` reads as a bullet. Separators
   now trail the item they follow.
3. **Writes about was styled as chips and placed before the actions.** Both
   corrected, as described above.
4. **Lowercase topic labels in the display face.** Corrected through the
   existing helper.
5. **The empty cover band was invisible.** Its gradient bottomed out near
   `#FFFFFF` on a white card, so on a profile with no cover image the avatar
   appeared to float over a seam, and the white avatar ring had nothing to sit
   against. It is now a warm `#F1EEE8` to `#E9E5DE` band with a faint emerald
   cast, which is the mockup's placeholder character.
6. **The owner's intellectual-focus prompt outshouted the biography.** It was
   set in brand green at 14px semibold, directly under the bio, making the
   loudest thing in the block a prompt to fill in a field. It is now at the
   weight of the Edit link beside it. This is the same rule as the decision
   that the positioning statement must not compete with the bio.

### Found, deliberately not fixed

7. **`/[username]` fails to render in Turbopack dev mode, and it is not from
   this work.** `TypeError: chunk.reason.enqueueModel is not a function`,
   thrown inside React's Flight client while decoding the `<UserProfilePage>`
   stream.

   Verified by reverting `page.tsx`, `loading.tsx`, `ProfileHeader.tsx` and
   `ProfileIdentityPanel.tsx` to their committed `HEAD` contents and removing
   `error.tsx`, then reloading: **the same error occurs, twice per request, on
   unmodified `main`.** With a cleared `.next` as well. The files were restored
   immediately and `git status` matches what it was before the test.

   It does **not** occur in a production build. `next build && next start`
   renders every profile cleanly, zero errors in the server log. It does not
   occur on `/explore`, `/[username]/record` or `/[username]/followers`, only
   on the profile page itself.

   One thing this pass did change about it: Phase 1's `error.tsx` now catches
   it. On `main` the failure escapes to the `(main)` boundary and the reader
   gets "This page didn't load" with a link to the feed. Now they get "This
   profile didn't load" with Try again, Back to profile and Back to the feed.

8. **`/[username]` answers 404 when the database is unreachable.** While
   Supabase was down, every profile URL rendered "We couldn't find that page."
   `page.tsx` destructures the error away and treats a null profile as
   not-found, which is the same pattern Phase 1 fixed on the follower and
   following pages. An outage should not tell every visitor that the person
   does not exist. Not fixed here because Phase 1.5 is a visual pass; it is a
   one-line error check and belongs at the start of Phase 2.

### Old-profile remnants that now fight the mockup

Identified only. Phases 3 and 4 replace these.

- **The Intellectual Record strip sits directly under the identity block**, as
  a row of large serif numerals under muted labels. It is the "dashboard tiles
  under the identity shell" pattern, it is the loudest thing after the name,
  and the mockup has no equivalent anywhere. On `/mofope` it renders
  `Publications 7` and `Source-backed 1` immediately below the bio.
- **The strip's vocabulary is the evidence vocabulary.** "Publications",
  "Source-backed", "Citable", "Intellectual Record", "Evidence labels", "What
  these mean". The mockup's identity block makes no evidence claims at all.
- **The section below the header is a bare list of record entries** under
  "Latest from their record", where the mockup has Selected Work as a
  three-card grid and then Recent Writing. The `Record` / `Background` pair
  under the strip is also not the mockup's `Overview / Articles / Posts /
  About`.
- **No right rail.** About, Recognition, Interested in and Links have nowhere
  to go yet, so the identity block runs the full 1180px and the page has one
  column where the mockup has two.

None of these were touched.

---

## 7. Corrections made

Six, all inside Phase 1 files, all visual:

| # | Change | File |
|---|---|---|
| 1 | `overflow-hidden rounded-full` on the avatar call site | `ProfileIdentityPanel.tsx` |
| 2 | Separators trail their item instead of leading the next; the handle line routed through the same `MetaLine` helper so both lines share the rule | `ProfileIdentityPanel.tsx` |
| 3 | Writes about moved to its own `topics` grid area after the actions, and set as display-face text rather than chips | `ProfileIdentityPanel.tsx`, `app/globals.css` |
| 4 | Topic labels through `formatInterestLabel` | `ProfileIdentityPanel.tsx` |
| 5 | Empty cover band darkened to a real band | `ProfileIdentityPanel.tsx` |
| 6 | Owner's intellectual-focus prompt demoted to the weight of the Edit link | `ProfileIdentityPanel.tsx` |

Plus the skeleton updated to follow the topics move and the new band colour,
and one test rewritten. The separator test had asserted the old leading-dot
semantics; it now asserts the rule in both directions, that the meta line
neither opens nor closes with a separator, which is what the fix is actually
for.

---

## 8. Files changed in Phase 1.5

| File | |
|---|---|
| `components/profile/ProfileIdentityPanel.tsx` | All six corrections |
| `app/globals.css` | `topics` grid area added to both breakpoints, `.profile-identity-topics` rule |
| `app/(main)/[username]/loading.tsx` | Skeleton follows the topics move and the band colour |
| `components/profile/ProfileHeader.test.tsx` | Separator test rewritten to the trailing rule |

Nothing else. No new files, no deletions, no dependency changes.

---

## 9. Console, runtime and network

**Client console on the live route**, captured with `--enable-logging=stderr`:
clean apart from Next's own `[HMR] connected` and the React DevTools notice.
No application warnings, no hydration mismatch, no 404 for an asset.

**Runtime**: the Turbopack dev RSC error in section 6.7, which predates this
work and does not occur in a production build.

**Network**: one browser advisory, that the avatar image at
`…/storage/v1/object/public/avatars/…` was preloaded via `link preload` but not
used within a few seconds of load. That is Next's image preload racing the
error boundary in dev; it does not appear in the production render.

**Build-time**: `Failed to build /(marketing)/landing/page: took more than 60
seconds. Retrying` appeared on two of four builds and succeeded on retry. It
is a marketing page fetching data at build time while the database was slow,
not a Phase 1 file and not a regression.

**Infrastructure**, for the record: for most of this pass the Supabase project
answered its REST gateway in ~500ms but served no query at all, returning
Cloudflare 522 after 92 seconds on a `select id from posts limit 1`. It
recovered on its own partway through. Nothing was written to it at any point.

---

## 10. Checks

| Check | Result |
|---|---|
| `npm test` | **194 files, 2049 tests, all pass.** The `publicationDeliveryMigration` failure reported in Phase 1 is gone: whoever was editing that file has since updated the assertion |
| `npm run typecheck` | Pass, clean |
| `npm run lint` | Pass, clean, no warnings |
| `npm run build` | Pass, "Compiled successfully in 25.7s", 79/79 pages |
| `npx vitest run components/profile` | 13 files, 91 tests, all pass |
| `git diff --check` on Phase 1 paths | Clean, no whitespace errors |
| Overflow probe, 5 viewports × 6 states | Zero overflowing elements |

Every screenshot listed below is of the corrected state. The pre-fix captures
were replaced after each correction and the production set was retaken after
the final change.

---

## 11. Deliberately deferred

- Pill radius and outlined Follow, per section 5. Needs a controlled refactor
  of `AuthorRelationshipControls`, not a QA edit.
- The Intellectual Record strip and its evidence vocabulary. Phase 3 or 4.
- Selected Work grid, Overview/Articles/Posts/About tabs, right rail,
  Recognition, Interested in, Links. Phases 3 and 4.
- The Turbopack dev RSC error. Pre-existing, production-clean, needs a Next
  issue rather than a change here.
- The 404-on-database-outage behaviour in `page.tsx`. One line, but not visual.
- Unbounded follower and following lists. Acknowledged technical debt, still
  needs a stable cursor and probably schema support. Untouched, as instructed.
- A trailing `·` can now end a wrapped metadata line. It is the better of the
  two available orphans and only appears on the narrowest widths with the
  longest affiliations.

---

## 12. Screenshots

Under
`C:\Users\hp\AppData\Local\Temp\claude\c--dev-Think-Africa\9ab2bcfe-f2a4-4b51-97ab-3699a9a6bd6f\scratchpad\`:

**`shots-prod/`, the real page, real data, production build.** The set that
matters. `mofope-{320,360,768,1024,1440}.png`,
`chidiokeke-{320,360,768,1024,1440}.png`,
`adesinaoreoluwa1301-{320,360,768,1024,1440}.png`.

**`shots-final/`, component states at five viewports each**:
`visitor-*`, `owner-*`, `anonymous-*`, `verified-positioning-*`,
`long-name-*`, `sparse-*`.

**`shots/`, reference and diagnosis**: `mockup-{360,768,1440}.png` (the
approved mockup rendered in the same browser), `live-skeleton-*.png` (the
Phase 1 loading skeleton, served live while the database was down).

**`shots-live/`**: `route-mofope-followers.png` and `route-mofope-record.png`
(both rendering correctly on real data), `route-explore.png` (the control),
and `baseline-head-1440.png` (unmodified `main` hitting the same dev-mode RSC
error, which is what proves it is not ours).

---

## 13. Working tree

**Nothing was staged, committed, stashed, reset or cleaned by this pass.**

Between the Phase 1 report and this one, something outside this work staged the
entire tree: all 252 changed paths now sit in the index. That was not this
session and it has been left exactly as found. This pass's edits therefore
appear as unstaged changes on top of the staged Phase 1 versions, which is why
four paths show `MM`.

Repo-wide: 133 modified, 4 modified-and-restaged, 102 deleted, 13 added, on
`main`. Almost all of it is the concurrent debate-removal and broadcast work.

### `git diff --stat`, Phase 1.5 only

```
 app/(main)/[username]/loading.tsx           |  20 +--
 app/globals.css                             |  18 ++-
 components/profile/ProfileHeader.test.tsx   |  21 ++-
 components/profile/ProfileIdentityPanel.tsx | 223 +++++++++++++++++-----------
 4 files changed, 180 insertions(+), 102 deletions(-)
```

### `git diff --stat HEAD`, Phase 1 and 1.5 together

```
 app/(main)/[username]/FollowButton.tsx      |  64 ----
 app/(main)/[username]/error.tsx             |  83 +++++
 app/(main)/[username]/followers/page.tsx    | 104 +++++--
 app/(main)/[username]/following/page.tsx    |  90 ++++--
 app/(main)/[username]/loading.tsx           |  89 ++++--
 app/(main)/[username]/page.tsx              |   9 +-
 app/globals.css                             |  48 +--
 components/profile/ProfileHeader.test.tsx   | 139 ++++++++-
 components/profile/ProfileHeader.tsx        |  40 ++-
 components/profile/ProfileIdentityPanel.tsx | 455 +++++++++++++++++++---------
 components/profile/ProfilePreview.test.tsx  |   6 +-
 lib/profileRelationships.ts                 |  34 +++
 lib/profileUsername.test.ts                 |  85 ++++++
 lib/profileUsername.ts                      |  31 ++
 tsconfig.check.json                         |  16 +-
```

`app/(main)/[username]/record/page.tsx` also appears in that range; its change
is concurrent work, not this phase.

### `git status`, this phase's paths

```
 D  app/(main)/[username]/FollowButton.tsx
 A  app/(main)/[username]/error.tsx
 M  app/(main)/[username]/followers/page.tsx
 M  app/(main)/[username]/following/page.tsx
 MM app/(main)/[username]/loading.tsx
 M  app/(main)/[username]/page.tsx
 MM app/globals.css
 MM components/profile/ProfileHeader.test.tsx
 M  components/profile/ProfileHeader.tsx
 MM components/profile/ProfileIdentityPanel.tsx
 M  components/profile/ProfilePreview.test.tsx
 A  lib/profileRelationships.ts
 A  lib/profileUsername.test.ts
 M  lib/profileUsername.ts
 M  tsconfig.check.json
```

---

## 14. Phase 2

**Not started.** No migration was written or applied, no schema was touched, no
Articles or Posts tab exists, no `content_kind` work was begun, and the
`profile_record_entries` view is untouched. Migration gate status is still
unresolved and was not inferred from the environment flags.
