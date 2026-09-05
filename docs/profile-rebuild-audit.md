# Profile Rebuild Audit

Status: audit only. No code, schema, or migration has been changed.

Scope: the existing Indegenius profile (routes, components, server actions,
libraries, schema, RLS, design system), mapped against the standalone profile
mockup, with a staged implementation plan.

| | |
|---|---|
| Repo | `c:/dev/Think_Africa` |
| Branch | `main` |
| Head | `dd699df` |
| Design reference | `~/Downloads/Indegenius Profile (Standalone) (1) (2).html` (Sep 5, 02:57; latest of four copies) |
| Date | 2026-09-05 |

The mockup is a bundled design-canvas page rather than plain HTML. Its template
and data were extracted from the `__bundler/template` script block so the audit
reads the real structure rather than inferring it from a rendering.

---

## Contents

1. [Existing profile architecture](#1-existing-profile-architecture)
2. [Existing database support](#2-existing-database-support)
3. [Existing publishing architecture](#3-existing-publishing-architecture)
4. [Existing design system](#4-existing-design-system)
5. [Mockup to production mapping](#5-mockup-to-production-mapping)
6. [Owner and visitor states](#6-owner-and-visitor-states)
7. [Implementation architecture](#7-implementation-architecture)
8. [Schema changes](#8-schema-changes)
9. [Risk review](#9-risk-review)
10. [Staged implementation plan](#10-staged-implementation-plan)

---

## 0. The five things that decide this project

### Finding 1: reuse, do not rebuild

There is already a deep, well-reasoned profile here. `components/profile/`
holds 30 files, the identity card is shared between the public page and the
owner's settings preview so the two cannot drift, topics are split into
"demonstrated" versus "declared" on purpose, and the record has its own paged
view and RPC. The mockup is roughly **80% a re-skin plus two genuinely new
sections**, not a rewrite. Replacing this would throw away correctness that was
clearly paid for once already.

### Finding 2: the record view cannot tell an Article from a Post

`public.profile_record_entries` classifies every non-response, non-research
publication as `entry_kind = 'publication'`. The mockup's **Articles tab, Posts
tab, and its "55 publications · 18 articles · 37 posts" line have no data
source**. This is the one hard blocker, and it is also the cheapest thing on the
list to fix: one `CREATE OR REPLACE VIEW`, no new table, no data migration.

### Finding 3: Followers and Following pages are silently broken today

`app/(main)/[username]/followers/page.tsx:25` and `following/page.tsx:25` both
call `.order("created_at")`. The `follows` table has no `created_at` column
(`20260401000000_base_schema.sql:50`). PostgREST rejects the query, neither page
checks `error`, so `data` is null and both pages render "0 following" for
everyone. The mockup puts a **following count in the identity line**, so this
lands in scope whether we want it or not.

### Finding 4: three release gates are unresolved

`positioning_statement`, `feature_note` and the whole credibility graph are each
gated behind an env flag because PostgREST fails a whole `select` that names a
column the database does not have, and that select sits on the public profile.
**We need to know which of those three migrations are applied in production**
before deciding whether the new page can name those columns unconditionally.
Guessing here 404s every profile.

### Finding 5: the mockup quietly proposes a different product

The current profile leads with an evidence vocabulary: Intellectual Record,
Source-backed, Citable, Demonstrated expertise, evidence chips. The mockup leads
with a writer vocabulary: Writes about, Selected work, Recent thoughts,
Intellectual footprint. These are not the same page with different colours.
Section 5 flags every place a decision is being made rather than a style
applied, so the substitution is deliberate rather than incidental.

---

## 1. Existing profile architecture

### Routes

| Path | Role |
|---|---|
| `app/(main)/[username]/page.tsx` | Public profile. Server Component, 640 lines. The whole page |
| `app/(main)/[username]/record/page.tsx` | Full Intellectual Record, paged and filterable |
| `app/(main)/[username]/followers/`, `following/` | Relationship lists (see Finding 3) |
| `app/(main)/[username]/loading.tsx` | Skeleton, currently stale against the header it mirrors |
| `app/(main)/settings/profile/page.tsx` | Owner workspace ("Command Center"), the canonical edit surface |
| `app/(main)/me/page.tsx` | Account hub. Links out; not a profile view |
| `app/(main)/layout.tsx` | `NavigationShell` + `AppShell` + `AppChromeProvider` chrome |

There are **no owner-specific profile routes**. One route serves both, branching
on `isOwnProfile`. That is the right shape and should be kept.

### How a profile renders, step by step

Everything is server-rendered. `page.tsx` executes in four sequential waves:

1. **Wave 1**: `Promise.all` of the profile row and `supabase.auth.getUser()`.
   A missing profile calls `notFound()`.
2. **Wave 2**: `Promise.all` of 9 queries: record summary RPC, first 6 record
   entries, follower count, `talent_profiles`, `profile_featured_posts`, the
   viewer's follow row, author subscription, block row, and
   `researcher_profiles`. Four of those nine are skipped by a resolved promise
   when the viewer is anonymous or is the owner.
3. **Wave 3**: `Promise.all` of 3 more: all owned published posts (for tags),
   all co-authored posts, and the featured post bodies.
4. **Wave 4**: two *sequential* awaits, `getMessageEligibility()` then
   `loadProfileCredibilityGraph()`.

Net cost per visit is roughly **13 to 16 round trips in four serial waves**.
See section 9.

### Components

| Component | Server / Client | Role |
|---|---|---|
| `ProfileHeader.tsx` | Client | Wraps the identity card with relationship behaviour, the More menu, Message, and the inquiry modal |
| `ProfileIdentityPanel.tsx` | Client | The identity card itself: cover, avatar, name, verification, headline, affiliation, positioning, bio, follower count, topic chips, record metrics |
| `ProfileSectionNav.tsx` | Server | Desktop anchor strip: Featured · Record · Background |
| `ProfileStickyBar.tsx` | Client | Mobile-only compact bar via an IntersectionObserver sentinel |
| `FeaturedWork.tsx` | Server | Up to 3 pinned pieces in a swipeable rail |
| `FeaturedWorkManager.tsx` | Client | Owner's picker, dnd-kit sortable |
| `ProfileRecordCard.tsx` | Server | One record entry as a row. Shared verbatim with the record page |
| `ProfileBackground.tsx` | Server | Right rail: education, role, extra topics, interests, research, recognition |
| `DemonstratedExpertise.tsx` | Server | Credibility-gated topic evidence |
| `ProfileRecognition.tsx` | Client | Credibility-gated signals with provenance |
| `AuthorRelationshipControls(.V2).tsx` | Client | Follow plus optional subscribe bell |
| `ContactInquiryModal.tsx` | Client | Opportunity inquiry, writes `talent_inquiries` |
| `EvidenceLabels` / `EvidenceLegend` | Server | The chips and the one legend that explains them |
| `ProfileWorkLink.tsx` | Client | Link that fires a funnel event before navigating |
| `ProfileViewTracker.tsx` | Client | Fires `profile_viewed` |
| `ProfilePreview.tsx` | Server | Renders `ProfileIdentityPanel` with `interactive={false}` inside settings |

### Server actions and libraries

| File | Role |
|---|---|
| `app/(main)/[username]/actions.ts` | `loadMyFeaturedWorkOptions`, `updateProfileFeaturedPosts` |
| `app/(main)/settings/profile/actions.ts` | Per-section profile saves |
| `components/ui/followActions.ts` | `toggleFollow`, `setAuthorSubscription` |
| `components/profile/opportunityInquiryActions.ts` | Inquiry submission |
| `lib/profileIdentity.ts` | `getProfileIdentityLines`: the one derivation of headline / affiliation / positioning |
| `lib/profileTopics.ts` | `deriveDemonstratedTopics`, `deriveDeclaredInterests`, `formatInterestLabel` |
| `lib/profileRecordData.ts` | `server-only`. `loadProfileRecordSummary` / `Page` / `TopicIndex` |
| `lib/profileRecord.ts` | Filters, query parsing, `buildProfileRecordHref`, summary normalisation |
| `lib/profileRecordMetrics.ts` | The three metric definitions and their disclaimer |
| `lib/profileLayout.ts` | `PROFILE_SHELL`, `PROFILE_COLUMNS`, `RECORD_SHELL` |
| `lib/profileFunnel.ts` | Funnel events and surfaces, over `/api/activation` |
| `lib/profileUsername.ts` | `RESERVED_PROFILE_PATHS` and username validation |
| `lib/contentModel.ts` | `resolveContentKind` / `resolveArticleFormat` / `isFormallyReviewed` |
| `lib/messaging.ts` | `getMessageEligibility`, `findOrCreateConversation` |

There are **no custom React hooks** in the profile tree beyond
`useSectionSave.ts` in settings. State is server props plus local `useState`.

> **Dead code.** `app/(main)/[username]/FollowButton.tsx` has no importers. Every
> live caller uses `components/ui/FollowButton.tsx` or
> `AuthorRelationshipControls`. Delete it as part of this work rather than
> porting it forward.

---

## 2. Existing database support

Classification key:

- **EXISTS**: a real column or table
- **DERIVABLE**: computable from what exists
- **PARTIAL**: exists but not in the shape the mockup wants
- **MISSING**: nothing backs it
- **OBSOLETE**: do not use

| Concept | Status | Source of truth | Notes |
|---|---|---|---|
| Display / full name | EXISTS | `profiles.full_name` | Nullable. Falls back to `username` everywhere |
| Username | EXISTS | `profiles.username` unique | Guarded by `RESERVED_PROFILE_PATHS`. That set is missing 5 live segments, see section 9 |
| Avatar | EXISTS | `profiles.avatar_url` | `UserAvatar` falls back to a boring-avatars beam |
| Banner / cover | EXISTS | `profiles.cover_image_url` | `20260425000001`. Already rendered full-bleed with a lightbox |
| Bio | EXISTS | `profiles.bio` | Free text. Clamped to 3 lines with a measured "See more" |
| Role / headline | DERIVABLE | `professional_title`, `profile_type`, `field_of_study`, `is_alumni` | `getProfileIdentityLines()` already produces exactly the mockup's "Law student · Writer" slot |
| Intellectual focus | PARTIAL | `profiles.positioning_statement` | Migration `20260826000001` is **release-gated**. 180 char CHECK. Not in the mockup at all |
| Institution | EXISTS | `university`, `organization_name`, `organization_website` | Three columns; identity line picks organisation over university |
| Location / country | EXISTS | `profiles.country` | Country only. The mockup's "Ede" is a city and has **no column** |
| Verification | EXISTS | `verified` bool, `verified_type` | CHECK: student · researcher · faculty · institution. Backs the mockup's hover tooltip verbatim |
| Followers count | DERIVABLE | `follows` head count on `following_id` | Indexed by `20260425000003`. Already rendered |
| Following count | DERIVABLE | `follows` head count on `follower_id` | Indexed by `20260512000001`. **Not rendered today.** The mockup wants it |
| Follow relationships | EXISTS | `follows(follower_id, following_id)` | Composite PK, self-follow CHECK, RLS on. **No `created_at`**, see Finding 3 |
| Messaging | EXISTS | `find_or_create_conversation()`, `is_blocked_pair()` | `getMessageEligibility()` already gates the button and never discloses a block |
| Interests | EXISTS | `profiles.interests text[]` | Backs the mockup's "Interested in" chips exactly |
| External links | MISSING | only `organization_website` | **No personal website, no LinkedIn.** `talent_profiles.linkedin_url` exists but is an opportunities field behind a dead flag; `researcher_profiles.website_url` is Research |
| Open to opportunities | EXISTS | `talent_profiles.open_to_opportunities` + `visibility` | Three visibilities: public · partners_only · private. Already drives the badge |
| Pinned / featured work | EXISTS | `profile_featured_posts` | Max 3 by CHECK, atomic `replace_my_featured_posts()`. `feature_note` is **release-gated** |
| Topic / tag data | DERIVABLE | `posts.tags text[]` | No topics table on the profile. Ranked by `deriveDemonstratedTopics()`, case-insensitive |
| Articles | EXISTS | `posts.content_kind = 'article'` | Legacy fallback `type IN (essay, policy_brief)` |
| Short posts | EXISTS | `posts.content_kind = 'post'` | Legacy fallback `type = 'blog'`. Title-less by design |
| Publication counts | PARTIAL | `get_public_profile_record_summary()` | Returns publication / source_backed / citable / response / debate / research. **No article vs post split.** Finding 2 |
| Reactions / appreciations | EXISTS | `post_likes` + `post_like_counts` | Counter table, trigger-maintained, no client write. Called "Like" in the product, "Appreciate" in the mockup |
| Comments | EXISTS | `post_comments` + `get_post_comment_counts()` | Deliberately **not** a counter column: the count is per-viewer so RLS keeps hiding moderated rows |
| Responses | EXISTS | `posts.in_response_to` | A Response is a first-class publication, not a comment. It is its own `entry_kind` |
| Read time | DERIVABLE | `posts.word_count` | `20260818000004`, trigger-maintained. `HomeFeedCard` already does `ceil(words / 200)` |
| Recognition | DERIVABLE | `verified`, `is_alumni`, credibility signals | The mockup's Recognition is only "Verified student", which needs no new data |
| Profile visibility | EXISTS | `profiles.privacy_settings` jsonb | `profile_visibility` public / members_only, plus `show_in_directory`. Enforced by RLS via `can_view_profile()` |
| Researcher profile | OBSOLETE | `researcher_profiles` | `FEATURE_FLAGS.research = false`. Do not carry into the new page |
| Talent marketplace fields | OBSOLETE | `cv_url`, `skills`, `opportunity_types` | `talentMarketplace = false`. Keep only `open_to_opportunities` and `visibility` |
| Points / leaderboard | OBSOLETE | `profiles.points` | System-managed. The mockup has no popularity number and should not gain one |
| Open to mentoring | OBSOLETE | `profiles.open_to_mentoring` | Alumni mentorship, dormant. Not in the mockup |

> **Write path constraint.** Any new profile column needs **three** edits, not
> one. `20260815000001_profile_security_hardening.sql` revokes table UPDATE from
> `authenticated`, grants a named column allowlist, and adds
> `protect_profile_privileged_columns()` which *defaults new columns to
> protected*. A column added without touching both allowlists is silently
> unwritable by the owner.

---

## 3. Existing publishing architecture

There is **one table**, `public.posts`. There is no articles table and no
microblog table. Format is decided by whether the writer typed a title, in
`app/(write)/write/UniversalComposer.tsx`.

A row answers "what is this" in three columns that do not agree:

| Column | Values | Status |
|---|---|---|
| `posts.type` | `blog \| essay \| policy_brief \| research` | Legacy, `NOT NULL`, still dual-written |
| `posts.content_kind` | `post \| article \| research` | Target model, nullable |
| `posts.article_format` | `essay \| policy_brief` | Descriptive genre only. **Never** implies review |

The mapping is implemented twice: `public.effective_content_kind()` in SQL and
`resolveContentKind()` in `lib/contentModel.ts`. **Always read through the
resolver.** A new profile surface that branches on `type` directly will
misclassify a Policy-Brief-format Article, which is dual-written as
`type = 'essay'` on purpose.

### Where the current profile still assumes Research

| Site | What it does | Verdict for the rebuild |
|---|---|---|
| `[username]/page.tsx` | Imports `RESEARCH_TYPE_QUERY_EXCLUSION`, threads `FEATURE_FLAGS.research` into 4 loaders | Remove. Two formats means no exclusion sentinel |
| `[username]/page.tsx` | Queries `researcher_profiles` (short-circuited by the flag) | Remove the query and the prop |
| `ProfileBackground.tsx` | A whole "Research" `BackgroundField`: headline, interests, methods, ORCID, website | Remove. This is the largest Research surface left on the profile |
| `profile_record_entries` | Emits `entry_kind = 'research'` | Leave the view branch, stop asking for it. Removing it is a data-model change, not a profile change |
| `PROFILE_RECORD_FILTERS` | Includes `"research"`; `parseProfileRecordQuery` already downgrades it to `"all"` | Already safe. Retire the constant when the record page is rebuilt |
| `ProfileRecordCard.tsx` | Renders a "Research" eyebrow for that kind | Unreachable once the flag stays off. Drop with the row component's rewrite |
| `settings/profile/sections/ResearchSection.tsx` | Owner editor for `researcher_profiles` | Out of scope for the public page, but flag for the same removal pass |
| `PostCover.tsx` | `FALLBACK_STYLES` carries research and policy_brief purple gradients | Harmless. Purple placeholders will simply stop appearing |
| `[username]/actions.ts` | Filters research out of featured-work options | Simplify to a plain published filter |

> **The conflict that actually blocks the design.** `profile_record_entries` was
> built around the *old* three-format model. Its `entry_kind` is
> `publication | response | debate | research`. Under a two-format product the
> interesting axis is **article versus post**, and the view cannot express it.
> Every "Articles" and "Posts" surface in the mockup is blocked on this. Section
> 8 has the one-statement fix.

> **Cross-check against the recent backend audit.**
> `docs/publishing-core-v2-audit.md` (2026-09-02) records that
> `app/(write)/write/actions.ts` carries a second, dead publish pipeline, and
> that two live "edit a published post" implementations disagree about whether
> editing reclassifies a post. Neither touches the profile read path, but both
> change what `content_kind` means over time. **The profile should read
> `content_kind` through the resolver and never write it.**

---

## 4. Existing design system

The system is real and token-driven. Colours are declared as RGB channel triples
in `app/globals.css` and consumed through `tailwind.config.ts` as
`rgb(var(--x) / <alpha-value>)`, so opacity modifiers keep working and a `.dark`
class can swap the whole palette. A dark palette is already defined but nothing
sets `.dark` yet.

### The mockup's palette against the app's tokens

| Mockup | Hex | App token | Hex | Verdict |
|---|---|---|---|---|
| page ground | `#FAF7F0` | `canvas` | `#FAF8F5` | Same colour |
| deep green | `#1F3A2E` | `emerald-brand` | `#073929` | App is darker and less grey. Use the token |
| gold accent | `#B8964F` | `gold` / `gold-ink` | `#CE932B` / `#8A5D1E` | `gold-ink` is the type-safe one |
| muted text | `#8A8471` | `ink-muted` | `#6B6B6B` | Mockup is warmer. App value is the accessible one |
| body text | `#3A372C` | `ink-soft` | `#4B5563` | Mockup warm, app cool. Cosmetic |
| hairline | `#DED7C7` | `card-border` / `divider` | `#E9E5DE` / `#E6E1D9` | Mockup rule is darker and warmer |
| post card fill | `#F5F2EA` | `canvas` / `gold-tint` | `#FAF8F5` / `#F7EEDD` | No exact token. Closest is `canvas` on `card` |
| soft green fill | `#E3E9DE` | `green-tint` | `#DFF0E7` | App tint is cooler and mintier |
| footprint bar | `#8FA588` | none | - | No token. Use `emerald-brand` at reduced alpha |

**Verdict: roughly 85% of the mockup is expressible in existing tokens right
now.** The 15% delta is a consistently warmer, slightly darker neutral family.
Changing `--ta-card-border-rgb` and `--ta-ink-muted-rgb` to the mockup's values
would close it in two lines, but those tokens are consumed by the feed, admin,
debates and every card in the app. **Recommendation: accept the app's neutrals,
take the mockup's structure.** A one-off warm palette on the profile is exactly
the isolated demo we were told not to build.

### Typography

| Role | Mockup | App |
|---|---|---|
| Display / headline | Newsreader (serif) | `font-display`: Bodoni Moda, via `next/font/google` |
| Interface / body | Public Sans | `font-sans`: Inter, via `next/font/google` |

Both pairings are serif-display over grotesque-body, so the mockup's typographic
*system* transfers even though neither face matches. Bodoni is higher contrast
and more editorial than Newsreader; at the mockup's 29px h1 it will read
sharper, not wrong. The role-named scale in `tailwind.config.ts` already covers
everything the mockup needs: `kicker` (11px / 0.15em) is exactly the mockup's
uppercase eyebrow, and `display` / `headline` are fluid clamps that replace the
mockup's fixed pixel headings.

### Primitives inventory

| Primitive | Where | State |
|---|---|---|
| Layout shells | `lib/profileLayout.ts` | Good. `PROFILE_SHELL`, `PROFILE_COLUMNS`, `RECORD_SHELL` |
| Feed row geometry | `components/post/cardShell.ts` | Good. `CARD_SHELL` and `FOCUS_RING`, heavily documented |
| Identity grid | `globals.css:879` | Good. Named grid areas, stacks on phone |
| Featured rail | `globals.css .featured-rail` | Good. Swipe on phone, grid from 768px |
| Button | `components/ui/Button.tsx` | Stale. Hardcodes `gray-300`, `gray-700`, `bg-white`. Ignores tokens. Profile does not use it |
| Card | none | `rounded-xl border border-card-border bg-card` is retyped by hand in ~12 profile files |
| Tabs | none | Three unrelated patterns: `ProfileSectionNav` anchors, `StickySubnav` + `registerSubnav`, record-page filter links |
| Avatar | `components/ui/UserAvatar.tsx` | Works. Raw `<img>` with an eslint-disable, not `next/image` |
| Pill / Tag | `ui/Pill.tsx`, `ui/Tag.tsx` | Both on raw Tailwind greys, off-token. Profile chips are inline instead |
| Icons | none | No library. Inline SVG per component, plus literal `✓` and `•••` glyphs |
| Focus / hit area | `.focus-ring`, `.tap-target` | Good. Gold ring, hit area grown without moving the painted box |
| Sticky offsets | `--app-sticky-offset`, `[data-app-context-nav]` | Good. One rule the whole app pins against |

### Reusable publication components

Four already exist and cover most of what the mockup's lists need:

- `ProfileRecordCard`: row form, title-led, thumbnail right, evidence and date
  on one meta line. Closest to the mockup's "Recent writing" rows.
- `HomeFeedCard`: full feed row with engagement actions, read time from
  `word_count`, response context. Heavier than the profile needs.
- `FeaturedWork`: the 3-up rail. Structurally identical to the mockup's Selected
  work, but the mockup drops the cover and adds a 2px green top rule.
- `PostCover`: cover with typed gradient fallback and a `natural` fit mode.

---

## 5. Mockup to production mapping

Every section of the prototype, in the order it appears in the rendered
template.

| Mockup section | Existing equivalent | Reuse? | Required change | Data source | Risk / notes |
|---|---|---|---|---|---|
| Top bar: wordmark, search, Publish, avatar | `NavigationShell` | Reuse as-is | None | App layout | Prototype chrome only. Do not reimplement |
| Left nav rail with dot markers | `SideRail.tsx` | Reuse as-is | None | App layout | Same. The dots are prototype decoration |
| Sticky compact bar (name, tabs, Follow) | `ProfileStickyBar` | Reuse, extend | Today it is mobile-only and carries no tabs. Mockup shows it on desktop with the tab set. Add a desktop variant, or merge with `ProfileSectionNav` | Props already passed | Two pinned layers on desktop will fight `[data-app-context-nav]`. Pick one owner of the pinned slot |
| Cover banner | `ProfileIdentityPanel` · `CoverBand` | Reuse | Mockup insets it with a 10px radius; current is full-bleed. Cosmetic | `profiles.cover_image_url` | Full-bleed exists for a reason: it cuts the crop ratio from ~10.5:1 to ~2.7:1 on a phone. **Do not re-inset without accepting that** |
| Avatar, 88px, overlapping | `UserAvatar` | Reuse verbatim | None. Already 88px with a `-mt-12` overlap and `z-10` | `profiles.avatar_url` | Keep the `relative z-10`. Removing it re-clips the avatar behind the cover |
| Name + verification tick | `VerifiedMark` | Reuse | Mockup adds a hover tooltip ("Verified student · Institutional affiliation confirmed"). Current is `title` + `aria-label` | `verified`, `verified_type` | A hover-only tooltip is not keyboard reachable. Make it focusable or keep the title attribute |
| @username · descriptor | `getProfileIdentityLines().headline` | Reuse verbatim | Mockup joins them on one line with a `·`; current stacks them | Derived | None. Pure layout |
| Institution · country · followers · following | `identity.affiliation` | Reuse, extend | **Add a following count.** One head count. Also fix the two broken relationship pages | `follows` | Finding 3. Both list pages are dead until the `.order("created_at")` goes |
| "Open to opportunities" pill | `ProfileHeader` · availability | Reuse verbatim | None | `talent_profiles` | Already handles all three visibilities and three viewer states correctly |
| Follow button | `AuthorRelationshipControls` | Reuse | Restyle to a pill. Mockup shows filled-when-following, outlined-when-not | `follows` | Must not appear on your own profile. Component already returns null for self |
| Message button | `MessageButton` | Reuse | Restyle to a pill | `getMessageEligibility()` | Anonymous viewers get a login redirect variant. Blocked pairs get nothing, silently. Preserve both |
| Overflow "⋯" menu | `MoreMenu` | Reuse | Restyle to a 36px circle | Share / Report / Block | Report and Block already hide for anonymous viewers. Keep the outside-click and Escape handling |
| Bio with inline "More" | `ProfileIdentityPanel` · About block | Reuse | Mockup puts it inline after the text; current is a separate block with a heading and a border | `profiles.bio` | Keep the `ResizeObserver` measurement. A character-count threshold is wrong on a 360px phone |
| "Writes about" topic clusters | Demonstrated topics | Reuse data, new UI | Today these are green pill links to the record. Mockup makes them **serif buttons with a gold underline that filter the page in place** | `deriveDemonstratedTopics(posts.tags)` | **Product decision.** In-place filtering means client state or a URL param. A URL param keeps it shareable and server-rendered; prefer that |
| Tabs: Overview / Articles / Posts / About | `ProfileSectionNav` | Replace | Current nav is three *anchors* on one page, desktop only. Mockup is four *views*. Genuinely new | See section 8 | **Blocked on the article/post split.** Also decide URL strategy, see section 7 |
| Selected work (3-up, pinned) | `FeaturedWork` | Reuse | Drop the cover image, add a 2px emerald top rule, add "Pinned by {name}", show format + genre as an eyebrow | `profile_featured_posts` | Mockup shows Appreciate / Respond / Share per card. Those are engagement controls on a profile, which the record deliberately does not carry. **Decision needed** |
| Recent writing (article list) | `ProfileRecordCard` | Reuse shape, new query | Restrict to articles. Mockup shows type · date · read time, then title, excerpt, then appreciations and responses | `posts` | Read time exists via `word_count`. Appreciation and response counts are **not** loaded by any profile query today, see section 9 |
| Recent thoughts (short posts) | none | New | New component. Cream card, serif body, relative time, no title | `posts where content_kind = 'post'` | Genuinely new and the clearest win in the whole design. Titleless posts currently render as a truncated excerpt in a row, which reads badly |
| Intellectual footprint (counts + bars) | `RecordOverview` | Replace | Current shows Publications / Source-backed / Citable as linked tiles. Mockup shows total + article/post split + a ranked topic bar chart | See section 8 | **This is the substitution in Finding 5.** It drops the evidence metrics entirely. Confirm that is intended |
| "2 research-backed articles" | `summary.sourceBackedCount` | Reuse, rename | Rename to "source-backed". The mockup's word is "research-backed", which reintroduces the term we are removing | `post_reference_counts` | **Copy risk.** "Research-backed" will read as the removed Research format |
| Sidebar: About | `ProfileBackground` | Reuse, simplify | Mockup shows role / institution / country as three plain lines. Current has 6 labelled fields in a card | `profiles` | Duplicates the identity line. Pick one home for affiliation |
| Sidebar: Recognition | `ProfileBackground` · Recognition | Reuse | Promote out of the Background card to its own rail section | `verified`, `is_alumni` | Do not confuse with `ProfileRecognition`, which is the credibility-graph component and is flag-gated off |
| Sidebar: Interested in | `ProfileBackground` · Interested in | Reuse verbatim | None. Chip styling already matches | `profiles.interests` | Keep the split from demonstrated topics. It is load-bearing, not cosmetic |
| Sidebar: Links | none | New | New section, new schema | MISSING | **Only genuinely new schema in the whole design.** See section 8 |
| Articles tab | `/record?type=publications` | Reuse loader, new filter | Needs a content-kind filter the record view cannot express | See section 8 | Blocked on the same view change |
| Posts tab | none | New | Same list as Recent thoughts, paged | See section 8 | Blocked on the same view change |
| About tab | `ProfileBackground` | Reuse fields, new layout | Biography / Education / Recognition / Interested in / Links as a single column | `profiles` | Overlaps the sidebar heavily. Decide whether the rail is a preview of this tab or its replacement below `lg` |
| Appreciate / Respond / Share row | `FeedEngagementActions` | Reuse if wanted | Component exists but the profile never renders it | `post_like_counts` | Adds per-post viewer state to a page that has none. Cost is real, see section 9 |
| Demonstrated expertise | `DemonstratedExpertise` | Keep, flag-gated | Not in the mockup at all | Credibility graph | **Decide explicitly:** keep behind its flag, or remove. Silence in a mockup is not a removal instruction |
| Intellectual focus / positioning | `identity.positioning` | Keep, flag-gated | Not in the mockup | `positioning_statement` | Same decision. It is the only field that answers "what are you trying to understand" |

---

## 6. Owner and visitor states

There are **five** states, not four. The current page already handles all five;
the table records the contract so the rebuild does not lose it.

| Element | Owner | Following | Not following | Anonymous | Blocked |
|---|---|---|---|---|---|
| Follow button | Hidden | "Following" | "Follow" | "Follow" then login redirect | Hidden |
| Message button | Hidden | Shown | Shown | Shown, routes to login | Hidden, no reason given |
| Edit profile | Shown | - | - | - | - |
| Share | Inline | In ⋯ | In ⋯ | In ⋯ | In ⋯ |
| Report / Block | Hidden | In ⋯ | In ⋯ | Hidden | Unblock in ⋯ |
| Open to opportunities | Link to settings | Button, opens inquiry modal | Button, opens inquiry modal | Static, or routes to login | Hidden |
| Sticky bar | Hidden | Shown | Shown | Shown | Hidden |
| Empty Featured | Prompt to select | Omitted | Omitted | Omitted | Omitted |
| Empty record | "Publish your first contribution" | "{name} has not published any work yet" | Same | Same | Same |
| Empty topics | "Topics appear here once you publish" | Omitted | Omitted | Omitted | Omitted |
| Empty Background | Shown with edit prompts | Omitted | Omitted | Omitted | Omitted |
| Funnel `viewerState` | `owner` | `authenticated` | `authenticated` | `anonymous` | `authenticated` |

### The two rules the rebuild must not break

1. **Owner sees prompts, visitor sees nothing.** Every empty section on this
   page is either an edit prompt for the owner or absent for everyone else. A
   new profile must never advertise its own gaps to a stranger. This is applied
   consistently in nine places today.
2. **A block is never disclosed.** `getMessageEligibility()` returns
   `{ eligible: false, reason: null }` for a blocked pair on purpose, and
   `ProfileHeader` renders nothing rather than a disabled button with a tooltip.

### Public profile visibility

The fifth state that is easy to miss: `privacy_settings.profile_visibility` can
be `members_only`, enforced at the row by `can_view_profile()` in RLS. An
anonymous visitor to a members-only profile gets no row back, and `page.tsx`
correctly calls `notFound()`. **Anonymous profile viewing is supported and must
keep working.** A separate flag, `show_in_directory`, hides a profile from
discovery without making its URL inaccessible.

> **Decision needed.** The mockup shows engagement actions (Appreciate ·
> Respond · Share) on every card. For an anonymous visitor those either need a
> login redirect on every control or should not render. Pick one before
> Phase 3, because it changes whether the lists can stay server components.

---

## 7. Implementation architecture

### Component structure

Six new or reshaped components, plus reuse. Deliberately not more: the current
tree already has 30 files in `components/profile/` and the failure mode here is
fragmenting further, not under-componentising.

| Component | Kind | Responsibility | Derived from |
|---|---|---|---|
| `ProfileIdentityPanel` | Client | Cover, avatar, name, verification, descriptor, affiliation, counts, bio, actions slot | Modify in place |
| `ProfileTopicFilter` | Server | "Writes about" serif buttons; renders links carrying `?topic=` | New, thin |
| `ProfileTabs` | Server | Overview / Articles / Posts / About as links | New, replaces `ProfileSectionNav` |
| `ProfileStickyBar` | Client | Add a desktop variant carrying the tab set | Modify in place |
| `ArticleRow` | Server | One article: eyebrow, title, excerpt, meta | Reshape `ProfileRecordCard` |
| `ThoughtCard` | Server | One short post: relative time, serif body, actions slot | New |
| `IntellectualFootprint` | Server | Totals, article/post split, ranked topic bars | Replaces `RecordOverview` |
| `ProfileAside` | Server | About, Recognition, Interested in, Links | Reshape `ProfileBackground` |
| `ProfileLinks` | Server | External links with URL validation | New, needs schema |
| `FeaturedWork` | Server | Restyle to the rule-topped, coverless form | Modify in place |

### Server and client boundaries

Keep the current discipline: the page and every list stay **Server Components**;
only three leaves are client.

- **Server**: `page.tsx`, all lists, all rows, the footprint, the aside, the
  tabs. Tabs are `<Link>`s, not `onClick`, so the whole thing works without JS
  and every view is shareable.
- **Client**: relationship controls (optimistic follow), the sticky bar
  (IntersectionObserver), the identity panel (bio measurement and the cover
  lightbox), the inquiry modal, and the funnel trackers.
- **Never client**: data fetching. There is currently zero client-side fetching
  on the profile and it should stay that way.

### Data fetching

Fix the wave structure while rebuilding, since the page is being rewritten
anyway:

1. **Wave 1**: profile row + `auth.getUser()`. Unavoidable: everything keys off
   `profile.id`.
2. **Wave 2**: one `Promise.all` covering everything else. Move
   `getMessageEligibility()` and the credibility graph into this wave. Both
   currently sit outside it and cost two extra serial round trips for no reason.
3. **Per-tab**: Overview loads the featured set, 3 articles, 3 thoughts, the
   footprint and the aside. Articles and Posts load only their own paged list.
   **A tab must not pay for the tabs it is not showing.**

Recommendation: add `lib/profileViewData.ts` (`server-only`) exposing
`loadProfileView({ supabase, profileId, tab, topic, page })`. That gives one
place to hold the query plan, matching the existing `profileRecordData.ts`
pattern.

### Tabs and URL strategy

Three options; the recommendation is the first.

| Option | Cost | Verdict |
|---|---|---|
| `?tab=articles` | One page, one file, shareable, server-rendered, full-page transition | **Recommended** |
| `/[username]/articles` | Cleaner URL. Needs 4 route folders, 4 skeletons, and 4 new reserved usernames | Defensible, more surface |
| Client state | Instant switching, but no deep link, no SSR for 3 of 4 views, all data on first load | Rejected |

Query params also compose with the topic filter for free:
`/mayowa?tab=articles&topic=nigeria` is one canonical, shareable, cacheable URL.
Reuse the parse-and-canonicalise pattern already in `parseProfileRecordQuery()`,
including its redirect-loop guard about key insertion order.

**Keep `/[username]/record`.** It is linked from Featured, the identity chips,
Background and Demonstrated expertise. Redirect it to `?tab=articles` rather than
deleting it.

### Loading, error and not-found

- `loading.tsx` is **already stale**. It draws a rounded bordered card with a
  3-column metric grid; the real header has been a full-bleed edge-to-edge
  section with a flex metric row since the last redesign. Rewrite it against the
  new header, and drive both from the same layout constants so they cannot drift
  again.
- Add `error.tsx`. There is none today, so a thrown loader
  (`loadProfileRecordSummary` throws on RPC error) hits the root boundary and
  loses the app shell.
- `notFound()` already covers a missing profile, a suspended profile and a
  members-only profile viewed anonymously, all through one RLS-driven null. Keep
  that.
- Wrap each tab body in its own `<Suspense>` so the identity header streams
  first. It depends only on Wave 1.

### Responsive

Follow the existing breakpoints rather than the mockup's `flex-wrap`
improvisation, which collapses the 2-column body at an arbitrary width.

- **Below `lg`**: single column. Aside moves below the content. Tabs scroll
  horizontally, which the mockup already does with `overflow-x: auto`.
- **`lg` and up**: `PROFILE_COLUMNS` gives `minmax(0,1fr) 320px`. The mockup's
  `2fr / 1fr` is close enough that the existing constant should win.
- **Identity**: `.profile-identity` already stacks avatar, name, actions, meta on
  a phone and goes 3-column at 640px. No change needed.
- **Featured**: `.featured-rail` already swipes on a phone and grids from 768px.
  No change needed.

---

## 8. Schema changes

Two, and only two. Everything else in the mockup is derivable.

### Change 1: teach the record view about content kind

**Required for:** Articles tab, Posts tab, Recent thoughts, the article/post
split in Intellectual footprint.

- `CREATE OR REPLACE VIEW public.profile_record_entries` adding one column,
  `content_kind`, from the `effective_content_kind(type, content_kind)` call the
  view *already makes* to decide `entry_kind`. The expression exists; it is
  currently thrown away after the CASE.
- `CREATE OR REPLACE FUNCTION public.get_public_profile_record_summary` adding
  `article_count` and `post_count` to the returned row.

No new table. No new column on `posts`. No data migration. No backfill. The view
is `security_invoker`, so RLS is unchanged. Grants are already correct.

The alternative, querying `posts` directly from the profile and bypassing the
view, is worse: it duplicates the co-author UNION and the published-status filter
in TypeScript, which is exactly the drift the view exists to prevent.

### Change 2: external links

**Required for:** the Links section in the sidebar and the About tab.

Two nullable columns on `profiles`, not a table:

- `website_url text` and `linkedin_url text`, each with a CHECK constraining
  scheme and length.
- Add both to the `GRANT UPDATE (...)` column list in the security-hardening
  migration's successor.
- Add both to `v_directly_editable_columns` in
  `protect_profile_privileged_columns()`. **Missing this makes them silently
  unwritable.**
- Add both to `public.profile_directory` if links should appear in discovery.
  Probably not.

A `profile_links` table would cost an extra round trip, an ordering UI, its own
RLS policies and a "which platform is this" enum, to model exactly the two links
the mockup draws. Two columns is the smaller change. If the product later wants
arbitrary links, that is a table then, not now.

> **Deployment ordering, non-negotiable.** Both changes must ship behind a
> runtime flag exactly like `isProfilePositioningEnabled()`, for the reason that
> function documents: PostgREST rejects a whole `select` naming a column that
> does not exist, and `page.tsx` treats that rejection as a missing profile.
> **Deploying either ahead of its migration turns every public profile into a
> 404.**

### Not a schema change, but must be fixed

`followers/page.tsx:25` and `following/page.tsx:25` order by a column that does
not exist. The minimal fix is to **delete the `.order()` call** and check
`error`. Adding `follows.created_at` would be nicer, needs a backfill decision
for existing rows, and is not required by the mockup. Recommend the deletion.

### Explicitly rejected

| Tempting column | Why not |
|---|---|
| `profiles.follower_count` | Derivable, indexed, needs a counter table and triggers to be safe. The count is already a single head query |
| `profiles.article_count` / `post_count` | Derivable from the view above. Stored counters drift and need reconciliation, exactly the lesson of `20260715000006` |
| `profiles.headline` | `professional_title` is that column. `getProfileIdentityLines()` already derives the fallback chain |
| `profiles.city` | The mockup shows "Ede", but no other surface asks for a city and nothing collects one. Do not add a field with no writer |
| `profile_topics` table | Topics are derived from `posts.tags` on purpose, so every chip resolves to at least one real entry. A stored table reintroduces the dead-chip bug that `deriveDemonstratedTopics` was written to kill |

### Prerequisite: resolve the three release gates

Before any of this, confirm in production whether `20260826000001`
(positioning), `20260826000002` (feature notes) and `20260827000001-3`
(credibility) are applied. Each currently forces a conditional `select` string.
If they are applied, the flags and the string-building can go and the new page
gets simpler. If they are not, the new page must keep the same discipline.

---

## 9. Risk review

### Query cost

| Risk | Severity | Detail |
|---|---|---|
| Unbounded tag scan | High | `page.tsx` selects **every published post** by this author, with no limit, purely to count tags. A prolific author with 500 posts ships 500 rows on every profile view. Two such queries run, one owned and one co-authored. `loadProfileTopicIndex` does the same again on the record page |
| Four serial waves | Medium | Messaging eligibility and the credibility graph are awaited *after* the two `Promise.all` blocks. Two avoidable serial round trips on every authenticated view |
| Engagement counts | High if added | The mockup wants appreciations and responses per row. Naive per-row queries are a textbook N+1. `post_like_counts` supports one batched `.in()`; comment counts must go through `get_post_comment_counts()` so RLS keeps hiding moderated rows. **Two batched calls, never per row** |
| Topic filter URL length | Medium | `loadProfileTopicIndex` resolves topics to post ids and passes them as `.in("entry_id", [...])`, capped at 300 by `TOPIC_POST_ID_CAP` to keep the URL sendable. Making the topic filter a first-class page control raises how often this runs. Carrying tags on the view is the structural fix, deliberately deferred |
| No caching | Medium | Every profile view is fully dynamic. The feed uses `unstable_cache` with tags; the profile uses none. Identity, footprint and topics change rarely and are cacheable per profile |

### Security and privacy

- **Sound today.** Profile visibility runs through RLS via `can_view_profile()`,
  not application filtering. `profile_record_entries` is `security_invoker`, so
  the viewer's RLS still applies inside it. Private columns (email, notification
  prefs, moderation state) are reachable only through `get_my_profile_private()`.
- **Watch:** the page reads `profiles` directly, not through `profile_directory`.
  That is *correct*, because hiding from discovery must not break a known URL,
  but it means every new column added to the select is a new public disclosure
  decision. Audit the projection when adding links.
- **Watch:** the funnel payload contract in `lib/profileFunnel.ts` says
  identifiers and state only, never a name, email, bio or positioning statement.
  Any new tracking on the new sections must honour it.
- **Watch:** external links are user-controlled URLs.
  `ProfileBackground.safeExternalUrl()` already validates scheme; reuse it rather
  than writing a second validator, and keep `rel="noreferrer"`.

### Duplication and structure

- `app/(main)/[username]/FollowButton.tsx`: dead file, no importers. Delete.
- Two follow implementations remain live: `components/ui/FollowButton.tsx` (used
  by explore, sidebar, suggestions) and `AuthorRelationshipControls` (used by the
  profile). They render differently. Do not add a third.
- Three tab patterns already exist. The new `ProfileTabs` must replace
  `ProfileSectionNav`, not join them.
- `rounded-xl border border-card-border bg-card` appears by hand in about a dozen
  profile files. Worth a constant in `lib/profileLayout.ts` alongside the others.
- `ui/Button.tsx`, `ui/Pill.tsx` and `ui/Tag.tsx` are all off-token. The profile
  already routes around them. Do not adopt them in the rebuild without fixing
  them, and do not fix them as part of this work.

### Routing

> **Reserved usernames are incomplete.** `RESERVED_PROFILE_PATHS` in
> `lib/profileUsername.ts` lists 31 segments but omits five live ones:
> `research`, `responses`, `campus`, `subscriptions`, `create`. A user who
> registered any of those has an unreachable profile, since Next.js resolves the
> static segment first. Pre-existing, not caused by this work, but it belongs in
> the same pass. If section 7's route-segment option is chosen instead of query
> params, add `articles`, `posts` and `about` too.

### Mobile

- The sticky bar coordinates with the compose FAB through
  `--profile-sticky-bar-height`, measured rather than hardcoded, and offsets for
  `env(safe-area-inset-bottom)` plus the visual viewport. **Preserve all of it.**
  This was a real overlap bug.
- The bar translates off-screen rather than unmounting, and uses `inert` so its
  Follow button leaves the focus order. `aria-hidden` alone would not.
- A desktop sticky bar carrying tabs will collide with `[data-app-context-nav]`,
  which is the app's single pinned-subnav slot. One component must own it.
- The mockup's identity row uses `justify-content: space-between` with wrapping,
  which puts Follow / Message / ⋯ under the name on a narrow screen at an
  unpredictable width. The existing named-grid-area approach is more reliable and
  should win.
- The mockup's footprint bar chart has no mobile treatment. At 320px the label
  and count on one `space-between` row will collide.

---

## 10. Staged implementation plan

Six phases. Phase 0 is not optional: two of its three questions can 404 every
profile in production if answered wrong.

### Phase 0: resolve the unknowns

No UI work. Answers three questions that change the shape of everything after.

- Confirm in production whether `20260826000001`, `20260826000002` and
  `20260827000001-3` are applied.
- Decide: does the new profile keep Demonstrated expertise, Recognition and
  Intellectual focus, or does the mockup's silence mean removal?
- Decide: do Appreciate / Respond / Share render on profile cards, and what does
  an anonymous visitor see?

*Ships nothing. Blocks Phases 2, 4 and 5.*

### Phase 1: identity shell

The header, restyled to the mockup, with no new data.

- `ProfileIdentityPanel`: one-line descriptor, following count, verification
  tooltip, inline bio "More", pill-shaped actions.
- Fix `followers/` and `following/`: drop the bad `.order()`, check `error`,
  restyle onto tokens.
- Rewrite `loading.tsx` against the real header.
- Add `error.tsx`.
- Delete the dead `[username]/FollowButton.tsx`. Complete
  `RESERVED_PROFILE_PATHS`.

*Ships independently. No schema. No flags. Visible improvement on day one.*

### Phase 2: two-format content model

The enabling migration and the queries that read it.

- Migration: `content_kind` on `profile_record_entries`; `article_count` and
  `post_count` on the summary RPC.
- Flag: `isProfileContentSplitEnabled()`, same discipline as the positioning
  gate.
- `lib/profileViewData.ts` with `loadProfileView()`, collapsing the four waves
  into two.
- Remove the Research query, the Research background field and
  `RESEARCH_TYPE_QUERY_EXCLUSION` from the profile path.

*Ships behind a flag. No visible change until Phase 3.*

### Phase 3: tabs and real publication content

The body of the page.

- `ProfileTabs` on `?tab=`, replacing `ProfileSectionNav`. Redirect `/record` to
  `?tab=articles`.
- Overview: Selected work, Recent writing, Recent thoughts, each with a "View
  all" into its tab.
- `ArticleRow` and `ThoughtCard`.
- Restyle `FeaturedWork`: coverless, green top rule, "Pinned by {name}".
- Per-tab `<Suspense>` so the header streams first.

*The largest phase. Ships with Phase 2's flag on.*

### Phase 4: footprint, topics and About

The supporting metadata.

- `IntellectualFootprint`: totals, article/post split, ranked topic bars. Cap the
  tag scan with a limit and an ordering.
- `ProfileTopicFilter` on `?topic=`, composing with `?tab=`.
- `ProfileAside`: About, Recognition, Interested in.
- About tab as the full-width form of the same fields.
- Carry Phase 0's decision on Demonstrated expertise and Intellectual focus.

*Ships independently of Phase 5.*

### Phase 5: links and owner editing

- Migration: `profiles.website_url` and `linkedin_url`, plus **both** allowlists.
- Flag: `isProfileLinksEnabled()`.
- `ProfileLinks`, reusing `safeExternalUrl()`.
- A Links field in `settings/profile`, and remove `ResearchSection`.

*Smallest phase. Genuinely optional if links are dropped from scope.*

### Phase 6: performance, accessibility, polish

- Bound the tag scan. Batch engagement counts into two calls if Phase 0 said yes.
- Cache identity and footprint per profile with a revalidation tag.
- Desktop sticky bar, resolving the pinned-slot conflict.
- Keyboard path for the verification tooltip. Focus order across tabs.
  Reduced-motion audit.
- Test the 320px footprint chart and the wrapping identity row.

*Continuous. Some of it belongs inside earlier phases.*

### Dependencies

- Phase 1 depends on nothing and can start immediately.
- Phase 3 depends on Phase 2's migration being applied and verified.
- Phases 4 and 5 depend on Phase 3's tab shell but not on each other.
- Phase 0's three answers gate Phases 2, 4 and 5 respectively.

---

Audit only. No files were modified, no migrations written, no mock data created.
Awaiting review before implementation.
