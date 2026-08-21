# The profile record contract

Last updated: 2026-08-20

## What the profile answers

A profile exists to answer three questions in about three seconds:

1. Who is this?
2. What do they think about?
3. Is any of it real?

Everything on the page serves one of those. Anything that serves none of them
belongs on the dashboard, in settings, or nowhere.

## The four sections

The page renders exactly four sections, in this order, at four deliberately
different visual weights:

| Section | Component | Answers | Weight |
|---------|-----------|---------|--------|
| Identity | `ProfileHeader` | Who is this | Cover, avatar, largest type on the page |
| The record | `RecordPanel` | Is any of it real | The headline claim: three figures and evidence badges |
| The work | `FeaturedWork` + `ProfileContentTabs` + `ResearchProfileCard` | What do they think about | Reading surface |
| Details | `ProfileDetails` | Context only | Quietest: sits on canvas, not on a card |

Adding a fifth top-level section requires deciding which of the three questions
it answers and which existing section it belongs inside instead.

## The three figures

`RecordPanel` shows exactly three numbers:

| Figure | Source | Means |
|--------|--------|-------|
| **Contributions** | `recordSummary.contributionCount` | Volume. Published work plus public debate arguments. |
| **Source-backed** | `recordSummary.sourceBackedCount` | Rigour. Carries at least one structured reference. |
| **Citable** | `recordSummary.citableCount` | Permanence. Has a stable citation ID and an archived record. |

One for volume, one for rigour, one for permanence. All three derive from
`lib/intellectualRecord.ts`, which derives them from inspectable evidence and
never from a content type, a popularity number, or an author's identity.

Changing which three is a product decision, not a display one. A fourth figure
is not a small addition: four equally weighted numbers is what the page had
before, and it is why no reader could find the claim.

## The rule that keeps the record honest

**A figure appears in exactly one place on the page.**

Before this contract, "reviewed work" appeared four times in four vocabularies:
a header stat, a summary detail line, a credibility badge, and a sidebar tile.
A record with two real items was displayed eight times. Repetition reads as
padding, and padding is the opposite of what the record is for.

Concretely:

- `ProfileHeader` carries identity only, and no contribution counts.
- `RecordPanel` is the only place contribution figures appear.
- `ProfileDetails` carries reach and platform recognition, never record figures.

## Evidence versus reach

These are different claims and must not share a surface.

**Evidence** is what `RecordPanel` shows: sourced, reviewed, citable,
co-authored. It comes from the editorial workflow and from structured data
attached to a contribution.

**Reach and recognition** are what `ProfileDetails` shows: reads, likes,
followers, badges, points tier. None of it is evidence that any contribution
was sourced, reviewed, or cited.

Keeping them in separate sections at different visual weights is what stops
popularity from reading as credibility. A points tier next to a citable count,
at the same size, silently claims they mean the same kind of thing.

## Known gaps

These are deliberate, and tracked as later phases:

- **Identity fields are collected and not rendered.** `profile_type`,
  `professional_title`, `organization_name`, `organization_website` and
  `secondary_profile_types` are all written by settings and displayed nowhere.
  Non-academic profile types currently show only a join date as affiliation.
- **The record cannot leave the page.** Profile Open Graph is a 400px avatar
  rather than the branded card at `app/api/og/route.tsx`, and there is no
  export, print stylesheet, or citation block.
- **No time dimension.** Every figure is a lifetime total, so an active
  contributor and a dormant one present identically.
- **`profileCompletionScore` measures form completion, not credibility.** Six
  of its seven checks are text fields. It must be renamed before it is shown
  next to evidence again.
- **The talent marketplace still renders on the profile** even though
  `talentMarketplace` is `false`, because that flag gates navigation rather
  than routes.
