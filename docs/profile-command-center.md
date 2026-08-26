# Profile Command Center

Last updated: 2026-08-26

## Purpose

One place an author manages everything a visitor sees. Before this, public
identity lived in a settings tab, research identity lived at
`/research/profile`, and the opportunity signal lived inside
`/opportunities`. Three editors, three mental models, and no way to see the
result without leaving and coming back.

This is an owner workspace. It is not an analytics dashboard, and it shows no
public score, completion percentage, or level.

## Route

**Canonical: `/settings/profile`.**

| Route | Behaviour |
| --- | --- |
| `/settings/profile` | The Command Center |
| `/settings?tab=profile` | Redirects to `/settings/profile` |
| `/settings` | Stays on Settings and opens Account |
| `/research/profile` | Still works; links to `#research` |
| `/opportunities` | Still works; the editor links to `#opportunities` |

Fragments survive an HTTP redirect, so the anchors the public profile has
always linked to keep landing on the right section:
`#profile-identity` (Identity), `#profile-about` (Intellectual focus and
About). New links use section keys directly: `#identity`, `#focus`, `#topics`,
`#featured`, `#background`, `#research`, `#opportunities`, `#visibility`.

Account security, passwords and notification preferences deliberately stay on
`/settings`. Mixing an account concern into this page would make "who can see
this" ambiguous, which is the one question the page exists to answer.

## Sections

`PROFILE_SECTIONS` in `lib/profileCommandCenter.ts` is the list. Research is
hidden entirely when `FEATURE_FLAGS.research` is off rather than rendering an
explanation of something the author cannot use.

Each section owns its own save. Section-level rather than page-level because
the page spans nine unrelated concerns across three tables: a single Save
would make an author fixing a typo in their bio re-submit their opportunity
visibility too, and would make one failure ambiguous about what persisted.

`useSectionSave` gives every section the same lifecycle: `idle → dirty →
saving → saved | error`. A failure keeps the draft. Duplicate submissions are
refused while a request is in flight.

Cover and profile photos are the exception: they save on upload, as they
always have. The Identity section says so in its footnote rather than leaving
an author to discover it.

## Data boundaries

The owner experience is unified. The storage is not.

| Domain | Table | Boundary |
| --- | --- | --- |
| Public identity | `public.profiles` | Column allowlist plus the privileged-column trigger |
| Research identity | `public.researcher_profiles` | Its own RLS; validation stays in `app/(main)/research/actions.ts` |
| Opportunity signal | `public.talent_profiles` | Its own RLS and its own visibility rule |
| Featured Work | `public.profile_featured_posts` | Replaced atomically by RPC only |

Nothing from `talent_profiles` or `researcher_profiles` is copied into
`profiles`. A selector's view of an author and a reader's view of an author
are different questions with different audiences; merging the storage would
answer both with one permission.

Private data that never reaches the client model as data:

- Onboarding path and work category. Read once to decide which identity
  fields this author's path requires, and surfaced only as the boolean
  `isStudentPath`.
- Opportunity readiness detail. Not part of the Command Center model at all.
- `signup_email`, notification preferences, suspension state. Read through
  `get_my_profile_private()`, and only `privacy_settings` is used.

## Live preview

The preview renders the **same components the public profile renders**:
`ProfileIdentityPanel`, `FeaturedWork`, `ProfileBackground`.
`ProfileIdentityPanel` was extracted out of `ProfileHeader` for exactly this
reason. The public header wraps it with relationship controls through an
`actions` slot; the preview passes none. One implementation, so the preview
cannot drift into a flattering approximation of the real page.

- It reads **draft** state, so text and selection changes appear immediately.
- Media is reflected from the model, because it saves immediately anyway.
- It is labelled `Preview`, and says `Unsaved changes` in words rather than
  only in colour.
- The whole card is `inert`: no links, no toggles, nothing focusable. Follow,
  Message, Report and Contact are not rendered at all.
- No iframe. An iframe would need its own authenticated render of a route that
  does not yet reflect unsaved state, and would put the preview outside the
  page's accessibility tree.

Desktop gets a sticky rail from `lg`. Below that it is a bottom sheet with a
focus trap, Escape to close, and focus restored to the trigger. Editor and
preview are never side by side on a phone.

`View public profile` is separate, and is the way to check the saved
production state.

## Contextual next actions

`lib/profileNextAction.ts`. Deterministic: the same state always produces the
same ordered list. One primary action and at most two secondary suggestions,
so the page never becomes a task list.

Priority, most blocking first:

1. `complete_identity` — required public identity fields for this author's path
2. `add_positioning` — no Intellectual focus
3. `add_interests` — no declared interests
4. `publish_first` — empty record
5. `select_featured` — publications exist, nothing featured
6. `explain_featured` — featured work carries no explanation
7. `tag_published_work` — published work demonstrates no topics
8. `add_sources` — no publication is source-backed
9. `complete_research` — research enabled but incomplete
10. `complete_opportunities` — opted in but thin
11. `review_profile` — the resting state

Rules the engine holds to:

- Never recommends an impossible action. Featuring work requires
  `eligibleFeaturedCount > 0`, not merely `publicationCount > 0`: an author
  whose only publications are unaccepted co-author credits is never sent to an
  empty picker.
- Research actions exist only when `FEATURE_FLAGS.research` is on.
- Required identity fields follow the **onboarding path**, not the public
  profile type. A researcher on the non-student path is not missing a
  university.
- Opportunity actions only for an author who already opted in. Someone who has
  not is not incomplete; they made a choice.
- Every action carries a `why`, and a `completionCondition` stating what makes
  it stop.
- No percentage. A percentage motivates filling fields; these name the
  specific thing that would make the profile more legible.

The dashboard reads the same engine, so the two surfaces cannot recommend
different things on the same day. Draft-level nudges on the dashboard (a
reviewed draft missing references, for example) stay local: they are about one
unpublished piece rather than about the profile. The dashboard passes
placeholder notes for its Featured Work count, so it never raises
`explain_featured`; only the Command Center loads note text and owns that
advice.

## Featured Work explanations

`profile_featured_posts.feature_note`, added by
`20260826000002_featured_work_notes.sql`.

- Optional, plain text, at most 180 characters, enforced by a database CHECK
  and by `FEATURE_NOTE_MAX_LENGTH`.
- A blank note stores as `NULL`, so "absent" has exactly one representation.
- Selection, order and notes are one value, replaced atomically by
  `replace_my_featured_posts_v2(uuid[], text[])`. The v1 function is left in
  place for deployed clients; neither can half-apply.
- Eligibility is unchanged: published, and authored or accepted co-authored.
- Removing and re-adding a selection in the same editing session preserves its
  draft note. That parked note is session-only and is never persisted for a
  piece that is not selected at save time.

Public rendering: shown only when present, subordinate to the title, set off
by a rule and the label `Why I featured this`. Absent notes render nothing, so
a rail of three cards does not carry three empty captions.

Gated by `NEXT_PUBLIC_FEATURED_WORK_NOTES_ENABLED` until the migration is
applied, for the same reason as the positioning gate: PostgREST rejects a
select naming a column that does not exist, and this one is on the public
profile query.

## Owner analytics

`lib/profileOwnerAnalytics.ts`, on the same activation pipeline as the Phase 1
conversion funnel.

| Event | Fires when |
| --- | --- |
| `profile_command_center_viewed` | The workspace renders |
| `profile_section_saved` | After persistence returns, with `outcome` |
| `profile_preview_opened` | A preview surface opens |
| `profile_next_action_clicked` | A recommendation is followed |
| `profile_feature_note_saved` | Featured Work saves, with note counts |

Properties are keys and states only: `profileId`, `section`, `actionKey`,
`surface`, `rank`, `outcome`, `selectionCount`, `noteCount`,
`hasUnsavedChanges`. Never a name, biography, positioning statement, research
description, opportunity description, email, or the text of a feature note.
The point of measuring a save is to learn that a section was completed, not
what it now says.

Saves are reported after persistence, never on the click.
`lib/profileOwnerAnalytics.test.ts` asserts both the property sets and that
timing.

## Accessibility

- Every section is a `<section>` with an `aria-labelledby` heading; the page
  has one `<h1>`.
- Save state is announced: `role="status"` / `aria-live="polite"` for ordinary
  states, `role="alert"` / `assertive` for failures.
- Field errors are wired to their inputs with `aria-describedby` and
  `aria-invalid`.
- The mobile preview traps focus, closes on Escape, and restores focus to its
  trigger.
- The preview is `inert`, so nothing focusable sits inside it.
- Completion is never communicated by colour alone.
- Interactive targets are at least 44px; the mobile sheet reserves
  bottom-navigation and safe-area space.
