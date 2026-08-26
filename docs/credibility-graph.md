# Credibility graph

Last updated: 2026-08-27

## Purpose

Connect person → work → topic → evidence → citation → review → collaboration →
debate → recognition → verified outcome, so an Indegenius profile becomes more
defensible the longer someone uses it.

Every public credibility claim is derived from a canonical platform record or
explicitly verified by a named party. There is **no** universal credibility
score, no ranking, no leaderboard, no points, no levels, no streaks, and no
badge without provenance.

## Signal types

`lib/credibilityGraph.ts` is the contract. Labels come from
`CREDIBILITY_SIGNAL_COPY`, never from a database column, so a metadata field
cannot smuggle an arbitrary claim onto a profile.

| Signal | Canonical source | How it is earned | How it is lost |
| --- | --- | --- | --- |
| `authored` | `posts` where `status = 'published'` | Publishing | Unpublishing or deletion |
| `accepted_coauthor` | `post_authors.accepted_at` | Accepting a co-author invitation on published work | Removal of authorship, unpublishing |
| `responded_to` | `posts.in_response_to` | Publishing a response | Unpublishing |
| `cited_by` | `post_references.referenced_post_id` | Another **published** work resolves a reference to this work | Either end unpublished, the reference edited away, the citing work deleted |
| `reviewed` | `post_reviews` / `post_editor_decisions` | A reviewer submits a completed review, or an editor accepts | The review row is removed or reset; the work is unpublished |
| `debate_participation` | `debate_arguments` | Publishing an argument in a public debate | The argument is removed |
| `debate_completion` | `debates.status = 'closed'` | Taking part in a debate that ran to completion | The debate is cancelled |
| `verified_opportunity_selection` | `opportunity_outcomes` | Verified by a third party **and** published by the owner | Dispute, revocation, owner unpublishing |
| `verified_opportunity_completion` | `opportunity_outcomes` | As above, at completion stage | As above |
| `verified_external_recognition` | `opportunity_outcomes` with `source_type = 'external'` | Administrator verification | As above |

### There is no `debate_winner`

Debate ballots exist (`20260718000002`), but that migration states plainly
that they are private and a public aggregate-results function is deferred.
Until a canonical judged result exists, a winner could only be inferred from
votes, likes or follower counts. Inferring an intellectual outcome from
popularity is the thing this graph exists to avoid, so
`UNSUPPORTED_SIGNAL_KINDS` names it explicitly and a test asserts its absence.
Participation and completion are facts; a winner is not yet one.

## Citation semantics

A citation edge exists when one **published** work resolves a reference to
another **published** work.

- `post_references.referenced_post_id` is the durable relation. The original
  `url` and every other bibliographic field are preserved untouched.
- Resolution happens at save time (`lib/citationResolution.ts`) and for
  history in the backfill inside `20260827000001`.
- Only two URL shapes resolve: `/post/<slug>` and
  `/publication/<citation_id>`. Profiles, topic pages and the record do not,
  because they are not citable works. No external URL ever matches, and no
  fuzzy matching is attempted: a wrong match invents a citation nobody made.
- **One edge per (citing work, cited work)**, enforced by a partial unique
  index. A bibliography that lists the same source three times produces one
  edge. Occurrence counts are deliberately not produced.
- Credit flows to the cited work's author **and** every accepted co-author.
- **Self-citations are flagged, not deleted**, and excluded from the headline
  count. `get_public_credibility_summary` returns them separately.
- Unpublishing either end removes the edge from every aggregate in the same
  statement, because the view reads `status` directly rather than caching.

Public language: "Cited by 3 Indegenius publications", linking to the citing
works. Never described as a measure of quality.

## Review privacy

`public_review_signals` exposes only that a published work completed a review
workflow, and which kind.

Never exposed: reviewer identity, review notes, editor notes, or the
recommendation itself. An "accept" and a "revise" are both completed reviews,
and publishing which one would leak the editorial judgment.

- `peer_reviewed` comes from `post_reviews` with a submitted recommendation.
- `editorially_reviewed` comes from `post_editor_decisions` with
  `decision = 'accept'`.
- Moderation approval produces **neither**. Calling it peer review would make
  every review label worthless.
- A reviewer cannot review their own work: the view excludes rows where the
  reviewer is the author or an accepted co-author, so even a historical row
  cannot produce a signal.
- `min(submitted_at)` deduplicates repeated status transitions.

## Collaboration semantics

Accepted authorship only. Pending and declined invitations do not count, and
removed authorship disappears. Tagging and commenting are not collaboration.
`is_blocked_pair` is applied in both directions, so a blocked person never
appears as a collaborator. Collaborators are never publicly ranked.

Public language: "4 accepted collaborations", "worked with 3 contributors".

## Opportunity verification workflow

Three gates stand between a claim and a public statement:

1. The outcome reaches a publicly eligible state (`selected`, `completed`).
2. Someone **other than the claimant** verifies it.
3. The profile owner **separately** chooses to publish it.

| State | Public? |
| --- | --- |
| `contacted`, `shortlisted`, `declined`, `disputed`, `revoked` | Never |
| `selected`, `completed` | Only after verification **and** owner consent |

- Owner submits → private, unverified. Needs a verifier.
- Provider submits → private, unconfirmed. Needs the owner.
- **Self-assertion alone never produces public recognition.** Two table
  constraints forbid a verifier who is the submitter or the profile owner.
- Who may verify: an administrator, or the sender of the talent inquiry the
  outcome came from. External outcomes always require an administrator.
- Confirming is not publishing. An owner may confirm an outcome is true and
  keep it private.
- Dispute takes it private immediately; revocation is terminal.
- Every transition is written to the append-only
  `opportunity_outcome_events`.
- `opportunity_outcomes` grants **no INSERT or UPDATE** to `authenticated`.
  Every transition runs through a `SECURITY DEFINER` function with a fixed
  empty search path that checks authorization first. A client cannot award
  itself recognition because it cannot write rows.
- Idempotent on (profile, source, stage): a retry updates, never doubles.

Private forever: evidence notes, dispute reasons, submitter identity,
verifier identity, and any non-eligible state.

## Demonstrated expertise

`lib/demonstratedExpertise.ts`. Declared interests are **never** evidence.

A topic qualifies when it has either:

- **two or more** substantive public contributions, or
- **one** contribution carrying a stronger signal: a completed review, an
  inbound citation, or a stable citation record.

Both grounds are inspectable facts. There is no weighted score threshold, and
an author can read the rule and know exactly why a topic does or does not
appear.

Summaries are assembled from counts in a fixed order with no adjectives:

> 6 contributions on public health, including 1 reviewed contribution and 2
> inbound citations from other publications.

The function has no clause that could emit "leading", "expert", "top" or
"highly regarded", and a test asserts it. Topics normalize
case-insensitively and keep the author's own spelling. Representative works
are selected deterministically, strength first, with the post id breaking
ties. Debate contributions are counted but cannot qualify a topic alone.

## Recognition projection

Public, bounded, grouped. `groupRecognitionSignals` collapses repeated signals
of one kind into a count with a few examples, so a heavily cited author gets a
line rather than forty rows. Authorship and responses are excluded: those are
the Intellectual Record's job.

A signal reaches a visitor only if it is unrevoked, public, and carries an
inspectable source URL. The section is hidden entirely from visitors when
empty; owners see private guidance instead.

Profile hierarchy, unchanged in order: Identity → Featured Work → Intellectual
Record → Demonstrated expertise → Recognition → Background.

## Anti-gaming rules

| Rule | Where enforced |
| --- | --- |
| Self-citations excluded from headline counts | `get_public_credibility_summary` |
| Duplicate references produce one edge | Partial unique index |
| Self-review produces no signal | `public_review_signals` WHERE clause |
| Pending co-authorship excluded | `accepted_at IS NOT NULL` |
| Unverified outcome claims excluded | Table constraint plus the public view |
| Removed or unpublished sources excluded | Views read `status` directly |
| Revoked outcomes excluded | Constraint, view, and RPC |
| Client cannot award credibility | No INSERT/UPDATE grant; RPC-only writes |
| Verifier is never the claimant | Two table constraints and the RPC check |
| Metadata cannot smuggle labels | Labels come from `CREDIBILITY_SIGNAL_COPY` |

## Rollout

Everything is behind `NEXT_PUBLIC_CREDIBILITY_GRAPH_ENABLED`. The flag gates
reads and writes of the new column and tables so the application can deploy
before `20260827000001` to `20260827000003` are applied; a select naming a
column PostgREST does not know about fails outright, and one of those selects
is on the public profile.

The flag changes no schema and creates no divergent public projection: with it
off, the sections are absent and the loaders return empty.

The citation backfill is idempotent (it fills only NULLs and takes only the
first occurrence per pair), so it is safe to re-run.

## Analytics

`profile_recognition_opened`, `profile_recognition_source_opened`,
`profile_expertise_topic_opened`, `opportunity_outcome_submitted`,
`opportunity_outcome_verified`, `opportunity_outcome_visibility_changed`.

Authoritative transitions are reported after persistence, never on a click.
Payloads carry ids, states and counts only: never review text, evidence
contents, application messages, compensation, contact information, dispute
notes, or outcome titles.
