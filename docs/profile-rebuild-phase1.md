# Profile rebuild, Phase 1

Identity shell, relationship lists, route hygiene. Companion to
[`profile-rebuild-audit.md`](./profile-rebuild-audit.md), whose sections A
through G this phase implements.

Phase 2 was not started.

---

## 1. What changed

**The identity shell now reads in the mandated order.** `ProfileIdentityPanel`
was restructured around one sequence: cover, avatar, name with verification,
`@handle · descriptor`, `affiliation · country · followers · following`,
opportunity status, bio, actions. Previously the bio sat in a separate block
below the record strip and the actions sat above it, so the person's own words
appeared after the platform's metrics.

**Both relationship counts are on the page and both are real.** The Following
count is new. Both are counted from `follows` per request and both link to the
list behind them.

**The follower and following lists work again.** They have been returning empty
for every profile on the site. See section 4.

**The profile segment has its own error boundary**, and the skeleton now
matches the shell it stands in for rather than a card layout that no longer
exists.

**Route hygiene.** A dead follow button was removed, and the reserved-username
list was rebuilt from the route tree with a test that keeps it there.

---

## 2. Files

### Added

| File | Purpose |
|------|---------|
| `app/(main)/[username]/error.tsx` | Error boundary for the profile segment and everything under it |
| `lib/profileRelationships.ts` | Shared shape and ordering for the two relationship lists |
| `lib/profileUsername.test.ts` | Walks `app/` and asserts every live top-level route is reserved |

### Deleted

| File | Reason |
|------|--------|
| `app/(main)/[username]/FollowButton.tsx` | Zero importers. Every `FollowButton` import in the codebase resolves to `@/components/ui/FollowButton` |

### Modified

| File | Change |
|------|--------|
| `components/profile/ProfileIdentityPanel.tsx` | Identity hierarchy, `followingCount` prop, `MetaLine`/`Dot` helpers, bio moved up, positioning demoted, topics heading renamed and relabelled |
| `components/profile/ProfileHeader.tsx` | Accepts and forwards `followingCount`; action button styling consolidated into two shared constants |
| `app/(main)/[username]/page.tsx` | Second head count against `follows`, added to the existing `Promise.all` wave |
| `app/(main)/[username]/followers/page.tsx` | Query fixed, error handled, house tokens, avatars, deterministic order |
| `app/(main)/[username]/following/page.tsx` | Same |
| `app/(main)/[username]/loading.tsx` | Rebuilt on the real `profile-identity` grid |
| `app/globals.css` | `.profile-identity` mobile grid areas: actions moved after meta (six comment lines and two swapped rows; the rest of this file's diff is not from this phase) |
| `lib/profileUsername.ts` | Thirteen reserved paths added, list documented |
| `components/profile/ProfileHeader.test.tsx` | Eight new tests, two renamed assertions |
| `components/profile/ProfilePreview.test.tsx` | Topic label assertion renamed |
| `tsconfig.check.json` | Eight profile files added so they are actually type-checked |

---

## 3. Implementation decisions

**The bio keeps its ResizeObserver.** Measurement, not character count, as
instructed. A character threshold agrees with `line-clamp-3` only at desktop
width: on a 360px phone three lines hold roughly 125 characters.

**The relationship counts are single text nodes.** "12 followers", not a "12"
beside a "followers". An element whose entire text is "0" reads as a metric of
zero, which is what the record strip below is careful never to print. This is
both the product rule and what keeps `queryByText("0")` honest in the tests.

**Following is optional on the panel.** The Command Center preview renders the
same component and has no following count to give it, so omitting the prop
prints one number instead of two rather than a zero the preview cannot justify.

**Neither count is stored.** Both are `head: true` counts against the same
index, inside a `Promise.all` that was already running. A denormalised counter
would need a trigger and a reconciliation job.

**Actions moved last in the DOM, not just visually.** The mandated order ends
with Actions. Below 640px the grid stacks in source order, so moving the markup
rather than only the grid areas keeps visual order and focus order identical.
From 640px the grid lifts the block into the column beside the name without the
markup moving. Follow does not become hard to reach on a phone, because
`ProfileStickyBar` brings it back as soon as the header scrolls away.

**Button radius stayed `rounded-lg`, against the mockup's pill.** The Follow
control beside these buttons is `AuthorRelationshipControls`, shared with the
sticky bar, the feed interludes and a V2 variant that carries its own
duplicated props interface. Rounding only the buttons `ProfileHeader` owns
would put a pill next to a rectangle; rounding the shared control would restyle
four other surfaces to settle a corner on this one. The mockup's restraint is
carried by weight and colour instead: one filled primary, one outlined
secondary, everything else quiet.

**The cover band stayed full bleed.** The prototype insets it with a radius on
three sides. Production wins here, as instructed: breaking the shell gutters is
what makes it a band rather than a picture, and the existing mobile crop
behaviour is intact.

**Verification is not a hover card.** The mockup explains it on hover. A hover
card is unreachable by touch and by keyboard, so the meaning lives in an
`aria-label` on the mark itself, with `title` only as a pointer convenience.

**"Demonstrated topics" became "Writes about"**, per the vocabulary decision.
The `<ul>` now takes its accessible name from the visible heading via
`aria-labelledby` instead of a separate `aria-label`, so the announced name and
the printed one cannot drift apart again.

**The positioning statement stayed a bare `<p>`.** Demoted to 13.5px
`text-ink-muted` below the bio. No chip, no border, no role: nothing that would
present the author's own sentence as something the platform conferred.

**Relationship lists are ordered alphabetically, in JS.** `follows` stores no
timestamp, so recency is unavailable and any chronological-looking order would
assert something the table does not know. Alphabetical claims nothing and makes
a long list searchable. Sorting happens on rows already in memory.

**A row whose embedded profile came back empty is dropped.** That is RLS
declining to show a profile, so the list can be shorter than the follower count
on the header. That gap is the private profile staying private.

---

## 4. Bugs fixed

**Every follower and following list on the site was empty.** Both pages ordered
by `follows.created_at`. That column does not exist, so PostgREST rejected the
whole request; the error was destructured away, `data` came back `null`, and
the page rendered "0 followers" with an empty state. No timestamp column was
added: the ordering was removed, and the error is now checked and thrown into
the segment's error boundary, which offers a retry and says nothing about
Postgres.

**A long display name or handle would be clipped mid-word.** The panel sets
`overflow-hidden`, and at 320px the identity column is 288px. Both now carry
`overflow-wrap: anywhere`.

**Thirteen live routes could be claimed as usernames**, silently making the
claimer's profile unreachable: `api`, `auth`, `campus`, `create`, `draft`,
`landing`, `login`, `onboarding`, `r`, `research`, `responses`, `signup`,
`subscriptions`. The five the audit named were all confirmed live; the other
eight were found by walking the route tree. `lib/profileUsername.test.ts` now
does that walk on every run.

**The accessible name of the topics list did not match its visible heading.**
Introduced by the rename, fixed before it shipped.

**A dead `FollowButton` had been shadowing the real one by name** in search
results since the two follow systems diverged.

`debates` was left reserved although its route is gone. Releasing a retired
name lets someone claim it and makes it unusable if the section returns. The
list documents this rule.

---

## 5. Checks run

| Check | Result |
|-------|--------|
| `npm run typecheck` | Pass, clean. Eight profile files were added to `tsconfig.check.json` first, since four of them were outside the checked graph entirely |
| `npm run lint` | Pass, clean, no warnings |
| `npm run build` | Pass. "Compiled successfully in 46s", "Generating static pages (79/79)". `/[username]`, `/[username]/followers`, `/[username]/following` and `/[username]/record` all compile |
| `npx vitest run components/profile lib/profileUsername.test.ts lib/profileCommandCenter.test.ts lib/profileZeroStates.test.ts` | 16 files, 120 tests, all pass |
| `npm test`, before this phase's last three edits | 194 files, 2040 tests, all pass |
| `npm test`, final | 193 files pass, 1 fails. 2047 tests pass, 1 fails. See section 6 |

New tests: eight in `ProfileHeader.test.tsx` covering both count links, singular
"1 follower", a zero count printed as words and never as a bare metric, the
omitted following count, the affiliation-less meta line not leading with a
separator, the owner seeing Edit profile and no Follow or Message, a visitor
seeing both, and a blocked visitor seeing neither and being told nothing about
the block. Three in `lib/profileUsername.test.ts`.

### State and viewport review

Reviewed statically against the CSS and the component tree, not in a browser.
No browser tooling is available in this environment, so there are no
screenshots.

- **320px and 360px**: single-column grid; content width 288px at 320px. Name,
  handle line, meta line and actions all wrap. The three action controls
  measure roughly 230px including gaps, so they fit on one row without
  wrapping.
- **Tablet and desktop**: from 640px the grid is `avatar name actions` over
  `avatar meta actions`; actions capped at 290px and right-aligned.
- **Long name, long username**: wrap rather than clip, per section 4.
- **No cover**: gradient band, same 56px height, avatar overlap unchanged.
- **No avatar**: `UserAvatar` falls back to its generated beam.
- **No bio**: block omitted entirely for visitors; owner sees "Add an About
  section".
- **No affiliation**: meta line starts at the follower count with no leading
  separator. Covered by a test.
- **0 followers and 0 following**: "0 followers · 0 following". Covered by a
  test.
- **Owner, followed visitor, non-followed visitor, anonymous, blocked**: all
  four action branches preserved; the last three are covered by tests. The
  owner never sees Follow or Message. The blocked state discloses nothing.

---

## 6. Failures and warnings

**One test fails, and it is not from this phase.**
`lib/publicationDeliveryMigration.test.ts:44` expects
`supabase/pending/author_subscriptions_publication_delivery_v1.sql` to contain
`'debate_phase_advanced', 'debate_cancelled'`. Those types were deliberately
removed from that file at 10:56, during the final test run, as part of the
debate-removal work in progress in this working tree. The identical full suite
passed 194 of 194 at 10:39. No file this phase touched is in that test's graph.
It was left alone: it belongs to the change that is actively editing it.

Git prints "LF will be replaced by CRLF" warnings across the repo.
Pre-existing line-ending configuration, unrelated.

No other warnings.

---

## 7. Production migration status

**Not verified. Production is not reachable from this environment.**

- The Supabase CLI is not a project dependency and the project is not linked:
  there is no `supabase/config.toml` and no project ref on disk.
- A read-only PostgREST probe was attempted against the project configured in
  `.env.local`, using the project's own service-role key and `limit=0` selects,
  which resolve the column list without returning rows. The first request
  returned HTTP 522 and every subsequent one timed out at 15 seconds. Nothing
  was written and nothing was applied.

The only evidence available is indirect, and it is the operator's own
assertion rather than a database read: `.env.local` sets
`NEXT_PUBLIC_PROFILE_POSITIONING_ENABLED=1`,
`NEXT_PUBLIC_FEATURED_WORK_NOTES_ENABLED=1` and
`NEXT_PUBLIC_CREDIBILITY_GRAPH_ENABLED=1`. Per `CLAUDE.md`, each may only be
set once its migration is applied and verified, which implies `20260826000001`,
`20260826000002` and `20260827000001` through `3` are all live. That is a
statement about local configuration. It is not a confirmation, and it is not
being reported as one.

To confirm, run against production and check that
`profiles.positioning_statement` and `profile_featured_posts.feature_note`
exist, that `post_citation_edges` and `profile_recognitions` exist, and that
`opportunity_applications.outcome_verified_at` exists.

---

## 8. Deferred

Out of Phase 1 scope, deliberately not done:

- Articles and Posts tabs, `?tab=` routing, Overview as canonical.
- `/[username]/record` still works and still is not redirected.
- Intellectual Footprint.
- Engagement controls and counts: Appreciate, Respond, Share.
- Website and LinkedIn: no schema, no UI.
- `DemonstratedExpertise` remains built and remains unsurfaced.
- Recognition untouched.
- No migrations written or applied.
- The two follow systems, `AuthorRelationshipControls` and
  `components/ui/FollowButton`, remain separate.

Found during the work, not fixed:

- **The relationship lists are unbounded.** Both pages fetch every row. The
  header now links to them prominently, so a profile with tens of thousands of
  followers will fetch tens of thousands of rows. Pagination needs a stable
  cursor, and `follows` has no timestamp to page on, so this is a schema
  question rather than a query change.
- **`AuthorRelationshipControlsV2` carries a duplicated local `Props`
  interface** rather than importing the one beside it. Left alone: touching it
  means touching every surface that renders it.

---

## 9. `git diff --stat`

Scoped to this phase. The repo-wide diff is 238 files, 2134 insertions and
29488 deletions, almost all of it concurrent debate-removal work that this
phase did not touch.

```
 app/(main)/[username]/FollowButton.tsx      |  64 ------
 app/(main)/[username]/error.tsx             |  83 ++++++++
 app/(main)/[username]/followers/page.tsx    | 104 +++++++---
 app/(main)/[username]/following/page.tsx    |  90 ++++++---
 app/(main)/[username]/loading.tsx           |  85 +++++---
 app/(main)/[username]/page.tsx              |   9 +-
 components/profile/ProfileHeader.test.tsx   | 124 +++++++++++-
 components/profile/ProfileHeader.tsx        |  40 +++-
 components/profile/ProfileIdentityPanel.tsx | 300 ++++++++++++++++++----------
 components/profile/ProfilePreview.test.tsx  |   6 +-
 lib/profileRelationships.ts                 |  34 ++++
 lib/profileUsername.test.ts                 |  85 ++++++++
 lib/profileUsername.ts                      |  31 +++
```

`app/globals.css` and `tsconfig.check.json` are also modified by this phase,
but their diffs are dominated by concurrent work: this phase contributed six
comment lines and two swapped `grid-template-areas` rows to the first, and
eight added file paths to the second.

---

## 10. `git status`

Nothing is staged. 136 modified, 102 deleted, 13 untracked, on `main`.

This phase's entries:

```
 D app/(main)/[username]/FollowButton.tsx
 M app/(main)/[username]/followers/page.tsx
 M app/(main)/[username]/following/page.tsx
 M app/(main)/[username]/loading.tsx
 M app/(main)/[username]/page.tsx
 M app/globals.css
 M components/profile/ProfileHeader.test.tsx
 M components/profile/ProfileHeader.tsx
 M components/profile/ProfileIdentityPanel.tsx
 M components/profile/ProfilePreview.test.tsx
 M lib/profileUsername.ts
 M tsconfig.check.json
?? app/(main)/[username]/error.tsx
?? lib/profileRelationships.ts
?? lib/profileUsername.test.ts
```

Everything else in the working tree, including
`supabase/migrations/20260906000003` and `20260906000004`, the broadcast files
and the debate removal, predates this phase or was written alongside it by
other work.
