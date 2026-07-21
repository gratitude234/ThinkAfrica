# Debate V2 product contract

Status: **Phase 1 — product contract and additive data foundation.**
Scope of this document: what Debate V2 is, the roles/lifecycle/signals it
introduces, and the invariants that keep Debate V1 fully intact while V2's
schema is laid down underneath it. It is written to match
`supabase/migrations/20260718000002_debate_v2_foundation.sql` exactly — table
and column names below are the real, additive schema, not a proposal.

No V2 UI, lifecycle automation, notification delivery, AI assistance, or
server-side enforcement ships in this phase. See [Non-goals](#g-non-goals-for-phase-1).

## A. Goals

- Turn debates into guided intellectual events rather than two ranked comment
  columns.
- Separate three things V1 conflates into "upvotes": **debating** (making
  arguments), **judging the motion** (does the room agree with the claim),
  and **evaluating argument quality** (was a specific argument well-made).
- Support direct argument relationships (a rebuttal that answers a specific
  claim, not just "round 2").
- Measure initial opinion, final opinion, confidence movement, and
  persuasion — not just a final tally.
- Preserve debates as durable, citable records of reasoning, not ephemeral
  threads.
- Keep AI assistive (recaps, prompts, summaries) rather than authoritative
  (AI never decides a winner, a phase transition, or a ballot).

## B. Roles

Debate V2 defines three membership roles, tracked in
`public.debate_memberships`:

| Role | Meaning |
|------|---------|
| `moderator` | Frames the motion, runs the room, advances phases (V2 lifecycle, later phase). |
| `debater` | Argues one side of the motion. |
| `juror` | Evaluates the debate — casts ballots and quality reactions — without arguing. |

A user may hold more than one role in the same debate. A moderator may also
be recorded as a debater; debaters may still cast ballots as jurors do. This
is why membership is keyed on `(debate_id, user_id, role)` rather than one
role per person per debate — each role is its own row.

A **debater** has exactly one locked stance per debate:

- `for`
- `against`

`juror` and `moderator` memberships never carry a stance — judging the
motion and running the room are stance-neutral. The schema enforces this
directly: `debate_memberships` has a table constraint requiring
`role = 'debater'` to have `stance IN ('for', 'against')`, and every other
role to have `stance IS NULL`.

## C. Lifecycle

The target V2 lifecycle, one debate moving through ordered rounds:

1. Open lobby
2. Opening statements
3. Rebuttal
4. Cross-examination
5. Closing statements
6. Final vote
7. Closed / archive

`public.debate_rounds` is the future source of truth for this lifecycle:
each row is one instance of a phase (`opening`, `rebuttal`,
`cross_examination`, `closing`, `final_vote`) for a debate, with its own
`status` (`scheduled`, `active`, `completed`, `cancelled`), timing, and a
partial unique index guaranteeing at most one `active` round per debate at
any time.

**V1 compatibility, explicit:**

- `debates.status` (`open` / `active` / `closed`) is unchanged and remains
  authoritative for V1 debates.
- `debates.current_phase` (`opening` / `rebuttal` / `closing`) is unchanged
  — Phase 1 does not remove, reinterpret, or dual-write it.
- `debate_rounds` is created but dormant: nothing in Phase 1 inserts rows
  into it, transitions its `status`, or reads it from any page. It exists so
  Phase 2 can implement lifecycle functions and V1↔V2 synchronization
  without a later schema migration blocking that work.

## D. Separate signals

Debate V2 deliberately keeps these seven signals distinct instead of folding
them into one "winner":

1. **Membership role** — `debate_memberships.role`: who is a moderator,
   debater, or juror.
2. **Debater stance** — `debate_memberships.stance`: which side a debater
   locked in.
3. **Initial/final motion ballot** — `debate_ballots` (`stage IN ('initial',
   'final')`, `vote IN ('for', 'against', 'undecided')`): what a person
   thought before and after the debate.
4. **Confidence score** — `debate_ballots.confidence` (1–5): how sure they
   are of that ballot.
5. **Argument-quality reactions** — `debate_reactions.reaction_type`: is a
   specific argument well-supported, clear, a strong rebuttal, etc.
6. **Persuasion / "changed my mind" feedback** — the `changed_my_mind`
   reaction value, plus the initial→final delta on an individual's own
   ballot pair.
7. **Final community verdict** — the aggregate of final-stage ballots,
   computed later (Phase 1 does not expose an aggregate function; see
   [Phase 1 invariants](#f-phase-1-invariants)).

No Phase 1 table or column collapses these into a single score. A later
phase may present a summary view, but it will be built by combining these
seven signals explicitly, not by inventing an eighth "winner" column that
hides how it was derived.

## E. Argument model

`debate_arguments` gains additive, nullable columns so it can carry a graph
of relationships on top of the flat V1 list:

**Argument relationships** (`relation_type`) — what a new argument does to
the one it targets (`parent_argument_id`):

- `supports`
- `challenges`
- `answers`
- `clarifies`

**Argument quality reactions** (`debate_reactions.reaction_type`) — how
readers evaluate a specific argument:

- `well_supported`
- `strong_reasoning`
- `clear`
- `strong_rebuttal`
- `fair_to_opposition`
- `changed_my_mind`
- `needs_evidence`

Arguments can also carry a structural `entry_type` (`opening`, `claim`,
`rebuttal`, `answer`, `closing`) describing what kind of move it is within a
round, independent of `relation_type`, which describes its relationship to a
specific parent. Cited evidence lives in `debate_argument_sources`, one row
per URL attached to an argument.

## F. Phase 1 invariants

- **Everything in the Phase 1 migration is additive.** No column is
  dropped, renamed, retyped, or made newly required on a populated table
  without a safe default.
- **V1 remains the default.** `debates.format_version` defaults to `1` and
  is checked into `(1, 2)`; nothing in this phase writes `2`. The existing
  debate creation UI (`app/(main)/debates/create/page.tsx`) is untouched.
- **Existing `debate_participants` rows remain valid** — untouched, still
  the live table backing V1's "Argue FOR / AGAINST" join flow
  (`join_debate`).
- **Existing `debate_motion_votes` rows remain valid** — untouched, still
  the live table backing V1's community vote (`cast_motion_vote`).
- **Existing `debate_arguments` inserts remain valid** — every new column
  added to this table is nullable (or has a safe default), so the V1
  `ArgumentForm` insert (`debate_id`, `author_id`, `content`,
  `round_number`, `stance`) is unaffected.
- **V2 tables are dormant until later phases activate them.** Phase 1
  creates `debate_memberships`, `debate_rounds`, `debate_argument_sources`,
  `debate_reactions`, `debate_ballots`, `debate_subscriptions`, and
  `debate_moderation_events` with public or self-only read access, but no
  Phase 1 code path writes to them except the one-time backfill described
  below.
- **Direct client writes to sensitive new tables are not enabled
  prematurely.** None of the seven new tables gets an INSERT/UPDATE/DELETE
  RLS policy in Phase 1. Phase 2 introduces `SECURITY DEFINER` RPCs (mirroring
  `join_debate` / `cast_motion_vote`) that will own writes to these tables,
  the same pattern V1 already uses.
- **Individual ballot data is private even though aggregate results will
  later be public.** `debate_ballots` only grants each user a SELECT policy
  scoped to `auth.uid() = user_id`. There is no public aggregate view yet —
  Phase 2 will add one, computed server-side, without exposing individual
  rows.
- **Server-side lifecycle and contribution enforcement is explicitly
  deferred to Phase 2.** Phase 1 does not add round-transition functions,
  scheduled jobs, argument limits, or word-limit enforcement for any V2
  table.

### Hardening pass (added before this migration was applied)

A follow-up review of the Phase 1 migration found gaps that plain
additivity doesn't close on its own. All of the following were added to
`supabase/migrations/20260718000002_debate_v2_foundation.sql` directly
(it had not yet been applied anywhere), not as a second migration:

- **Same-debate referential integrity.** A plain foreign key only proves a
  referenced row exists — not that it belongs to the same debate. Triggers
  (`debate_arguments_check_same_debate()`, `debate_ballots_check_same_debate()`)
  now reject a `debate_arguments.round_id`, `debate_arguments.parent_argument_id`,
  or `debate_ballots.influential_argument_id` that points at a row from a
  *different* debate. A composite foreign key was considered and rejected:
  correctly preserving `ON DELETE SET NULL` on a composite key needs
  Postgres 15's column-list `SET NULL` syntax, which this repo has no local
  harness to confirm, and getting it wrong risks the referenced row's
  deletion failing outright (nulling a `NOT NULL` `debate_id`).
- **Argument relationship pairing.** `parent_argument_id` and
  `relation_type` must now be both `NULL` or both set — a `CHECK`
  constraint (`debate_arguments_parent_relation_pairing_check`), since a
  relation type with no parent (or vice versa) isn't meaningful.
- **`debate_memberships` drift.** The Phase 1 backfill is a one-time
  snapshot; V1's live write paths (`join_debate()`, and the direct
  `debates` insert in `app/(main)/debates/create/page.tsx`) keep writing to
  `debate_participants`/`debates.moderator_id` afterward, which Phase 1
  deliberately never touches. Two lightweight `SECURITY DEFINER` triggers
  (`sync_debate_participant_membership`, `sync_debate_moderator_membership`)
  now mirror new inserts into `debate_memberships` as they happen. They are
  intentionally narrow (`AFTER INSERT` only — neither write path updates
  these tables after the initial insert today) and **do not** make
  `debate_memberships` authoritative on their own: Phase 2 **must** run a
  full catch-up backfill, identical in shape to the Phase 1 one, before
  treating it as complete — to catch moderator reassignment, a moderator's
  profile being deleted (`ON DELETE SET NULL` on `moderator_id`), or any
  write that reaches these tables outside the two paths above.
- **`format_version` is not a secure activation boundary by itself.**
  Neither the debate-creation INSERT policy nor the moderator UPDATE policy
  ever mentioned `format_version`, and debate creation is a direct
  `authenticated`-role client insert with no RPC gatekeeping it — so
  nothing stopped a client from writing `format_version = 2` today, years
  before any V2 creation flow exists to back that debate with real data. A
  new trigger (`debates_guard_format_version()`) now rejects
  `format_version = 2` specifically from an `authenticated` JWT role. This
  intentionally also blocks a *future* `SECURITY DEFINER` RPC invoked by an
  ordinary end-user session (`auth.role()` reflects the original request's
  JWT, not the executing function's privilege level) — Phase 2's controlled
  activation path must add its own explicit, reviewed bypass, not inherit a
  silent one.
- **`profiles.role`/`verified`/`verified_type` were directly
  client-writable.** Not a Debate V2 table, but surfaced while auditing the
  trust boundary `debate_moderation_events` and other privileged reads rely
  on (`profiles.role IN ('editor', 'admin')`): "Users can update their own
  profile" is row-level only (`auth.uid() = id`, no `WITH CHECK`, no column
  restriction), so any authenticated user could set their own `role` to
  `admin` or `verified` to `true` via a direct `.update()`. A column-level
  `REVOKE` does not fix this in this project — this repo already hit that
  exact dead end for `posts.like_count`
  (`20260715000004_protect_like_count_with_dedicated_table.sql`): Supabase's
  default project setup grants table-level `UPDATE` to `authenticated`, and
  a column-level `REVOKE` on top of a standing table-level `GRANT` has no
  effect. A new trigger (`protect_profile_privileged_columns()`) blocks
  changes to these three columns specifically from an `authenticated` JWT
  role, leaving the service-role admin verification workflow
  (`app/(main)/admin/verification/actions.ts`) and every ordinary
  self-service profile edit (verified to never touch these columns today)
  unaffected.

### Correction pass (edge cases found in the hardening pass itself)

A further review, focused specifically on edge cases, found gaps the
hardening pass introduced or left incomplete. All four were fixed in place
in the same migration file:

- **Parent-argument delete path.** `parent_argument_id` uses
  `ON DELETE SET NULL`, so deleting a parent argument makes Postgres run an
  internal `UPDATE ... SET parent_argument_id = NULL` on every argument that
  pointed at it. The hardening pass's own
  `debate_arguments_parent_relation_pairing_check` would then reject that
  update — `relation_type` stays at its old non-null value while
  `parent_argument_id` becomes null — aborting the parent's deletion
  entirely. A new trigger
  (`debate_arguments_clear_relation_on_parent_null()`) clears
  `relation_type` in the same update whenever `parent_argument_id`
  transitions from set to null, whether from the cascade or a future
  explicit detach.
- **`debate_id` was still reassignable.** The same-debate checks validate a
  cross-reference against the row's *current* `debate_id`, but nothing
  stopped `debate_id` itself from being changed after creation — which
  would silence those checks rather than satisfy them. `debate_id` is now
  immutable after creation on `debate_rounds`, `debate_arguments`, and
  `debate_ballots` (`prevent_debate_id_change()`, one shared trigger
  function attached to all three — no legitimate reason was found for any
  of them to move between debates).
- **`format_version` was only guarded in one direction.** The original
  guard only rejected writing `format_version = 2`, leaving a `2 → 1`
  change wide open for an authenticated client. `debates_guard_format_version()`
  now blocks a change in either direction on `UPDATE`, while `INSERT` is
  checked against the literal value `1` instead (there is no `OLD` row on
  insert) — so a plain debate-creation insert, which never sets
  `format_version` and resolves to the column's own `DEFAULT`, still works.
- **`profiles` INSERT had the same gap as UPDATE.** The "Users can insert
  their own profile" policy is exactly as column-blind as the UPDATE policy
  the hardening pass fixed. A new `BEFORE INSERT` trigger
  (`protect_profile_privileged_columns_on_insert()`) closes it — but unlike
  the UPDATE trigger, it does not reject the insert outright: it resets
  `role`/`verified`/`verified_type` to their safe defaults and lets the row
  still get created, since an INSERT has no existing row to fall back to
  the way an UPDATE does. It is gated on `auth.role() = 'authenticated'`
  exactly like every other guard in this migration, so it never observes
  `handle_new_user()`'s insert — that trigger runs through Supabase Auth's
  own internal connection (no JWT role claim, `auth.role()` reads `NULL`
  there), which is what performs automatic university-email verification
  via `is_university_email()`.

## G. Non-goals for Phase 1

Explicitly deferred to later phases:

- New debate pages or components
- Automatic round transitions
- Scheduled jobs
- New join/vote/reaction RPCs
- Argument limits
- Server-side word limits
- Cross-examination UI
- Notification delivery
- AI assistance
- Recap redesign
- Moderation dashboard
- Analytics dashboards
- Removal of legacy columns or tables

## Schema reference (Phase 1)

Added by `supabase/migrations/20260718000002_debate_v2_foundation.sql`:

| Table | Purpose | Write access in Phase 1 |
|-------|---------|--------------------------|
| `debates.format_version` (column) | V1/V2 discriminator | Existing INSERT/UPDATE policies only, gated by `debates_guard_format_version()` — no path can set `2` from an authenticated session |
| `debate_memberships` | Role + stance per person per debate | None directly (public read only); kept current by `sync_debate_participant_membership()` / `sync_debate_moderator_membership()` mirroring V1 writes — see hardening pass below |
| `debate_rounds` | V2 lifecycle instances | None (public read only) |
| `debate_arguments` (new columns) | Argument graph + entry type | Existing INSERT policy only (new columns stay NULL) |
| `debate_argument_sources` | Cited evidence per argument | None (public read only) |
| `debate_reactions` | Argument-quality feedback | None (public read only) |
| `debate_ballots` | Initial/final motion ballots + confidence | None (self-only read) |
| `debate_subscriptions` | Per-user notification preferences | None (self-only read) |
| `debate_moderation_events` | Append-only moderation audit log | None (moderator/editor/admin read only) |

## Phase 2 finalized rules

Phase 1 deliberately left several rules undecided pending server-side
enforcement. Phase 2
(`supabase/migrations/20260718000003_debate_v2_lifecycle_permissions.sql`,
[docs/debate-v2-phase2-lifecycle.md](debate-v2-phase2-lifecycle.md)) finalized
them as follows — this section records only the decisions themselves; see
the Phase 2 doc for the full design and reasoning:

- **Word limits**: opening 300, rebuttal 200, closing 150 (distinct from
  V1's `lib/debatePhases.ts` limits, which remain unchanged for V1 debates).
- **Submission limits**: one opening, at most two rebuttals, one closing per
  debater. Cross-examination and final-vote general argument submission are
  explicitly rejected.
- **Seeded round duration**: `activate_debate_v2` defaults every seeded
  round's `duration_minutes` to `debates.round_duration_minutes`, per the
  Phase 1 schema comment's own suggestion.
- **Ballot confidence**: required (1–5) for every V2 ballot via
  `cast_debate_ballot_v2`, stricter than the schema's own nullable
  `debate_ballots.confidence` column.
- **Minimum sample threshold for aggregate confidence**: 3 ballots in a
  stage, below which `average_confidence` is returned as `null`.
- **Extension bound**: `extend_debate_round_v2` caps a single extension at
  60 minutes.
- **Closure kind**: a new additive `debates.closure_kind` column
  (`'completed' | 'forced'`, nullable, `NULL` for every V1 debate) records
  which kind of closure a V2 debate had.
