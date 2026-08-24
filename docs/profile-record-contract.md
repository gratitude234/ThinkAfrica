# Intellectual Profile V2 contract

Last updated: 2026-08-24

## Purpose

An author profile is a minimal public introduction to a person and their
published thinking. It answers, in order:

1. Who is this person?
2. What work do they want readers to see first?
3. What have they published recently?
4. What background helps readers understand their work?

The page is not an analytics dashboard, a points ledger, or a complete archive.

## Page hierarchy

The public profile renders these surfaces in this order:

| Surface | Responsibility |
| --- | --- |
| Identity and About | Name, public identity, affiliation, topics, relationship actions, and a short biography |
| Intellectual Record overview | Publications, Source-backed, and Citable counts |
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

## Entry classification

Application surfaces use only these neutral kinds:

- `publication`
- `response`
- `debate`
- `research`

A publication title changes its presentation, not its kind or value. Titled
work renders editorially; untitled work renders compactly. Public UI must not
label either presentation Post or Article.

## Featured eligibility

Featured contains only manually selected on-platform work. A selection must:

- be published;
- be authored by the owner or list them as an accepted co-author;
- contain no duplicates; and
- contain no more than three entries.

Replacement is atomic. If validation or insertion fails, the existing Featured
selection remains unchanged. There is no automatic most-read fallback.

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
