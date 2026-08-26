# Intellectual Profile V2 contract

Last updated: 2026-08-26

## Purpose

An author profile is a minimal public introduction to a person and their
published thinking. It answers, in order:

1. Who is this person, and what are they trying to understand?
2. What work do they want readers to see first?
3. What have they published recently?
4. What background helps readers understand their work?

The page is not an analytics dashboard, a points ledger, or a complete archive.

## Page hierarchy

The public profile renders these surfaces in this order:

| Surface | Responsibility |
| --- | --- |
| Identity and About | Name, public identity, affiliation, intellectual focus, demonstrated topics, relationship actions, and a short biography |
| Intellectual Record overview | Publications, Source-backed, and Citable counts, showing only those greater than zero |
| Featured | Up to three manually selected eligible publications, in the author's chosen order |
| Latest from the Intellectual Record | The latest three mixed public entries |
| Background | Applicable education, professional context, topics, enabled Research context, and durable recognition |

The full archive lives at `/:username/record`. The profile never renders the
complete publication history.

## Publication count semantics

`Publications` counts original published work by the profile owner plus
published work for which they are an accepted co-author. It includes enabled
Research. It excludes responses and debate arguments.

`Source-backed` and `Citable` are subsets of Publications:

- Source-backed means at least one structured reference exists.
- Citable means a stable `citation_id` exists.

The same summary operation powers onboarding and the public profile. Public
points, likes, reads, reach, contribution tiers, and transient platform badges
are not record evidence and do not appear in these figures.

### Zero suppression

A metric is rendered only when its value is greater than zero, on every
surface, through `getVisibleProfileRecordMetrics` in
`lib/profileRecordMetrics.ts`. The metric row adapts to one, two or three
visible values. A record with nothing in it renders no metrics at all and
falls through to the surface's existing empty state; the profile owner gets a
next action instead, and no completion percentage is shown publicly or
privately. The full record suppresses a filter tab's count when it is zero
while keeping every filter rendered and reachable by URL.

The three metrics are defined once, in `PROFILE_RECORD_METRIC_DEFINITIONS`,
and explained through the `RecordMetricLegend` disclosure rather than a hover
title, so the explanation is available on desktop, touch and keyboard.

## Entry classification

Application surfaces use only these neutral kinds:

- `publication`
- `response`
- `debate`
- `research`

A publication title changes its presentation, not its kind or value. Titled
work renders editorially; untitled work renders compactly. Public UI must not
label either presentation Post or Article.

## Identity fields

`positioning_statement` is a public, optional, nullable text column capped at
180 characters by a database CHECK and by
`POSITIONING_STATEMENT_MAX_LENGTH`. It answers "what subjects, problems or
questions are you trying to understand?", is labelled **Intellectual focus** in
settings, and renders as the author's own prose in the identity area. It is not
a professional title, not a badge, and not a platform-assigned label. It is
preferred as the profile's metadata description, falling back to the biography
and then to the derived identity line. It is not part of onboarding.

## Topics and interests

Two separate claims, kept separate in data and in UI:

- **Demonstrated topics** come only from tags on published authored or
  accepted co-authored work (`deriveDemonstratedTopics`). Every one resolves
  to at least one record entry, so every chip is a working filter. They carry a
  contribution count from the same pass that ranked them.
- **Interests** are what the author declared (`deriveDeclaredInterests`),
  minus anything their work already demonstrates. They never seed a record
  topic filter. They link to platform topic discovery only when the value is an
  exact canonical platform tag; otherwise they render as non-clickable chips.

Topics are grouped case-insensitively by `profileTopicKey` and displayed with
the first spelling encountered. Public UI must not describe a demonstrated
topic as expertise.

## Featured eligibility

Featured contains only manually selected on-platform work. A selection must:

- be published;
- be authored by the owner or list them as an accepted co-author;
- contain no duplicates; and
- contain no more than three entries.

Replacement is atomic. If validation or insertion fails, the existing Featured
selection remains unchanged. There is no automatic most-read fallback.

### Explanations

Each selection may carry an optional `feature_note`: plain text, at most 180
characters, enforced by a database CHECK and by `FEATURE_NOTE_MAX_LENGTH`. A
blank note stores as NULL, so absence has one representation.

Selection, order and notes are one value. They are replaced together by
`replace_my_featured_posts_v2(uuid[], text[])`; the v1 function remains for
deployed clients. Neither can half-apply.

Public rendering shows an explanation only when present, subordinate to the
title and labelled "Why I featured this". A card with no note renders no
caption slot, so one-, two- and three-card layouts stay balanced.

## Full-record query contract

The record route accepts:

- `type=all|publications|responses|debates|research`
- `quality=all|source_backed|citable`
- `page=<positive integer>`

Quality applies only to Publications and Research. An incompatible quality
combination normalizes to Publications. Invalid pages normalize to page 1.
When Research is disabled, its filter is hidden and normalized away. Each page
contains at most 20 entries and filter state is preserved by pagination links.

## Privacy and security

`profile_record_entries` contains identifiers, timestamps, authorship state,
and evidence flags only. It uses invoker security and the source tables' RLS;
content is hydrated from its protected source table.

Private onboarding path and work category never appear in profile queries or
public profile projections. Opportunity readiness details remain private; the
public profile may show only the existing visibility-controlled availability
badge and contact path.

`positioning_statement` is public by design and is added to the reviewed
edit allowlist, the privileged-column guard, and the `profile_directory`
projection in
`supabase/migrations/20260826000001_profile_positioning_statement.sql`.

## Owner workspace

Profile editing is one canonical route, `/settings/profile`, documented in
`docs/profile-command-center.md`. The public profile's own edit links point
there, and `/settings?tab=profile` redirects to it.

The Command Center's preview renders the same components as the public
profile, so the two cannot drift. Research and opportunity identity are edited
there but continue to live in their own tables behind their own RLS.

## Record, expertise and recognition

Three different claims, in three sections, in this order:

- **Intellectual Record** is the work itself: what this person published,
  responded to and argued. It is the archive.
- **Demonstrated expertise** summarises that record by topic, with the counts
  behind each summary. It claims nothing the record does not already contain.
- **Recognition** is what other people and processes did with the work:
  citations, completed reviews, accepted collaborations, verified outcomes.
  Nothing in it is self-awarded.

The order is deliberate. A reader meets the work before any summary of it, and
any summary before what anyone else made of it. See
`docs/credibility-graph.md` for the signal contract and
`docs/profile-command-center.md` for the owner workspace.

## Measurement

The profile conversion funnel is documented in
`docs/profile-conversion-funnel.md`, and the owner-experience events in
`docs/profile-command-center.md`. It uses the existing activation-event
pipeline, carries identifiers and viewer state only, and never carries author
text.
