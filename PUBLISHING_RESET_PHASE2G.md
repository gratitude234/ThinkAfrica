# Publishing Reset, Phase 2G

## Profile and Onboarding Simplification

Branch `refactor/publishing-reset`. Nothing committed or pushed. Checked 2026-09-15.

## Executive Summary

A writer's profile is now a header and three tabs, Posts, Articles and About, loaded through the existing `loadProfilePublications`. Everything that made it an "Intellectual Record" is gone from the application: the record overview, the full record page (`/username/record` redirects permanently to `/username`), record metrics, evidence labels and legends, Featured Work, the Background rail, "Writes about" topics, the intellectual focus statement, the sticky follow bar, the cover band and the persona taxonomy.

Onboarding went from a four-step identity questionnaire to two steps: a display name and a username, with an optional photo and bio, then topics, which can be skipped. Profile editing is one page, Edit profile, with three sections: Profile, Topics and Visibility. The profile Command Center, its preview and the legacy settings `ProfileForm` are deleted. AI topic suggestions, the Explore welcome banner and the admin Profile Credibility section are gone.

- 56 files deleted, 15 added, 77 modified.
- Profile database round trips: 11 to 5 signed out and for the owner, 13 to 7 for a signed-in visitor (14 to 8 with author subscriptions on).
- Profile client JavaScript: 442,524 to 416,710 bytes (-5.8%). Edit profile: 467,821 to 395,587 (-15.4%). Onboarding: 322,828 to 309,394 (-4.2%).
- Activation vocabulary: 42 to 30 names. Browser allowlist: 39 to 30.
- Onboarding steps: 4 to 2. Required at onboarding: path, country, school and field or work area and headline, and 3 to 5 topics, down to a display name and a username.
- No database row was changed and no migration was added. Everything the removed features stored is still in the database, unread. See Database deferred.
- typecheck, lint and build pass. Tests: 1 failed (the known baseline) | 2,338 passed | 218 skipped. New failures: 0.

One decision deserves a reviewer's attention: onboarding completion no longer calls `complete_onboarding()`. See Onboarding before and after.

## Public profile before and after

| | Before | After |
|---|---|---|
| Header | Cover band with a lightbox, avatar, name, verified mark, derived identity line ("Political Science student", "Writer on Indegenius"), affiliation, counts, bio with More, intellectual focus line, "Writes about" topics linking into the record, Intellectual Record metrics strip with a legend | Avatar, name, verified mark, @username, the writer's own headline (or the bio when there is none), follower and following counts |
| Actions | Edit profile and Share for the owner; Follow and a menu (Share, Report, Block) for visitors; a sticky follow bar once the header scrolled away | The same actions, without the sticky bar |
| Body | Section nav, Featured Work (with notes and a manager for the owner), "Latest from their record" with evidence chips and a legend, "View full record", Background rail (education, role, more topics, interests, Recognition) | Posts, Articles and About tabs |
| Full record | `/username/record` with filters (all, publications, research), quality filters (source-backed, citable), topic filters and pages | Redirects permanently to `/username` |
| Empty profile | "Your Intellectual Record starts with your first published contribution." plus a Featured Work prompt | "No posts yet." or "No articles yet."; the owner also gets "Write your first Post or Article." |

## Routes

- `/[username]`: Posts (default), `?view=articles`, `?view=about`, with `?page=` on the lists.
- `/[username]/record` and `/[username]/record/loading`: deleted. `next.config.mjs` redirects `/:username/record` to `/:username` with `permanent: true` (308). The query string carries through, so `?type=posts` and `?type=articles` open the matching tab.
- Retired `?view=` values (`overview`, `research`, `responses`, `record`, anything else) open Posts. The page's canonical URL is the tab's own address.
- `/[username]/followers` and `/[username]/following`: unchanged.
- `/api/topic-suggestions`: deleted (404).
- `/explore?welcome=1`: the parameter is ignored; the banner is deleted.
- Build output: 74 routes before, 72 after.

Route checks against a fresh production build on `next start`, signed out. Rows were picked in a read-only transaction and nothing identifying is recorded:

```text
/<u>                                         200  attempts=1 header=yes tabs=yes active=Posts rows=6 retiredCopy=no recordLink=no canonicalToTab=yes hasPostRow=yes hasArticleRow=no follow=yes menu=yes counts=yes
/<u>?view=articles                           200  attempts=1 header=yes tabs=yes active=Articles rows=20 retiredCopy=no recordLink=no canonicalToTab=yes hasArticleRow=yes hasPostRow=no
/<u>?view=about                              200  attempts=1 header=yes tabs=yes active=About rows=0 retiredCopy=no recordLink=no canonicalToTab=yes joined=yes rowsListed=no
/<u>?view=overview                           200  attempts=1 active=Posts canonicalToProfile=yes
/<u>?view=research                           200  attempts=1 active=Posts canonicalToProfile=yes
/<u>?view=responses                          200  attempts=1 active=Posts canonicalToProfile=yes
/<u>?view=record                             200  attempts=1 active=Posts canonicalToProfile=yes
/<u>?type=articles                           200  attempts=1 active=Articles
/<u>/record -> /<u>                          308
/<u>/record?type=posts -> /<u>?type=posts    308
/<u>/record?type=publications&quality=citable -> /<u>?type=publications&quality=citable 308
/<u>/followers                               200  attempts=1
/<u>/following                               200  attempts=1
/<empty>                                     200  attempts=1 header=yes tabs=yes active=Posts rows=0 retiredCopy=no recordLink=no canonicalToTab=yes noPosts=yes ownerPrompt=no checklist=no
/<empty>?view=articles                       200  attempts=1 noArticles=yes
/<research author>?view=articles             200  attempts=1 listsResearch=yes
/<research author> (Posts)                   200  attempts=1 listsResearch=no
/no-such-writer-000000000                    200  notFoundFallback=yes noindex=yes title="Profile not found" header=no
/onboarding -> /login?redirectTo=%2Fonboarding 307
/onboarding?step=identity -> /login?redirectTo=%2Fonboarding%3Fstep%3Didentity 307
/settings/profile -> /login?redirectTo=%2Fsettings%2Fprofile 307
/settings?tab=profile -> /login?redirectTo=%2Fsettings%3Ftab%3Dprofile 307
/me -> (none)                                200  redirectMeta=yes toLogin=yes
/explore?welcome=1                           200  welcomeBanner=no
GET /api/topic-suggestions                   404
POST /api/topic-suggestions                  404
/?guest=1                                    200  attempts=1
/explore                                     200  attempts=1
/landing                                     200  attempts=1
/search?q=policy                             200  attempts=1
Post /post/<slug>                            200  attempts=1
Article /post/<slug>                         200  attempts=1
/topics/<tag>                                200  attempts=1
/dashboard (signed out) -> /login?redirectTo=%2Fdashboard 307
/notifications (signed out) -> /login?redirectTo=%2Fnotifications 307
/bookmarks (signed out) -> /login?redirectTo=%2Fbookmarks 307
/write (signed out) -> /login?redirectTo=%2Fwrite 307
/settings (signed out) -> /login?redirectTo=%2Fsettings 307
```

Reading them:
- **Tabs:** the writer's Posts tab lists only Posts, Articles lists only Articles (20 rows, a full page), and About lists no publications and shows the joined date.
- **Retired views:** every retired `?view=` opens Posts with its canonical URL on the profile, and `?type=articles` opens Articles.
- **Record addresses:** all three answer 308 to the profile with the query string intact.
- **Legacy Research:** the piece is on its author's Articles tab and not on Posts.
- **Empty profile:** it says "No posts yet." and "No articles yet.", and shows a visitor no owner prompt and no checklist.
- **Retired copy:** no response carries record, evidence, featured or cover copy.
- **Unknown username:** it renders `app/not-found.tsx` with the 404 fallback marker and `noindex`. It streams as 200 behind the `(main)` loading boundary, the way the Home redirects do (Phase 2F).
- **Sign-in redirects:** `/onboarding`, `/settings/profile` and `/settings?tab=profile` redirect in `proxy.ts`; `/me` redirects to sign-in from the page.

Supabase was slow while these ran. An earlier pass hit the server's 8-second timeout on most profile, post and feed queries and rendered error boundaries. The checks were repeated once it recovered. Every row above loaded on its first attempt; the unknown username was confirmed from its response markers.

Owner and signed-in visitor states need a session and were not requested over HTTP. They are covered by `components/profile/ProfileHeader.test.tsx`, `components/profile/ProfileWorkLink.test.tsx` and the query-count tests in `lib/profileViewData.test.ts`.

## Intellectual Record

Removed from the application: the overview section and its "Intellectual Record" eyebrow, the record metrics strip and legend (`RecordMetricLegend`, publication, source-backed and citable counts), evidence chips on every row, the full record page, topic chips that linked into record filters, the record preview at the end of onboarding, the onboarding and login-adjacent copy on profile and onboarding surfaces, and the `IntellectualRecordWelcome` banner with its `?welcome=1` handling.

Nothing in `app/`, `components/` or `lib/` reads `profile_record_entries` or calls `get_public_profile_record_summary` (or its v2, which production never had: every profile view used to pay for a failed v2 call before the v1 fallback).

Page metadata no longer says "View X's Intellectual Record". The onboarding page title is "Set up your profile".

Brand copy outside profile and onboarding surfaces is left for a later pass, as the brief scoped: `lib/brand.ts` (`BRAND_PROMISE`, the SEO description), the login page, the landing and About pages, `PublishedToast`, `lib/guestAuth.ts`, the root layout keywords and the Explore description. The account welcome email in `app/(auth)/accountEmailActions.ts` still says "Start your Intellectual Record"; it is transactional auth email and was not touched.

## Record modules deleted

- `lib/intellectualRecord.ts` (evidence labels and the record summary)
- `lib/profileRecord.ts` (record query parsing, filters, qualities, `ProfileRecordSummary`, `buildProfileRecordHref`)
- `lib/profileRecordData.ts` (`loadProfileRecordSummary`, `loadProfileRecordPage`, `loadProfileTopicIndex`)
- `lib/profileRecordMetrics.ts`
- `lib/db/profileRecord.ts` (both adapters) and `lib/db/profileRecord.neon.test.ts`
- `app/(main)/[username]/record/page.tsx` and `loading.tsx`
- `components/profile/ProfileRecordCard.tsx`, `EvidenceLabels.tsx`, `EvidenceLegend.tsx`, `ScrollActiveIntoView.tsx`
- `profileRecordRepository` in `lib/db/readAdapter.ts`; `profile-page` is now one repository behind one switch

Extracted and kept: `formatInterestLabel` (in a trimmed `lib/profileTopics.ts`), used by About. The row layout of `ProfileRecordCard` survives as `ProfilePublicationList`, without evidence, co-author credits or record entry kinds.

## Profile tabs

`lib/profileTabs.ts` owns the tab set, the query parsing, the addresses and the classification.

- **Posts** list `content_kind = 'post'`, or legacy `type = 'blog'` where `content_kind` was never set.
- **Articles** list `content_kind` `article` or `research`, or legacy `essay`, `policy_brief` and `research`. Legacy Research, Policy Briefs and Essays are Articles. The legacy lists are read off `lib/contentModel.ts`, so the mapping exists once.
- A Response is an ordinary publication: it lands on whichever tab its own `content_kind` names.
- `loadProfilePublications` takes a `kind` and hands `publicationBranches` a list of content kinds and legacy types. Both adapters changed together, and the parity and Neon tests use the same filters. Co-authored publications stay listed on the credited writer's profile (LEGACY COMPATIBILITY); the co-authored branch is classified in TypeScript by the same `profilePublicationKind`.
- The publication projection dropped `tags`, `in_response_to`, `citation_id` and `post_reference_counts`, which only fed evidence chips.
- About loads no publications.
- Twenty per page, "Newer" and "Older" as plain links.

Empty states: the brief suggested "No publications yet." That sentence would be untrue on the Posts tab of a writer who publishes only Articles, which is 40 of the 54 publishing writers, so each tab names its own kind. There is no checklist and no percentage.

Default tab: Posts, the first tab. Production has more Articles than Posts (141 to 68 published), and 21 of 54 publishing writers have no Posts, so for them the profile opens on an empty tab with Articles one tap away. Choosing the tab from the data would cost a query on every view; flipping the default is a one-line change in `lib/profileTabs.ts` if that tradeoff reads differently.

## Header

`components/profile/ProfileHeader.tsx` renders the avatar, the display name (the username when there is none), the verified mark, @username, the writer's headline or else a three-line bio, the two counts as links, and the actions. Owners get Edit profile and Share. Visitors get Follow and a menu with Share, Report and Block. A blocked visitor sees only the menu. `ProfileViewTracker` stays.

Kept deliberately: the verified mark. It is an admin attestation that an account belongs to who it says, still issued from `/admin/verification`; what was removed is the "Recognition" section that dressed it up as an award.

Removed: the cover band (31 profiles have a cover image; the values are kept), `ProfileIdentityPanel`, `ProfileStickyBar`, `ProfileSectionNav`, the record strip, "Writes about", the intellectual focus line, the derived identity line and the grid CSS (`.profile-identity*`, `.featured-rail`) in `app/globals.css`.

## Featured/Pinned work decision

Removed entirely. Production has 3 `profile_featured_posts` rows, all on 1 profile. Keeping it would have meant keeping a 332-line manager, a 289-line settings section, per-piece notes behind their own release flag and a v2 RPC, a featured-work read on every profile view, and an owner-only load of eligible posts, for one member. A simple pin can come back as its own small feature if writers ask for it. The rows, `replace_my_featured_posts` and `replace_my_featured_posts_v2` stay in the database.

## About fields

Bio, headline, location (country), education (field of study, university, graduation year), interests and the joined month. Nothing else. Rows that are empty are not rendered, so no profile shows placeholders; the joined date is always there. Interests that name a platform topic link to it. `created_at` was added to the public identity projection in both adapters for the joined date, selected on the direct path as `to_jsonb(created_at) #>> '{}'` so its text is identical to PostgREST's.

The identity projection also dropped `is_alumni`, `cover_image_url`, `profile_type`, `organization_name`, `organization_website` and `positioning_statement` (with its release gate), in both adapters and in `lib/db/parity.ts`.

## Settings

Edit profile (`/settings/profile`) replaces the Command Center:

| Section | Fields | Saves through |
|---|---|---|
| Profile | photo (saves on upload), name, username, headline, bio, location, university, field of study, graduation year | `saveProfileSection` |
| Topics | the curated topics, plus any older free-text interests, which stay selectable so a save cannot drop them | `saveTopicsSection` |
| Visibility | public or members only, directory listing | `saveVisibilitySection` |

Every section saves through `updateOwnProfile` and its column allowlist, resolves the viewer from the session, and records one `profile_section_saved` event after persistence. There is no preview, no completion percentage and nothing that suggests what to add. The page loads 2 reads, where the Command Center loaded 12 (six domains, a two-query topic index, eligible featured posts twice) plus the record summary RPC. `/settings` itself no longer reads the profile row or the onboarding preference at all; its tabs never showed a profile field.

Deleted: `app/(main)/settings/ProfileForm.tsx` (708 lines, used only by tests), `ProfileCommandCenter.tsx` and its test, `ProfilePreview`, the Identity, Focus, Background and Featured Work sections, `lib/profileCommandCenter.ts`, `lib/profileCommandCenterData.ts` and `saveProfileDetails`.

`/settings?tab=profile` still redirects to `/settings/profile`.

Background field classification:

| Field | Class | Now |
|---|---|---|
| `full_name`, `username`, `avatar_url`, `bio`, `interests`, profile visibility and directory listing | KEEP | Read and written |
| `professional_title` | OPTIONAL KEEP | The free-text headline |
| `country` | OPTIONAL KEEP | Location on About |
| `university`, `field_of_study`, `graduation_year` | OPTIONAL KEEP | Education on About, optional in Edit profile (graduation years 1950 to 2100, where the old form refused anything before 2015) |
| `profile_type`, `secondary_profile_types` | REMOVE | Neither read nor written |
| `positioning_statement` | REMOVE | Neither read nor written (0 profiles had one) |
| `organization_name`, `organization_website` | REMOVE | Neither read nor written |
| `cover_image_url` (profile) | REMOVE | Neither read nor written; `saveProfileMedia` accepts the avatar only |
| `is_alumni`, `open_to_mentoring` | REMOVE | Neither read nor written |
| `user_onboarding_preferences.current_path`, `work_category` | REMOVE | Neither read nor written |
| ORCID, research methods, opportunity preferences | REMOVE | No application code read them before this phase (checked) |

The composer's `ProfileGate` asks for a name and a username only; `completeProfileGate` no longer writes `university`.

`/me` is the account hub on mobile: the member's avatar, name and handle, a link to their profile, and links to My writing, Bookmarks, Settings and (for admins) Admin; `navItems.tsx` routes the account tab to it. It is kept, because redirecting it to `/username` would strand those links. The only change: a member whose username is unusable is offered "Edit profile" (to `/settings/profile`) instead of "Complete profile" (to `/settings`).

## Persona taxonomy

`lib/profileTypes.ts` (nine persona types and their labels) is deleted, with `ProfileType` in `lib/types.ts`, the persona picker in settings, the student-or-not question and the five work categories in onboarding, the derived "X student" and "Graduate" identity lines, and the category-to-type round trips in `lib/onboarding.ts`. Explore's People suggestions (`lib/suggestedPeople.ts`, `lib/discoverData.ts`) no longer read `get_my_onboarding_state`, the work category or `profile_type`: they rank on shared topics, then a shared university and field when the viewer has stated one, then points. A member who wants a line under their name writes a headline.

180 profiles still hold a `profile_type` and 94 hold secondary types. The values and the table's CHECK constraints are untouched.

## Onboarding before and after

| | Before | After |
|---|---|---|
| Steps | path (student or not), identity, topics, record preview | profile, topics |
| Required | a path; a country; a school and a field of study, or a work area and a professional headline; 3 to 5 topics | a display name and a username |
| Optional | graduation year, organisation | photo, bio, topics ("Skip for now") |
| Reads on load | profile, private profile, onboarding preference, record summary (4) | profile, private profile (2) |
| Writes | four identity RPCs, including the onboarding preference and `profile_type` | `updateOwnProfile` for name, username and bio; `updateOwnProfile` for topics; completion |
| Finish | "Publish your first idea" to `/write?returnTo=/?welcome=1`, or "Explore ideas first" to `/explore?welcome=1` | Home (`/`) |

**Completion.** `complete_onboarding()` in production refuses to finish unless the member has an onboarding path, a country, 3 to 5 topics and that path's school or work fields; the production definition was read from the catalogue. Calling it from the new flow would fail every member who took it. Redefining it would be a migration, and a migration the flow depended on would break signup completion for as long as a deploy ran ahead of it, which the brief rules out.

So `lib/onboardingCompletion.ts` completes onboarding through the service role. The trigger `guard_onboarding_measurement_fields()`, which rejects any change to the completion columns by the `authenticated` role, is unchanged and still stops a browser from marking itself done. `protect_profile_privileged_columns()` applies the same `authenticated` condition. The function authorizes explicitly, in the project's order:

1. The server action resolves the viewer from the session; no id is accepted from the caller.
2. It reads that member's own row and checks the rule against what is stored, not what was sent.
3. It updates `onboarding_completed` and `onboarding_completed_at` only, where `id` is the viewer and the flag is not already true, reads back the affected rows, and treats a lost race as success.
4. It records `onboarding_completed` on the server (`measurement_version: 3`).

`onboarding_completed_at` is what the Phase 0 baseline counts from, so the measurement stays continuous. `complete_onboarding()` and the three `save_onboarding_*` functions stay in the database, unused, for the cleanup phase.

An onboarding tab left open across the deploy calls server action ids that no longer exist and gets an error; a refresh loads the new flow and resumes.

## Mid-onboarding compatibility

Production on 2026-09-15, read-only aggregates only: 266 profiles, 165 completed, **101 incomplete** (16 created in the last 30 days, 63 in the last 90). All 101 already have a name and a username. Where they stopped under the retired rules:

| Retired step | Members |
|---|---|
| path | 80 |
| identity | 13 |
| topics | 7 |
| record | 1 |

Only 3 of the 101 had the 3 to 5 topics the old completion required; 15 had any.

Every one of them can now finish in two taps. `proxy.ts` still sends an incomplete member to `/onboarding`, which opens the profile step prefilled with their name, username, photo and bio, then topics prefilled with any curated topics they chose. Old step links map onto the new steps (`LEGACY_ONBOARDING_STEPS`): `path`, `identity` and `persona` open the profile step, and `interests`, `record` and `follow` open topics once the name and username stand. Nothing was written to their rows by this phase, and nothing they stored under the old flow is cleared by the new one.

## Topics

A simple picker in both places. Onboarding offers the 14 curated topics, any number, and "Skip for now". Edit profile offers the same list plus any free-text interests already stored. The 3 to 5 rule is gone from the application; `save_onboarding_topics()` still enforces it in the database, and nothing calls it.

## AI topic suggestion status

Deleted: `app/api/topic-suggestions/route.ts` and its test, `lib/topicSuggestions.ts`, `lib/geminiTopicSuggestions.ts` and their tests, `isAiTopicSuggestionsEnabled`, and the `GEMINI_TOPIC_MODEL` and `NEXT_PUBLIC_AI_TOPIC_SUGGESTIONS_ENABLED` entries in CLAUDE.md. No UI called the route. `ai_topic_suggestion_quotas` (29 rows) and `claim_ai_topic_suggestion_quota()` are DATABASE DEFERRED. The historic `ai_topic_suggestion_*` activation rows (159) are untouched.

## Activation analytics

42 names to 30; the browser allowlist from 39 to 30, so the two lists are now identical.

Removed with no replacement:

- `profile_recognition_opened`, `profile_recognition_source_opened`, `profile_expertise_topic_opened`, `profile_brief_viewed`, `profile_brief_work_opened`, `profile_brief_contact_started` (production had never recorded any of these)
- `profile_command_center_viewed` (13 historic rows), `profile_preview_opened` (1), `profile_feature_note_saved` (0)
- `ai_topic_suggestion_requested`, `ai_topic_suggestion_succeeded`, `ai_topic_suggestion_failed`, which the deleted route recorded

Kept: `profile_viewed`, `profile_work_opened` and `profile_follow_completed` (the funnel in `lib/profileFunnel.ts`, now with surfaces `profile_header`, `profile_posts` and `profile_articles`, and work kinds `post` and `article`), `profile_section_saved` as the profile-saved event, and the onboarding events. `next_action_clicked` is no longer sent from onboarding, but the notification bell still sends it.

`lib/profileOwnerAnalytics.ts` is deleted; `useSectionSave` sends `profile_section_saved` itself. `ProfileViewTracker` is kept as it was: 46 lines, one event, fired after render so prefetches and crawlers are not counted. The tradeoff is that there is no longer any signal for opening the editor or a preview, which no longer exist.

## Admin profile analytics

The Profile Credibility section is gone from `/admin/analytics` (Complete Profiles, Partial Academic Profiles, Verified Profiles, Featured Work Profiles, Citable Author Profiles, Reviewed Author Profiles, Published Profiles), with the `profile_featured_posts` count query it needed, the citable and reviewed author sets and the `isFormallyReviewed` import. The page's 10,000-row profile read is now `id, created_at`, which is all the remaining cards use. Published authors still feed Platform Health. Editorial Trust is untouched: it belongs to Phase 2A's retired review workflow and was not in this brief.

## Query-count performance

Database round trips for one profile view, Supabase adapter, a profile with published work:

| Viewer | Before (overview) | After (Posts or Articles) | After (About) |
|---|---|---|---|
| Signed out | 11 | 5 | 3 |
| Signed-in visitor | 13 (14 with author subscriptions on) | 7 (8) | 5 (6) |
| Owner | 11 | 5 | 3 |

Before: the identity row twice (once for metadata, once for the page), two relationship counts, the record summary twice (a v2 attempt production does not have, then v1), record entries, record hydration, featured work, and a two-query topic scan. A visitor added their follow and block state, plus subscription state with the flag. The page also called `supabase.auth.getUser()` directly beside the memoised session read.

After: the identity row once, two relationship counts, and one page of the tab (owned and co-authored branches). A visitor adds follow and block state. The session read is the memoised `getCurrentUser()` only.

How this was measured. "Before" ran the real pre-2G loaders, generateMetadata's identity lookup then `loadProfileView` for the overview, against a counting client in a temporary test that was deleted after it ran. "After" is pinned by `lib/profileViewData.test.ts` ("what a profile view reads"). Sharing one identity lookup between `generateMetadata` and the page is React's per-request `cache()`, which the unit tests cannot observe; it is by construction rather than separately measured.

Other surfaces: Edit profile 12 reads plus an RPC to 2; onboarding load 4 to 2; `/settings` 3 to 1.

Client JavaScript, from each route's client reference manifest in the production build, captured from the pre-2G build before it was replaced:

| Route | Before | After |
|---|---|---|
| `/[username]` | 442,524 bytes, 6 chunks, 52 client module references, 14 application client modules | 416,710 bytes (-5.8%), 6 chunks, 46 references, 11 modules |
| `/settings/profile` | 467,821 bytes, 7 chunks, 40 references, 8 modules | 395,587 bytes (-15.4%), 6 chunks, 44 references, 10 modules |
| `/onboarding` | 322,828 bytes, 4 chunks, 32 references, 4 modules | 309,394 bytes (-4.2%), 4 chunks, 32 references, 4 modules |

Edit profile's module count rose because its three sections are now separate client modules where the Command Center was one boundary; the bytes fell by 72 KB.

## Database deferred

Kept in the database with their values, and unread and unwritten by the application:

- **Record:** the `profile_record_entries` view, `get_public_profile_record_summary()`.
- **Featured work:** `profile_featured_posts` (3 rows, 1 profile, including `feature_note`), `replace_my_featured_posts()`, `replace_my_featured_posts_v2()`.
- **Onboarding:** `user_onboarding_preferences` (44 rows), `complete_onboarding()`, `save_onboarding_path()`, `save_onboarding_identity()`, `save_onboarding_topics()`, `save_onboarding_preferences()`, `get_my_onboarding_state()` and their `private.*_impl` twins.
- **Persona and research-profile columns on `profiles`:** `profile_type` (180 set), `secondary_profile_types` (94), `positioning_statement` (0) with its CHECK, `organization_name` (10), `organization_website` (1), `cover_image_url` (31), `is_alumni` (0), `open_to_mentoring` (24).
- **AI topics:** `ai_topic_suggestion_quotas` (29 rows), `claim_ai_topic_suggestion_quota()`.
- **Profile analytics data:** historic `activation_events` rows for the removed names.
- `profile_type` and `secondary_profile_types` CHECK constraints; the self-editable column allowlist in `lib/profileMutations.ts` and `lib/profilePrivilegeGuard.ts`, which mirrors the database trigger and is pinned to it by a test.

`guard_onboarding_measurement_fields()` stays and matters: it is what keeps completion off the browser. Reserved usernames from retired routes stay reserved.

## Files

- **Deleted: 56** (22 of them test files).
- **Added: 15.**
- **Modified: 77.**

Deleted:

- `app/(main)/[username]/record/page.tsx`
- `app/(main)/[username]/record/loading.tsx`
- `app/(main)/[username]/actions.ts`
- `components/profile/EvidenceLabels.tsx`
- `components/profile/EvidenceLabels.test.tsx`
- `components/profile/EvidenceLegend.tsx`
- `components/profile/FeaturedWork.tsx`
- `components/profile/FeaturedWork.test.tsx`
- `components/profile/FeaturedWorkManager.tsx`
- `components/profile/FeaturedWorkManager.test.tsx`
- `components/profile/ProfileBackground.tsx`
- `components/profile/ProfileBackground.test.tsx`
- `components/profile/ProfileIdentityPanel.tsx`
- `components/profile/ProfilePreview.tsx`
- `components/profile/ProfilePreview.test.tsx`
- `components/profile/ProfileRecordCard.tsx`
- `components/profile/ProfileRecordCard.test.tsx`
- `components/profile/ProfileSectionNav.tsx`
- `components/profile/ProfileStickyBar.tsx`
- `components/profile/ProfileStickyBar.test.tsx`
- `components/profile/ScrollActiveIntoView.tsx`
- `components/ui/IntellectualRecordWelcome.tsx`
- `components/ui/IntellectualRecordWelcome.test.tsx`
- `lib/intellectualRecord.ts`
- `lib/intellectualRecord.test.ts`
- `lib/profileRecord.ts`
- `lib/profileRecord.test.ts`
- `lib/profileRecordData.ts`
- `lib/profileRecordData.test.ts`
- `lib/profileRecordMetrics.ts`
- `lib/profileRecordMetrics.test.ts`
- `lib/profileCommandCenter.ts`
- `lib/profileCommandCenter.test.ts`
- `lib/profileCommandCenterData.ts`
- `lib/profileOwnerAnalytics.ts`
- `lib/profileOwnerAnalytics.test.ts`
- `lib/featuredWork.ts`
- `lib/featuredWork.test.ts`
- `lib/topicSuggestions.ts`
- `lib/topicSuggestions.test.ts`
- `lib/geminiTopicSuggestions.ts`
- `lib/geminiTopicSuggestions.test.ts`
- `lib/profileTypes.ts`
- `lib/profileZeroStates.test.ts`
- `lib/profilePositioningStatement.test.ts`
- `lib/db/profileRecord.ts`
- `lib/db/profileRecord.neon.test.ts`
- `app/api/topic-suggestions/route.ts`
- `app/api/topic-suggestions/route.test.ts`
- `app/(main)/settings/ProfileForm.tsx`
- `app/(main)/settings/profile/ProfileCommandCenter.tsx`
- `app/(main)/settings/profile/ProfileCommandCenter.test.tsx`
- `app/(main)/settings/profile/sections/IdentitySection.tsx`
- `app/(main)/settings/profile/sections/FocusSection.tsx`
- `app/(main)/settings/profile/sections/BackgroundSection.tsx`
- `app/(main)/settings/profile/sections/FeaturedWorkSection.tsx`

Added:

- `lib/profileTabs.ts`
- `lib/profileTabs.test.ts`
- `lib/onboardingCompletion.ts`
- `lib/onboardingCompletion.test.ts`
- `lib/profileSettings.ts`
- `lib/profileSettings.test.ts`
- `lib/profileSettingsData.ts`
- `lib/simpleWriterProfile.test.ts`
- `components/profile/ProfileTabs.tsx`
- `components/profile/ProfilePublicationList.tsx`
- `components/profile/ProfileAbout.tsx`
- `app/(main)/settings/profile/ProfileSettings.tsx`
- `app/(main)/settings/profile/ProfileSettings.test.tsx`
- `app/(main)/settings/profile/sections/ProfileSection.tsx`
- `PUBLISHING_RESET_PHASE2G.md`

Modified:

- `CLAUDE.md`
- `app/(main)/[username]/loading.tsx`
- `app/(main)/[username]/page.tsx`
- `app/(main)/[username]/publicReadPath.test.ts`
- `app/(main)/admin/analytics/page.tsx`
- `app/(main)/explore/page.tsx`
- `app/(main)/me/page.test.tsx`
- `app/(main)/me/page.tsx`
- `app/(main)/settings/page.tsx`
- `app/(main)/settings/profile/SectionShell.tsx`
- `app/(main)/settings/profile/actions.ts`
- `app/(main)/settings/profile/loading.tsx`
- `app/(main)/settings/profile/page.tsx`
- `app/(main)/settings/profile/sections/TopicsSection.tsx`
- `app/(main)/settings/profile/sections/VisibilitySection.tsx`
- `app/(main)/settings/profile/useSectionSave.ts`
- `app/(main)/settings/profileActions.ts`
- `app/(onboarding)/layout.tsx`
- `app/(onboarding)/onboarding/OnboardingClient.tsx`
- `app/(onboarding)/onboarding/actions.ts`
- `app/api/activation/route.ts`
- `app/globals.css`
- `components/profile/ProfileHeader.test.tsx`
- `components/profile/ProfileHeader.tsx`
- `components/profile/ProfileWorkLink.test.tsx`
- `components/profile/profileFollowFunnel.test.tsx`
- `components/ui/ProfileGate.tsx`
- `docs/profile-command-center.md`
- `lib/academicIdentity.ts`
- `lib/activationEvents.ts`
- `lib/browserWriteBoundary.test.ts`
- `lib/db/parity.live.test.ts`
- `lib/db/parity.test.ts`
- `lib/db/parity.ts`
- `lib/db/postgres/profiles.test.ts`
- `lib/db/postgres/profiles.ts`
- `lib/db/profilePage.neon.test.ts`
- `lib/db/profilePage.parity.live.test.ts`
- `lib/db/profilePage.ts`
- `lib/db/profileVisibility.neon.test.ts`
- `lib/db/readAdapter.ts`
- `lib/db/supabase/profiles.test.ts`
- `lib/db/supabase/profiles.ts`
- `lib/db/types.ts`
- `lib/discoverData.ts`
- `lib/featureFlags.ts`
- `lib/identityFirstOnboardingMigration.test.ts`
- `lib/intellectualProfileV2Migration.test.ts`
- `lib/onboarding.test.ts`
- `lib/onboarding.ts`
- `lib/onboardingActions.ts`
- `lib/onboardingIdentityAlignment.test.ts`
- `lib/phase0MeasurementMigration.test.ts`
- `lib/profileFunnel.test.ts`
- `lib/profileFunnel.ts`
- `lib/profileIdentity.ts`
- `lib/profileLayout.ts`
- `lib/profileTopics.test.ts`
- `lib/profileTopics.ts`
- `lib/profileViewData.test.ts`
- `lib/profileViewData.ts`
- `lib/retiredProductFamilies.test.ts`
- `lib/retiredResponseProduct.test.ts`
- `lib/serverActionContract.test.ts`
- `lib/suggestedPeople.test.ts`
- `lib/suggestedPeople.ts`
- `lib/types.ts`
- `next.config.mjs`
- `scripts/migration/comments-parity.mjs`
- `scripts/migration/feed-parity.mjs`
- `scripts/migration/neon-verify.mjs`
- `scripts/migration/profile-parity.mjs`
- `scripts/migration/read-registry.mjs`
- `scripts/migration/search-parity.mjs`
- `scripts/migration/viewerdomains-parity.mjs`
- `scripts/migration/viewerstate-parity.mjs`
- `tsconfig.check.json`

## Tests

Added:

- `lib/simpleWriterProfile.test.ts`: the guard. It fails if a retired module, route or release gate comes back, if a profile, onboarding or settings surface uses record, evidence, credibility or completion language, if a profile surface reads a retired column, if anything reads the record, featured work, onboarding preference or topic quota data or calls the retired RPCs, if the record redirect stops being permanent, if the profile page gains an import, if onboarding asks for a school, a persona or a country, if Edit profile gains a section, if the activation vocabulary and allowlist drift apart or away from 30, or if Profile Credibility returns. It reads no SQL migration.
- `lib/onboarding.test.ts` (rewritten): the onboarding step-set contract, the retired-step mapping and resumption rules, and the profile step's rule.
- `lib/onboardingCompletion.test.ts`: completion writes only the two completion columns, to the viewer's row, only when the stored name and username stand, is idempotent, handles a lost race and never reports an outage as an incomplete profile.
- `lib/profileTabs.test.ts`: tabs, legacy view and type handling, addresses, and Post and Article classification including legacy Research.
- `lib/profileSettings.test.ts` and `app/(main)/settings/profile/ProfileSettings.test.tsx`: three sections, no retired fields, save states, the saved event after persistence, and username validation.

Rewritten or updated: `components/profile/ProfileHeader.test.tsx`, `ProfileWorkLink.test.tsx` (now also covers `ProfilePublicationList`), `profileFollowFunnel.test.tsx`, `lib/profileViewData.test.ts` (now counts queries per viewer), `lib/profileFunnel.test.ts`, `lib/profileTopics.test.ts`, `lib/suggestedPeople.test.ts`, `lib/db/supabase/profiles.test.ts`, `lib/db/postgres/profiles.test.ts`, `lib/db/parity.test.ts`, `lib/db/parity.live.test.ts`, `lib/db/profilePage.neon.test.ts`, `lib/db/profilePage.parity.live.test.ts`, `lib/db/profileVisibility.neon.test.ts`, `app/(main)/[username]/publicReadPath.test.ts`, `app/(main)/me/page.test.tsx`, `lib/retiredProductFamilies.test.ts`, `lib/retiredResponseProduct.test.ts`, `lib/serverActionContract.test.ts`, `lib/browserWriteBoundary.test.ts`, and the migration-content tests `lib/identityFirstOnboardingMigration.test.ts`, `lib/intellectualProfileV2Migration.test.ts`, `lib/phase0MeasurementMigration.test.ts` and `lib/onboardingIdentityAlignment.test.ts`, which keep asserting what the migrations guarantee and stop asserting that the application calls them.

Deleted with their modules: 22 test files (listed under Files).

Final sequential run, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`:

| Check | Result |
|---|---|
| typecheck | passed (exit 0) |
| lint | passed (exit 0) |
| tests | Test Files 1 failed | 198 passed | 16 skipped (215); Tests 1 failed | 2338 passed | 218 skipped (2557) |
| build | passed (exit 0); 74 routes before, 72 after |

The only failure is the known baseline: `supabase/migrations/parameterizeIdentityRpcsMigration.test.ts > write paths > check that the row they meant to change existed`. **New failures: 0.**

## Deployment debt

Unchanged from Phase 2F, and not applied:

1. Before deploy: `node scripts/migration/apply-cron-removal.mjs --dry-run`, then `--apply`.
2. Before deploy: `node scripts/migration/apply-daily-brief-cron-removal.mjs --dry-run`, then `--apply`.
3. Deploy.
4. After deploy: `node scripts/migration/apply-messaging-write-disablement.mjs --dry-run`, then `--apply`.
5. The unapplied telemetry migration must be rebased onto `20260915000002` before it is applied anywhere.

Phase 2G adds no migration and no ordering constraint: the new onboarding completes against the database exactly as it is.

## Next phase

**Phase 2H: Subscriptions and Gamification Cleanup.** Separate Follow from the author-subscription plumbing it still carries (`AuthorRelationshipControls` and the profile's viewer relationship still ask about subscriptions), then remove author subscriptions, topic subscriptions, the publication delivery machinery and `/subscriptions`, and remove the leaderboard, points, badges, contribution tiers, and the gamification UI and triggers from application behaviour.
