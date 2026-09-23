# Writer Profile implementation report

Implemented in the supplied Indegenius source archive, 23 September 2026. This is an implementation in the existing Next.js application, not an embedded HTML conversion. No deployment or remote git push was performed.

## What changed

- The canonical `app/(main)/[username]/page.tsx` now opens on Overview. Public tabs are Overview, About, Articles, Posts; the owner also gets Drafts. Existing `?view=` addresses, legacy `?type=posts/articles` links, archive pagination and not-found/error handling remain in use.
- Overview shows two recent Articles, two recent Posts, the writer's topics and At a glance, in that order. Optional facts disappear when missing. At a glance contains Education, Location and Joined, never a duplicate current role.
- The profile uses a 740px reading column, warm background and borders, a 76px avatar, a 31px Newsreader name, Newsreader editorial headings and Article titles, and Public Sans UI and Post text. Fonts load through the existing Next.js font architecture. Bodoni is not used in profile content; the existing brand wordmark retains it. Typography on unrelated content screens was not redesigned.
- Header headline and bio now render separately. Bio expansion is offered only when the rendered text exceeds three lines. Identity verification renders only from the stored verified flag, with the exact accessible label “Identity verified by Indegenuis”. No prestige labels or credential claims were introduced.
- Owner actions use the existing profile settings route and sharing. Visitor actions reuse Follow and the existing Report/Block controls. The More popover includes Share profile and Copy profile link, closes with Escape or an outside click, and returns keyboard focus on Escape. Sharing strips tab/pagination state from the copied profile URL.
- The compact profile bar uses IntersectionObserver. Desktop/tablet place name, tabs and the primary action in one row; mobile uses two rows. It tracks the existing application chrome offset, including the application's existing hide/reveal-on-scroll behaviour.
- About uses a flat editorial layout with a sticky desktop section index, full bio, education, validated existing external website, interests and joined date. The external link accepts only HTTP(S), rejects credentials and unsafe schemes, opens securely, and is labelled EXTERNAL.
- Article/Post archives remain database-backed and paginated. Posts never display titles, even if a legacy row contains one. Article reading time uses the existing stored word count at the application's 200-words-per-minute convention. Rows reuse the existing cover/media and publication-detail components.
- Drafts use real owner-only data, correct Article/untitled Article/Post labels and safe excerpt previews. Existing edit/delete actions and confirmation remain in place; failed deletion now preserves the row and shows an error.
- The existing shared shell now has a 176px labelled desktop rail above 1024px, a 56px icon rail from 768px, and a 64px desktop/tablet or 52px mobile utility header. Navigation destinations, search, guest behaviour and existing mobile bottom navigation remain intact. Active rail links have a slim indicator; Write remains the prominent filled rail action. Profile-active matching still uses the authenticated user's own username, not the writer being viewed.

## Repository systems reused

Canonical username route and metadata; `getCurrentUser`; Supabase and PostgreSQL read adapters; profile visibility rules; existing follows and user_blocks; FollowButton, ReportButton and BlockUserButton; UserAvatar and PostCover; existing topic taxonomy/routes; existing profile settings; `deleteOwnDraftPosts`; profile funnel events; shared AppShell, SideRail, NavigationShell, NavClient and BottomNav; the existing development-fixture convention and Vitest suite.

The page remains a server component. Only interactive controls, the bio toggle, tabs, section index and sticky behaviour use client components. Independent Overview queries run concurrently. Each Overview query reads at most three rows to return two plus a pagination lookahead. Archives keep their existing page size and database bounds.

## Data and security changes

No migration, table, policy, auth provider, write permission or database schema change was made.

The existing public profile projection adds `profiles.organization_website` in both database adapters. The publication projection adds existing `posts.word_count`; the owner draft projection adds existing `posts.excerpt`. There is no invented profile data on the production route.

Ownership is established by the authenticated server identity. A visitor requesting `?view=drafts` falls back to Overview before draft loading. The repository separately refuses a draft request when the profile and viewer IDs differ. Draft data is not attached to visitor payloads. Existing server-side delete authorization is unchanged. These boundaries are covered by unit/repository tests; live database/RLS execution was not available here.

## Intentional omissions and editing gaps

- **Current role:** there is no separate current-role field in the active profile contract. `professional_title` is explicitly the writer's editable headline. It was not reinterpreted or duplicated as a current position.
- **Experience, affiliations/activities and recognition:** the active writer profile model has no supported history collections for these sections. Retired Intellectual Record/credibility systems were not restored to manufacture them. Sections are omitted rather than populated with examples.
- **External work:** the current schema supports one organisation website URL, not a portfolio/history collection. The stored URL is shown when valid. The current settings form does not edit this legacy website field; settings was not expanded for this task.
- Existing education and location fields remain editable through the current settings form. A single existing education record is shown; no fictional qualifications, dates, employers or institutions were added.
- Report and Block were already supported and were reused, not omitted. They remain unavailable to signed-out visitors until authentication, consistent with the existing app.

## Verification

| Check | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Dependencies installed from the unchanged lockfile |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run test` | 200 test files passed, 15 skipped; 2,265 tests passed, 193 skipped |
| `npm run build` | Passed, including Next.js production TypeScript and static-page generation |
| Responsive Chromium/Playwright checks | 47 of 47 passed, no browser JavaScript errors |
| Production preview-route check | `/dev-preview/profile` returned HTTP 404 under `next start` |
| Git whitespace check with CRLF awareness | Passed; existing source line endings preserved |

The suite includes profile/follow/draft behaviour, archive query boundaries, visitor draft refusal, verification states, existing navigation and server mutation tests. New checks cover Overview composition, unsafe external URLs, titleless legacy Posts, reading time, manual keyboard tab navigation, draft deletion cancellation/failure/success and canonical clipboard URLs. Older design assertions were updated only where this brief intentionally supersedes the previous tab order, verification presentation, approved external-link projection or rail geometry. Retired-product and private-data protections remain in place.

Browser checks rendered actual production components through the existing development-preview pattern, using isolated fictional fixtures rather than a connected database. They covered 1440px, 900px and 390px, long names/usernames, populated/empty Article/Post/Draft states, sparse About, short/long bio, verification, Follow/Following presentation, URL navigation/refresh/back, compact profile rows, More-menu closing/focus, About index navigation, widths and overflow. Mutating requests were blocked during these visual checks. Follow/report/block and real storage/database mutations were not exercised against a live account.

The initial browser pass identified a missing compiled width utility. The reading-width constraint was moved into the profile stylesheet and all 47 checks then passed. The final screenshots were inspected alongside the supplied reference. They show the implemented component layout, not a claim of exact pixel identity with the reference's different sample content.

**Build notes:** the environment has no Supabase admin credentials. The existing sitemap code logged its fallback to static routes, while the build completed successfully. The existing Browserslist-age and edge-runtime notices were non-fatal. The 193 skipped tests include environment-gated live database checks; they must not be counted as passing live integration tests.

## Review and run

The ZIP contains the full updated source tree, this report, `docs/Writer_Profile_Implementation.patch`, and screenshots plus machine-readable browser results under `docs/writer-profile-verification/`.

Use `npm ci`, configure your normal environment from `.env.example`, then run the project's existing development/build commands. Do not replace your deployment secrets with example values. To review only the implementation against the original uploaded source, inspect the patch. No remote repository was supplied, so no branch was pushed or deployment performed.

For visual review without a database, run `npm run dev` and open `/dev-preview/profile`. Optional query parameters are `owner=1`, `view=about|articles|posts|drafts`, `empty=1`, `sparse=1`, `following=1`, and `long=1`. This route is gated out of production. The preview deliberately uses guest global navigation; own-profile global navigation is covered by the existing route-matching tests, not represented as a real authenticated session in the preview.

## Git diff summary

Compared with a local baseline made from the untouched uploaded archive:

44 files changed, 833 insertions(+), 462 deletions(-).

The baseline is local only. No unrelated history, remote branch or user commit was reset or rewritten. The ZIP excludes dependency/build caches and the temporary local Git database.

## Exact source files changed or added

- `app/(main)/AppShell.test.tsx`
- `app/(main)/AppShell.tsx`
- `app/(main)/NavClient.tsx`
- `app/(main)/SideRail.test.tsx`
- `app/(main)/SideRail.tsx`
- `app/(main)/[username]/loading.tsx`
- `app/(main)/[username]/page.tsx`
- `app/dev-preview/profile/PreviewFrame.tsx`
- `app/dev-preview/profile/page.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `components/profile/AboutSectionIndex.tsx`
- `components/profile/IdentityVerification.tsx`
- `components/profile/ProfileAbout.tsx`
- `components/profile/ProfileBio.tsx`
- `components/profile/ProfileDraftList.tsx`
- `components/profile/ProfileExperience.test.tsx`
- `components/profile/ProfileFacts.tsx`
- `components/profile/ProfileHeader.test.tsx`
- `components/profile/ProfileHeader.tsx`
- `components/profile/ProfileOverview.tsx`
- `components/profile/ProfilePublicationList.tsx`
- `components/profile/ProfileTabs.test.tsx`
- `components/profile/ProfileTabs.tsx`
- `components/profile/ProfileWorkLink.test.tsx`
- `components/profile/ShareButton.tsx`
- `components/profile/StickyProfileBar.tsx`
- `components/profile/profile.css`
- `components/ui/FollowButton.tsx`
- `lib/db/postgres/profiles.test.ts`
- `lib/db/postgres/profiles.ts`
- `lib/db/profilePage.ownerDrafts.test.ts`
- `lib/db/profilePage.ts`
- `lib/db/supabase/profiles.test.ts`
- `lib/db/supabase/profiles.ts`
- `lib/db/types.ts`
- `lib/devFixtures/profileFixtures.ts`
- `lib/profileIdentity.ts`
- `lib/profileLayout.ts`
- `lib/profileTabs.test.ts`
- `lib/profileTabs.ts`
- `lib/profileViewData.test.ts`
- `lib/profileViewData.ts`
- `lib/simpleWriterProfile.test.ts`

Additional deliverables: `docs/Writer_Profile_Implementation_Report.md`, `docs/Writer_Profile_Implementation.patch`, and the verification evidence folder described above.
