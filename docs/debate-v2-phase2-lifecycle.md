# Debate V2 Phase 2: lifecycle, permissions, and enforcement

Status: **Phase 2 — lifecycle, permissions, atomic participation RPCs, and
server-side enforcement.** Builds directly on
[docs/debate-v2-product-contract.md](debate-v2-product-contract.md) (Phase 1
product contract) and
`supabase/migrations/20260718000002_debate_v2_foundation.sql` (Phase 1's
additive schema, **not edited** by this phase). This phase's migration is
`supabase/migrations/20260718000003_debate_v2_lifecycle_permissions.sql`.

No Debate V2 UI ships in this phase. Everything here is database/server
enforcement that a later phase's UI will call into.

## Deployment status

Neither this migration nor Phase 1's has ever been executed against a real
Postgres/Supabase environment — this repo has no local Postgres harness (see
CLAUDE.md). Both have been verified by static SQL review and by the pure-JS
contract ports in `lib/debateV2Lifecycle.test.ts` / `lib/debateV2.test.ts`,
not by execution. **Both migrations must be applied, in order, to a staging
Supabase environment and verified there before either is considered
deployable.** Contract tests prove this module's logic matches the SQL it
mirrors by inspection; they cannot exercise real transactions, RLS, triggers,
row locks, or function grants.

A staging-readiness review found four blocking concurrency/authorization
issues and three secondary ones before this migration was considered ready
(see the "Hardening pass" note under [Automatic transition
behaviour](#automatic-transition-behaviour) for the full list and fixes). A
follow-up review of that pass found three further issues (see the "Second
hardening pass" note directly below it): authorization was still checked
before, not after, each lifecycle lock; the cron batch counted no-ops as
successful transitions; and duplicate extension requests could stack since
the compare-and-swap only checked the round id, which extending never
changes. All were fixed statically in this same migration file. **Real
staging Postgres testing is still required** to confirm each fix actually
holds under genuine concurrency, specifically: a double-advance/round-skip
attempt, cron racing a concurrent extension, a moderator-reassignment
scenario (including one that lands *between* a manager's authorization
check and their lock acquisition), a suspended caller attempting each of
the four gated functions, the participation-window TOCTOU races, duplicate
(double-click/retried) extension requests, the cron batch's
started/advanced/skipped counts, the function EXECUTE grants, and
ballot-privacy visibility. Contract tests alone cannot substitute for this.

## A. V1/V2 separation

Every V1 RPC that could plausibly run against a debate now rejects a
Debate V2 (`format_version = 2`) row with a clear exception, instead of
silently applying V1 semantics to it. Each function's full body was
reproduced from its **true latest** definition — traced through every
migration that has ever redefined it, not assumed from the first version
seen:

| Function | Latest prior definition | V2 guard added |
|---|---|---|
| `join_debate` | `20260423000012_debate_participants.sql` (never redefined) | rejects `format_version = 2` |
| `cast_motion_vote` | `20260423000013_debate_motion_votes.sql` (never redefined) | rejects `format_version = 2` |
| `toggle_debate_vote` | `20260402000000_phase2_schema.sql` (never redefined) | rejects `format_version = 2`; **also** gets a closed-debate check it never had (V1 correction, see below) |
| `start_debate` | `20260501000001_debate_v1_polish.sql` (never redefined) | rejects `format_version = 2` |
| `advance_debate_phase` | `20260501000001_debate_v1_polish.sql` (never redefined) | rejects `format_version = 2` |
| `close_debate` | `20260501000001_debate_v1_polish.sql` (never redefined) | rejects `format_version = 2`; also fixes a latent "debate not found" false positive for a debate whose moderator's profile was deleted (bundled correctness fix, not a behaviour change for any debate with an intact moderator) |

`debate_arguments`'s INSERT policy had already been redefined **twice** since
Phase 1's own migration comment attributed it to
`20260501000001_debate_v1_polish.sql` — its true latest version, as of this
migration, is `20260704000001_trust_safety_v1.sql`, which added a suspension
check. This phase's replacement policy preserves every one of those
conditions exactly and adds `AND format_version = 1` to the debate-existence
check, so a V2 argument can never be inserted directly — only through
`submit_debate_argument_v2`, which is `SECURITY DEFINER` and bypasses RLS
entirely.

### V1 security corrections (not V2 behaviour)

Two gaps were found and fixed while auditing these six functions, called out
separately because they are V1 bugs, not part of the V2 rollout:

1. **`toggle_debate_vote` never checked the argument's debate status at
   all** — a closed V1 debate's arguments could still be upvoted through a
   direct RPC call after the UI's button disables itself. Fixed by resolving
   the argument's debate (which the original also never confirmed existed)
   and rejecting a closed debate, using the function's own existing
   "return a JSON error object" convention rather than switching to `RAISE`.
2. **All six V1 RPCs carried Postgres's default `EXECUTE`-to-`PUBLIC`
   grant** — none had ever received an explicit `REVOKE`/`GRANT` in any
   prior migration, so literally `anon` (not just `authenticated`) could
   call them. Each function already rejects an unauthenticated caller
   internally, so this was not exploitable, but it is exactly the
   default-privilege audit this phase's function-security review calls for,
   and all six were already being replaced in this migration. Fixed with an
   explicit `REVOKE ALL ... FROM PUBLIC` / `GRANT EXECUTE ... TO
   authenticated` pair for each (`CREATE OR REPLACE FUNCTION` preserves a
   function's existing ACL when its signature is unchanged, so without this
   the PUBLIC grant would have silently carried forward).

### RLS policy replacement

- **`debates` UPDATE** (`"Moderators can update their debates"`,
  `20260402000000_phase2_schema.sql`) was `USING (auth.uid() = moderator_id)`
  with no `WITH CHECK` — too broad for V2. Replaced with `"V1 moderators can
  update their own V1 debates"`: `USING (auth.uid() = moderator_id AND
  format_version = 1) WITH CHECK (auth.uid() = moderator_id AND
  format_version = 1)`. A V1 moderator's direct update behaves exactly as
  before; no authenticated update — moderator or otherwise — can touch a
  `format_version = 2` row through this policy, in either direction. Every
  V2 lifecycle change instead goes through a `SECURITY DEFINER` function that
  performs its own `can_manage_debate_v2()` check before bypassing RLS as
  its owner. (The only direct `.update()` on `debates` anywhere in this
  codebase, `app/api/debate-recap/route.ts`, already goes through the
  service-role admin client and is unaffected either way.)
- **`debate_arguments` INSERT**: see above.
- **No other Phase 1 V2 table's RLS was touched.** `debate_memberships`,
  `debate_rounds`, `debate_argument_sources`, `debate_reactions`,
  `debate_ballots`, `debate_subscriptions`, and `debate_moderation_events`
  already had no INSERT/UPDATE/DELETE policy at all from Phase 1 — direct
  client writes to any of them were already fully blocked by RLS's
  default-deny, and this phase does not weaken that. Every new write path is
  a `SECURITY DEFINER` function that validates first, then bypasses RLS as
  its owner.

## B. Authorization matrix

| Actor | Can manage a V2 debate (`can_manage_debate_v2`)? |
|---|---|
| `debates.moderator_id` | Yes |
| A `debate_memberships` row with `role = 'moderator'` | Yes |
| An editor (`profiles.role = 'editor'`) | Yes |
| An admin (`profiles.role = 'admin'`) | Yes |
| Any other authenticated user | No |
| Unauthenticated (`auth.uid()` is null / `p_actor_id` is null) | No — missing authentication is always a failure |

`can_manage_debate_v2(p_debate_id, p_actor_id)` centralizes this so every
lifecycle RPC calls one reviewed function instead of re-deriving slightly
different checks. It is **not** `SECURITY DEFINER` — `debates`,
`debate_memberships`, and `profiles` are all already publicly `SELECT`-able
under Phase 1's RLS, so there is no privilege gap to bridge. Neither it nor
its own helper `is_editor_or_admin(p_user_id)` is granted to any client role;
both are reachable only by composition from inside the `SECURITY DEFINER`
functions below, which run under their shared owner's privileges regardless
of who invoked the outer RPC.

`p_actor_id` is never trusted blindly. Every authenticated-facing RPC derives
it from `auth.uid()` itself before passing it to `can_manage_debate_v2`.
`activate_debate_v2` is the one exception — it is `service_role`-only and
receives `p_actor_id` as a parameter (since the caller isn't necessarily an
end-user's own authenticated session) — but it still independently verifies
that id against the debate's actual moderator/membership/role data before
proceeding; it never assumes the id is correct just because it was supplied.

## C. Lifecycle state machine

```
Open lobby --(start_debate_v2 / auto: starts_at due)--> Opening (active)
Opening --(advance_debate_round_v2 / auto: ends_at due)--> Rebuttal (active)
Rebuttal --(advance)--> Cross-examination (active)
Cross-examination --(advance)--> Closing (active)
Closing --(advance)--> Final vote (active)
Final vote --(advance / auto)--> Debate closed (closure_kind = completed)

Any V2 state --(close_debate_v2 p_force=true, reason required)--> Debate closed (closure_kind = forced)
```

`debate_rounds` is the authoritative lifecycle source for V2, exactly as
Phase 1's contract designated it. `debates.status` still gets written
(`open` → `active` → `closed`) because plenty of existing reads key off it
generically, but `debates.current_phase` is **deliberately left untouched**
by every V2 transition: its own `CHECK` constraint only allows
`opening`/`rebuttal`/`closing`, with no `cross_examination` or `final_vote`
value to represent V2's five phases — writing to it would either violate
that constraint or misrepresent the round. Any future reader that needs a
V2 debate's phase must read `debate_rounds`, never `current_phase`.

### Manual transition behaviour

- **`start_debate_v2(p_debate_id)`** — manager-only. Requires
  `format_version = 2` and `status = 'open'`. Locks the debate and the
  sequence-1 (`opening`) round. Marks it `active`, sets `started_at`,
  `starts_at` (if absent), and `ends_at` from `duration_minutes`. Sets
  `debates.status = 'active'`. Idempotent: a second call returns
  `{ already_started: true, ... }` instead of erroring — see the "double
  advance" hardening note below for why the ordering of that idempotency
  check matters.
- **`advance_debate_round_v2(p_debate_id, p_expected_round_id)`** —
  manager-only. `p_expected_round_id` is **required**: the caller passes the
  round id it rendered/observed as active. Locks the debate and its active
  round, completes it, and activates the next sequence atomically. Moving
  on from `final_vote` closes the debate (`closure_kind = 'completed'`)
  instead of creating a sixth round — there is no round after `final_vote`.
- **`extend_debate_round_v2(p_debate_id, p_expected_round_id, p_expected_ends_at, p_minutes)`**
  — manager-only. `p_expected_round_id` **and** `p_expected_ends_at` are
  both **required** — round id alone is not sufficient here, since
  extending a round never changes its id, so two duplicate requests (a
  double-click, a client retry) would both see the same "expected" round
  still active and both apply their own extension on top of each other.
  `p_expected_ends_at` is the caller's last-observed `ends_at`; only a call
  whose expectation still matches the round's *current* `ends_at` proceeds.
  Requires an active round. `p_minutes` must be positive and **at most 60**
  (chosen: long enough to meaningfully help a slow room, short enough that a
  mis-click or repeat call cannot silently freeze a debate for hours).
  Updates `ends_at` atomically.
- **`close_debate_v2(p_debate_id, p_force, p_reason)`** — manager-only.
  Normal close (`p_force = false`) requires `final_vote` to already be the
  active round, and **completes** it. Forced close requires a non-empty
  `p_reason` and **cancels** the active round instead of completing it — the
  two are never conflated: `closure_kind` (`completed`/`forced`) and the
  audit action name (`debate_completed`/`debate_force_closed`) both record
  which happened. Idempotent: closing an already-closed debate returns
  `{ already_closed: true }`.

Both `advance_debate_round_v2` and the automatic batch job (below) call the
**same internal function**, `advance_or_close_debate_round_v2`, so "manual"
and "automatic" transitions can never diverge into two implementations of
the same state machine. Likewise `start_debate_v2` and the batch job's
opening-round step both call `start_debate_round_one_v2`.

### Automatic transition behaviour

`advance_due_debate_rounds_v2(p_limit default 50, max 200)` — `service_role`
only:

1. **Starts** scheduled opening rounds (`sequence_number = 1`,
   `status = 'scheduled'`) whose `starts_at <= now()`, for debates still in
   their open lobby.
2. **Advances** (or closes, if `final_vote`) active rounds whose
   `ends_at <= now()`.

Both phases select due debates with `FOR UPDATE OF d SKIP LOCKED`: this
deduplicates **concurrent batch runs** (a second overlapping invocation
skips debates the first is already processing). The actual transition safety
— including against a *concurrent manual* start/advance/extend call — comes
from the shared internal functions' own row locks (and, for phase 2, the
`p_expected_round_id`/`p_require_due` re-checks described below), not from
this outer `SKIP LOCKED` selection alone. A single malformed debate's
failure is caught per-iteration (`EXCEPTION WHEN OTHERS`) and reported in a
structured `errors` array; it does not abort the rest of the batch. Returns
structured counts (`processed`/`started`/`advanced`/`skipped`/`errors`) — it
never touches `debate_ballots` and exposes no ballot data. Each loop
iteration's result is captured (not discarded) and classified: a genuine
transition (`start_debate_round_one_v2` returning `already_started = false`;
`advance_or_close_debate_round_v2` returning `round_advanced` or
`debate_completed`) counts toward `started`/`advanced`; anything else
(`already_started = true`, `stale_no_op`, `not_due`) counts toward
`skipped` instead — see the second hardening-pass note below for why this
distinction matters.

### Hardening pass: concurrency findings from staging-readiness review

A review before staging sign-off found four blocking issues and three
secondary ones, all fixed in place in the same migration file (it had not
yet been applied anywhere):

1. **Double advance could skip an entire round.**
   `advance_or_close_debate_round_v2` locked the debate and transitioned
   whichever round was currently active, without verifying that round was
   the one the caller actually intended to advance. Two concurrent requests
   (a moderator double-click, or a manual call racing the automatic batch
   job) could do: request A completes opening → rebuttal; request B, having
   been blocked on the debate lock, then wakes up and advances the *now*-
   active round — rebuttal → cross_examination — skipping rebuttal
   entirely, with nobody ever seeing it. **Fix**: `p_expected_round_id`
   (required on `advance_debate_round_v2`/`extend_debate_round_v2`,
   populated internally from the outer selection for the batch job) is
   compared against the actually-active round *after* the lock is
   acquired; a mismatch returns `{ result: 'stale_no_op', ... }` instead of
   transitioning. The same mechanism closes "cron overrides a concurrent
   extension": `p_require_due` (automatic calls only) re-checks
   `ends_at <= now()` under the lock, so a just-applied extension that
   pushed `ends_at` into the future makes the batch job back off with
   `{ result: 'not_due', ... }` instead of advancing anyway.
2. **Former moderators could retain management authority.** The Phase 1
   sync trigger only ran `AFTER INSERT`; the Phase 2 catch-up only inserted
   current moderators and never removed stale ones; `can_manage_debate_v2`
   trusts *any* `debate_memberships` moderator row. Together, a moderator
   reassignment (no current code path does this, but nothing prevented a
   future one, or direct SQL, from doing it) would leave the former
   moderator able to keep managing the debate through the stale membership
   row, even though `debates.moderator_id` itself correctly no longer named
   them. **Fix**: this phase now defines explicit **single-moderator**
   semantics — `debate_memberships`' moderator row is a synchronized mirror
   of `debates.moderator_id`, never an independent grant. The Phase 1
   trigger function is extended (in this Phase 2 migration, not by editing
   Phase 1's file) to also fire `AFTER UPDATE OF moderator_id` and delete
   the former moderator's row first; a one-time cleanup in this migration
   removes any pre-existing stale rows (expected to affect zero rows in
   practice, since no code path has ever reassigned `moderator_id` — this
   is defense-in-depth against drift from before the trigger existed, e.g.
   direct SQL). A future phase that wants genuine multiple co-moderators
   must design an explicit grant/revoke path for that — out of scope here.
3. **Suspended users could bypass trust-and-safety restrictions.** Every V2
   participation function is `SECURITY DEFINER` and therefore bypasses the
   client RLS policies that already gate equivalent V1 actions on
   `is_suspended()` (posts, comments, `debate_arguments`, follows — see
   `20260704000001_trust_safety_v1.sql`). None of `join_debate_v2`,
   `cast_debate_ballot_v2`, `toggle_debate_reaction_v2`, or
   `submit_debate_argument_v2` called it, which would have quietly
   regressed that protection for V2. **Fix**: each now calls
   `public.is_suspended()` immediately after its `auth.uid()` check.
   Scoped deliberately to these four (participation/content-creation,
   matching V1's own precedent) and not to the manager-only lifecycle
   functions, which have no V1 suspension precedent either.
4. **Participation windows had time-of-check/time-of-use races.** Several
   functions checked debate/round state with a plain, unlocked `SELECT` and
   wrote later — a debater could join after the lobby had concurrently
   started; a ballot could be inserted after its window concurrently
   closed; a reaction could be inserted after the debate concurrently
   closed. **Fix**: every participation function now locks in a
   **consistent order — debate, then membership/round, then the mutation
   itself** — matching the order every lifecycle function already used.
   `join_debate_v2` and `cast_debate_ballot_v2` lock `debates` (and, for a
   final ballot, the `final_vote` round) before proceeding.
   `submit_debate_argument_v2` was reordered from
   membership→debate(unlocked)→round to debate→membership→round, closing
   both the TOCTOU gap and a cross-function deadlock risk (two functions
   that could otherwise acquire the same two locks in opposite order).
   `toggle_debate_reaction_v2` locks the debate and the argument row
   together, which additionally serves as its own fix for a related,
   secondary finding below.

Two further, non-blocking corrections from the same review:

- **`start_debate_round_one_v2` was not actually idempotent.** It checked
  `debates.status <> 'open'` *before* the round's own idempotency check, so
  a repeated start call made after the debate had already progressed to
  `active` raised an error instead of ever reaching the "already started"
  branch. Fixed by reordering: the round-status idempotency check now runs
  first.
- **The reaction toggle's `SELECT EXISTS` then `INSERT`/`DELETE` was not
  itself atomic.** Two concurrent toggle calls for the same
  `(argument, user, reaction_type)` could both observe "no existing row",
  race on the `INSERT`, and have the *losing* call misread its own
  `ON CONFLICT`-skipped insert as "a row already existed, so remove it" —
  deleting the reaction the winning call had just added, even though both
  callers' intent was to turn the same reaction on. An explicit
  `set_reaction(..., p_reacted boolean)` API (suggested by the review)
  would sidestep this ambiguity entirely by being naturally idempotent, but
  would also expand the public function surface beyond what this phase's
  contract specified. Instead, `toggle_debate_reaction_v2` now locks the
  target argument (`FOR UPDATE OF da` in the same statement that locks the
  debate) before its check-then-act, serializing every toggle call on that
  argument — from any user — so the `SELECT EXISTS` a given call performs
  is guaranteed to still be accurate by the time it acts on it. This keeps
  the required toggle semantics ("calling the same reaction again toggles
  it off") while removing the race; it does not change the public
  signature.
- **Automatic advancement is still not operationally scheduled** — see
  [Cron deployment requirements](#k-cron-deployment-requirements). This was
  already documented as a known gap, not fixed by this pass (it requires an
  operational decision about the account's Vercel plan/cron configuration,
  not a code change).

### Second hardening pass: authorization TOCTOU, cron counting, extension stacking

A follow-up review of the first hardening pass found three further issues,
all fixed in place in the same migration file:

1. **Authorization was still checked before the lifecycle lock, not after.**
   `advance_debate_round_v2`'s (and `start_debate_v2`'s,
   `extend_debate_round_v2`'s, `close_debate_v2`'s) `can_manage_debate_v2`
   check ran *before* `advance_or_close_debate_round_v2` (or the
   equivalent) locked the debate row. If moderator A passed that check and
   management was reassigned to B before A's call actually acquired the
   lock, A's action would still execute — the check had gone stale by the
   time it mattered. **Fix**: the early check is kept (fast rejection
   before taking any lock is still useful), but an **authoritative
   re-check** was added immediately after each function locks the debate
   row — inside `start_debate_round_one_v2` and
   `advance_or_close_debate_round_v2` (skipped entirely for automatic
   calls, which are trusted via `service_role` and never carry a real actor
   to check), and directly inside `extend_debate_round_v2` and
   `close_debate_v2`. The locked check is now what's actually authoritative;
   the early one is purely a convenience.
2. **Cron counted no-ops as successful advances.** Once the first hardening
   pass added `stale_no_op`/`not_due`/`already_started` outcomes,
   `advance_due_debate_rounds_v2` kept calling the transition functions with
   `PERFORM` — discarding the result — and incrementing `started`/`advanced`
   unconditionally regardless of what actually happened. **Fix**: both
   batch loops now capture the JSON result (`SELECT ... INTO`) and classify
   it: a genuine transition counts toward `started`/`advanced`; an
   idempotent no-op counts toward a new `skipped` field instead. The cron
   route's fallback response shape
   (`app/api/cron/advance-debate-rounds/route.ts`) was updated to include
   `skipped` too.
3. **Duplicate extension requests could stack.** `extend_debate_round_v2`'s
   compare-and-swap compared only `p_expected_round_id` — but extending a
   round never changes its id, so a double-click or a client retry sends
   two calls that both see the same "expected" round still active, and
   both would apply their own `+p_minutes` on top of each other. **Fix**:
   added a required `p_expected_ends_at` parameter — the caller's
   last-observed `ends_at`. Only a call whose expectation still matches the
   round's current `ends_at` (compared with `IS DISTINCT FROM` for
   null-safety) is allowed to proceed; the first of two duplicate calls
   succeeds and advances `ends_at`, and the second's now-stale expectation
   is rejected as `stale_no_op` rather than stacking a second extension.

**Non-blocking, deferred**: the reaction-toggle fix (locking the whole
argument row) serializes every reaction on that argument from every user,
not just per-(user, reaction) — correct, but would not scale gracefully to
a very popular argument attracting many simultaneous reactions. A
per-(user, reaction) advisory lock, or the explicit
`set_reaction(..., p_reacted boolean)` API considered and set aside in the
first hardening pass, would scale better. Left as-is per the review's own
assessment that this can wait unless high-volume simultaneous reactions are
expected immediately — revisit if/when that changes.

## D. Ballot windows and result visibility

`cast_debate_ballot_v2(p_debate_id, p_stage, p_vote, p_confidence, p_reason,
p_influential_argument_id)`:

- `p_stage`: `initial` | `final`. `p_vote`: `for` | `against` | `undecided`.
- **Confidence (1–5) is required** for every V2 ballot — a deliberate
  stricter-than-Phase-1 rule (the column itself stays nullable at the schema
  level for any future non-V2 use).
- `p_influential_argument_id` is only accepted on a **final** ballot.
- **Initial ballots**: only while the debate is in its open lobby
  (`status = 'open'`) — i.e. before the opening round becomes active.
- **Final ballots**: only while the `final_vote` round is `active`.
- Closed debates reject any ballot mutation.
- Upserts atomically on `(debate_id, user_id, stage)`, preserving
  `created_at` and bumping `updated_at`.
- The Phase 1 same-debate trigger (`debate_ballots_check_same_debate`)
  remains the final integrity guard on `influential_argument_id` — this RPC
  does not re-implement that check.
- Returns only the caller's own ballot. Never another user's.

`get_debate_ballot_results_v2(p_debate_id, p_stage)` — privacy-safe
aggregate, granted to `anon` **and** `authenticated`:

| Caller | Can see stage's aggregate when... |
|---|---|
| Anonymous | `p_stage = 'final'` **and** the debate is closed. Never for `initial`, never before closing. |
| Authenticated | They have already cast a ballot in that stage, **or** that stage has ended (initial ends when the debate leaves `open`; final ends when the debate closes or `final_vote` is `completed`/`cancelled`). |

Returned shape: `for_count`, `against_count`, `undecided_count`, `total`,
`average_confidence`. **`average_confidence` is `null` until at least 3
ballots exist in that stage** — the chosen minimum-sample threshold, to
avoid a single or pair of ballots deanonymizing a small room's confidence.
`reason` and `influential_argument_id` are never selected into the
aggregate at all — there is no code path by which they could leak.

## E. Argument phase rules

`submit_debate_argument_v2` resolves the debate's **active round** under
lock and requires `p_entry_type` to match that round's `phase` exactly.

| Round phase | Rule |
|---|---|
| `opening` | `entry_type = 'opening'`; no `parent_argument_id`/`relation_type`; max 1 per debater |
| `rebuttal` | `entry_type = 'rebuttal'`; `parent_argument_id` **and** `relation_type` both required; max 2 per debater |
| `cross_examination` | General submission explicitly **rejected** with a clear message — dedicated question/answer mechanics are deferred to the structured-deliberation phase |
| `closing` | `entry_type = 'closing'`; no `parent_argument_id`/`relation_type`; max 1 per debater |
| `final_vote` | Argument submission explicitly **rejected** |

Rebuttal parent validation, in order: the parent must belong to the **same
debate**; you cannot rebut **your own** argument; the parent must come from
a **strictly earlier round** (`sequence_number < active_sequence_number`);
and a **direct challenge** (`relation_type = 'challenges'`) must target the
**opposing stance** — `supports`/`answers`/`clarifies` are not
stance-constrained, since supporting your own side's earlier claim is a
legitimate move.

`stance` is **always** the caller's locked `debate_memberships` stance,
resolved server-side under a row lock — never a caller-supplied value (there
is no `p_stance` parameter on this function at all). `round_id` and
`round_number` (kept for legacy compatibility) are assigned server-side from
the locked active round.

## F. Word and submission limits

| Entry type | Word limit | Submissions per debater |
|---|---|---|
| Opening | 300 | 1 |
| Rebuttal | 200 | 2 |
| Closing | 150 | 1 |

Word counting is one shared contract, implemented twice on purpose and kept
identical: `count_words_v2()` (SQL, used by the RPC's own enforcement) and
`countWordsV2()` (`lib/debateV2Lifecycle.ts`, exercised by its test file).
**Whitespace semantics, stated plainly**: trim leading/trailing whitespace,
split the remainder on runs of whitespace, count the pieces; an empty (or
all-whitespace) string is zero words. This is a documented **contract**, not
a claim of correct natural-language tokenization — `"well-supported"` counts
as one word, `"word."` counts as one word including the period.

**Concurrency**: the one-opening/two-rebuttal/one-closing limits cannot be
satisfied by a bare pre-insert `COUNT`. `submit_debate_argument_v2` locks, in
order, the debate, then the caller's own `debate_memberships` row, then the
active round — the membership lock is what serializes every concurrent
submission attempt by the *same* user for the *same* debate (two tabs, a
double-click, a retried request), because a second concurrent call blocks
until the first's transaction commits or rolls back, and by the time it
proceeds the first call's insert (if any) is already visible. (The
debate-first ordering was a staging-review correction — see the hardening
pass note in section C — for TOCTOU and cross-function deadlock reasons,
not for the submission-limit itself.) Two partial unique indexes,
`debate_arguments_one_opening_per_debater_v2` and
`debate_arguments_one_closing_per_debater_v2`, add a defense-in-depth hard
guarantee for the exactly-one cases; rebuttal's "at most two" cannot be
expressed as a unique index and relies on the row-lock serialization alone.

**Sources**: at most 5 per argument; each requires a non-empty `url`
(string); `title`/`publisher`/`quoted_text` are optional but length-bounded
(2048/300/200/1000 characters respectively for url/title/publisher/quote);
`p_sources` must be a JSON array; every source is validated **before** the
argument itself is inserted, so a single invalid source rejects the whole
call atomically; `added_by` is always `auth.uid()`.

## G. Closed-debate rules

Every V2 mutation rejects a closed debate:

| Mutation | Enforcement |
|---|---|
| `join_debate_v2` | `status = 'closed'` rejected explicitly |
| `cast_debate_ballot_v2` | `status = 'closed'` rejected explicitly |
| `toggle_debate_reaction_v2` | requires `status = 'active'` (closed and open-lobby both rejected) |
| `submit_debate_argument_v2` | requires `status = 'active'` |
| `start_debate_v2` / `advance_debate_round_v2` / `extend_debate_round_v2` | each requires the specific non-closed state its own transition needs (`open` to start, `active` to advance/extend) |
| `close_debate_v2` | idempotent on an already-closed debate rather than erroring |

## H. Membership catch-up

This migration re-runs Phase 1's exact conflict-safe reconciliation
(`debate_participants` → `role = 'debater'`, `debates.moderator_id` →
`role = 'moderator'`, `ON CONFLICT (debate_id, user_id, role) DO NOTHING`,
never deleting or modifying either source table) **before** any Phase 2
function is allowed to treat `debate_memberships` as authoritative.
`activate_debate_v2` additionally re-runs the same reconciliation scoped to
the one debate being activated, as a belt-and-suspenders confirmation at
exactly the moment that debate's memberships start being relied on.

**The Phase 1 sync triggers (`sync_debate_participant_membership`,
`sync_debate_moderator_membership`) are kept, not replaced wholesale.** They
still cover every current V1 write path (`join_debate`, the direct `debates`
insert), which this phase does not change. They can be retired only once
every V1 write path they mirror is itself retired — i.e. not before V1 is
retired entirely, since V1 debates can still be created and joined
indefinitely alongside V2 ones. Removing them before then would silently
reintroduce the membership drift Phase 1 identified.

**Hardening pass**: `sync_debate_moderator_membership()` itself *is*
extended (redefined in this Phase 2 migration, not by editing Phase 1's
file) to also fire on `UPDATE OF moderator_id` and remove the former
moderator's row — see the "double advance"/"former moderators" finding in
section C above and this phase's explicit single-moderator semantics
recorded there. A one-time cleanup in this migration also removes any
pre-existing stale moderator membership rows.

## I. Function inventory and EXECUTE grants

Every function below has an explicit `REVOKE ALL ... FROM PUBLIC`
immediately after its `CREATE OR REPLACE FUNCTION` — Postgres's default
grant of `EXECUTE` to `PUBLIC` is closed before any grant is considered, for
every function in this migration, new or redefined.

| Function | Granted to | Notes |
|---|---|---|
| `is_editor_or_admin(uuid)` | *(none)* | internal; owner-composition only |
| `can_manage_debate_v2(uuid, uuid)` | *(none)* | internal; owner-composition only |
| `log_debate_moderation_event(...)` | *(none)* | internal; the only write path into `debate_moderation_events` |
| `sync_debate_moderator_membership()` | *(none)* | Phase 1 trigger function, extended in Phase 2 (section H); a trigger function's `RETURNS trigger` already makes it uncallable via direct RPC, but `REVOKE ALL FROM PUBLIC` was added for explicit consistency with every other function here (final cleanup) |
| `start_debate_round_one_v2(uuid, uuid, boolean)` | *(none)* | internal; shared by `start_debate_v2` and the batch job. 2nd hardening pass: authoritative `can_manage_debate_v2` re-check after the debate lock (skipped for automatic calls) |
| `advance_or_close_debate_round_v2(uuid, uuid, boolean, uuid, boolean)` | *(none)* | internal; shared by `advance_debate_round_v2` and the batch job. `p_expected_round_id`/`p_require_due` added in the 1st hardening pass; authoritative `can_manage_debate_v2` re-check added in the 2nd |
| `count_words_v2(text)` | *(none)* | final cleanup: originally left `PUBLIC` (harmless — pure/immutable, no data access) with no `SET search_path`; both were added for consistency with every other function in this migration. Only ever called from within `submit_debate_argument_v2` (owner-composition) |
| `join_debate(uuid, text)` | `authenticated` | V1, was PUBLIC by omission until this migration |
| `cast_motion_vote(uuid, text)` | `authenticated` | ″ |
| `toggle_debate_vote(uuid)` | `authenticated` | ″ |
| `start_debate(uuid)` | `authenticated` | ″ |
| `advance_debate_phase(uuid)` | `authenticated` | ″ |
| `close_debate(uuid)` | `authenticated` | ″ |
| `activate_debate_v2(uuid, uuid, timestamptz)` | `service_role` | no client-invocable path exists |
| `join_debate_v2(uuid, text, text)` | `authenticated` | hardening pass: now checks `is_suspended()`, locks `debates` before checking `status` |
| `start_debate_v2(uuid)` | `authenticated` | |
| `advance_debate_round_v2(uuid, uuid)` | `authenticated` | hardening pass: `p_expected_round_id` is now a required second parameter (compare-and-swap against a stale caller) |
| `extend_debate_round_v2(uuid, uuid, timestamptz, integer)` | `authenticated` | hardening pass: `p_expected_round_id` and `p_expected_ends_at` are now required parameters (2nd pass added `p_expected_ends_at` — round id alone did not stop duplicate extensions from stacking); debate now locked, and authorization re-checked, before the round |
| `close_debate_v2(uuid, boolean, text)` | `authenticated` | 2nd hardening pass: authorization re-checked after the debate lock, before the idempotent already-closed branch |
| `advance_due_debate_rounds_v2(integer)` | `service_role` | cron route only; passes `p_expected_round_id`/`p_require_due` when advancing; 2nd hardening pass: captures each transition's result and classifies it into `started`/`advanced` vs `skipped` instead of discarding it via `PERFORM` |
| `cast_debate_ballot_v2(uuid, text, text, smallint, text, uuid)` | `authenticated` | hardening pass: now checks `is_suspended()`, locks `debates` (and the `final_vote` round, for final ballots) before checking state |
| `get_debate_ballot_results_v2(uuid, text)` | `anon`, `authenticated` | anon: closed-debate final results only |
| `toggle_debate_reaction_v2(uuid, text)` | `authenticated` | hardening pass: now checks `is_suspended()`, locks the debate and argument together (also fixes the toggle race — see section C) |
| `submit_debate_argument_v2(uuid, text, text, text, uuid, text, jsonb)` | `authenticated` | hardening pass: now checks `is_suspended()`; lock order corrected to debate → membership → round |

Every `SECURITY DEFINER` function has `SET search_path = public`, validates
`auth.uid()`/service-role context before doing anything, locks the relevant
row(s) before any state transition, never trusts a caller-supplied ownership/
stance/role/actor id without independent verification, uses no dynamic SQL,
and returns the minimal payload needed (never another user's ballot,
reaction identity, or private moderation reasons beyond what the caller is
entitled to see).

## J. Audit-event inventory

All lifecycle audit events go through one internal function,
`log_debate_moderation_event`, itself un-grantable by any client (the only
write path into `debate_moderation_events`, exactly as Phase 1 intended).

| Action | `target_type` | `actor_id` | Notes |
|---|---|---|---|
| `v2_activated` | `debate` | the activating actor | metadata: `opening_starts_at` |
| `debate_started` | `round` | manager or `NULL` (automatic) | metadata: `automatic` |
| `round_advanced` / `round_auto_advanced` | `round` | manager or `NULL` | metadata: old/new round id + phase |
| `round_extended` | `round` | manager | metadata: old/new `ends_at`, minutes |
| `debate_completed` | `debate` (and a paired `round` event when triggered by round expiry) | manager or `NULL` | normal completion only |
| `debate_force_closed` | `debate` | manager | reason required; never logged as `debate_completed` |

**Not audited**: `join_debate_v2` (ordinary high-volume membership activity,
not a privileged/moderation action — matches the task's explicit
instruction not to use this table for that), ballot casts, and reactions.
No ballot choice, reason, or other individual-level private data is ever
written into `debate_moderation_events` metadata.

## K. Cron deployment requirements

`app/api/cron/advance-debate-rounds/route.ts` follows this repo's existing
cron convention exactly (`app/api/cron/review-reminders/route.ts`): `GET`,
`Authorization: Bearer <CRON_SECRET>` required, `createAdminClient()`
(service role), calls `advance_due_debate_rounds_v2({ p_limit: 50 })` and
returns its structured result.

**No `vercel.json` entry was added.** Vercel's Hobby plan limits cron jobs to
once-per-day invocation; this project's existing `vercel.json` only has two
daily crons, so its plan tier relative to that limit is unconfirmed. Guessing
a frequent schedule (e.g. every 5 minutes, which round advancement actually
needs) risks either silently failing on an unsupported plan or being wrong
about what the account allows. Per the task's own instruction, the protected
route is implemented and the required schedule is documented instead:

> Invoke `GET /api/cron/advance-debate-rounds` every **1–5 minutes** once a
> Vercel plan/cron configuration that supports sub-daily frequency is
> confirmed. Add to `vercel.json`'s `crons` array:
> `{ "path": "/api/cron/advance-debate-rounds", "schedule": "*/5 * * * *" }`.
> Until then, any external scheduler capable of an authenticated HTTPS GET
> on that interval (a Supabase `pg_cron` job calling out, a GitHub Actions
> scheduled workflow, an external cron service) can drive it instead — the
> route's authentication and behaviour do not depend on Vercel Cron
> specifically.

## L. Phase 1 guard interactions

- **`format_version` activation requires service role.** Phase 1's
  `debates_guard_format_version()` trigger blocks any `authenticated`-role
  write to `format_version` in either direction. `activate_debate_v2` sets
  it while running as `service_role` (it is only ever invoked via the admin
  client), so `auth.role()` there is `'service_role'`, not `'authenticated'`
  — the guard's condition never fires. This is the intentional bypass Phase
  1 documented, not a workaround.
- **Profile privilege fields remain protected.** Nothing in this phase reads
  or writes `profiles.role`/`verified`/`verified_type` except
  `is_editor_or_admin()`'s read-only `SELECT`, which was already possible
  under Phase 1's public-read RLS. Phase 1's INSERT/UPDATE guard triggers on
  `profiles` are untouched.
- **Phase 2 membership catch-up is mandatory**, and is section H above —
  run before any function in this migration treats `debate_memberships` as
  authoritative, exactly as Phase 1's own migration required of whichever
  phase came next.
- **Same-debate integrity triggers remain the final guard.** `submit_debate_argument_v2`
  and `cast_debate_ballot_v2` both perform their own same-debate checks
  before inserting, but Phase 1's `debate_arguments_check_same_debate` and
  `debate_ballots_check_same_debate` triggers still run on every insert
  regardless — this migration relies on, rather than replaces, that
  guarantee.

## Deferred Phase 3+ work

Per the task's explicit non-goals, none of the following is implemented:
new debate pages or visual redesign; cross-examination question/answer UI or
mechanics (only the round *state* exists — `submit_debate_argument_v2`
explicitly rejects general submission during it); argument-map UI;
notification delivery; debate portfolios; achievements/reputation; AI
writing assistance; AI recap redesign; a moderation dashboard; analytics
dashboards; legacy-table removal; content-model changes; or automatic
publication of recap articles. The cron route is lifecycle infrastructure
only, not user-facing UI.
