# Debate V1.5 — build spec (rev 2)

The debate system as shown in `Debate V1 Prototype - Standalone.html`:
asynchronous, deadline-gated, strict 1v1, invitation-based, with recruiting
and cancellation as first-class states.

**Rev 2** incorporates an external technical review. Changes from rev 1 are
listed in Part 7. The four decisions that drove the rewrite: strict 1v1,
moderator invitation, **manual pilot lifecycle (no automation)**, and
**deletion of the dormant V2 stack**.

---

## Part 1 — Decisions

### D1. Strict 1v1 — enforced structurally

Exactly one debater FOR and one AGAINST. Everyone else participates by voting
and upvoting. Maximum four arguments per debate: two openings, two rebuttals.

The prototype currently reads `1 of 2 confirmed` per side. **The mockup is
wrong and must be updated** — see Part 6.

This is enforced by table structure, not by a check in application code:
`debate_slots_v1_5` has `PRIMARY KEY (debate_id, stance)`, so a second FOR
slot is physically impossible. A structural guarantee beats an RPC check that
someone can forget to call.

1v1 also makes D3's no-show handling coherent. With two per side, "did that
side submit its opening?" has no clean answer.

### D2. Moderator invites, participant accepts

Debaters do not self-join. The moderator invites one person per side; the
invitee accepts or declines; the slot is confirmed only on acceptance.

Rationale: in a strict 1v1 format, first-come-first-served lets any passing
user claim a slot before the moderator's recruited debater arrives. At pilot
scale the moderator knows exactly who they want on each side.

A declined or revoked slot frees the side for a new invitation.

### D3. Manual pilot lifecycle — no automation in v1

**The moderator advances every phase by hand.** No cron, no lazy evaluator, no
automatic grace period, no auto-cancel.

Deadlines still exist and are still enforced — but they gate **submission**,
not **progression**:

- `now() > opening_deadline` → the opening submission window is closed. This
  is a hard server-side check in the submission RPC.
- The phase itself changes only when the moderator clicks Advance.

This is the single largest simplification in rev 2, and it removes an entire
class of bugs the review correctly identified: with nothing auto-advancing,
there is no stale-state catch-up problem, and because every write RPC checks
its own deadline (not merely `current_phase`), a debate parked in the wrong
phase still cannot accept a late submission or vote.

No-show handling in the pilot is a moderator judgement call, supported by
explicit UI states ("Deadline passed. You did not submit an opening argument
for FOR.") and two moderator actions: extend the deadline, or cancel with a
reason.

Automate later, once you have watched three real debates finish and know which
transitions actually need it. The state machine is written so automation is an
additive change, not a rewrite.

### D4. Delete the dormant V2 stack

V1.5 evolves the live V1 tables. That only avoids becoming a third system if
V2 is removed rather than left dormant. Deletion also eliminates the
migration-ordering hazard in Part 2.

---

## Part 2 — Before anything: establish deployment state

**Do not trust any document in this repo about what is applied — including
this one.**

The evidence that this is genuinely uncertain: `vercel.json` schedules
`/api/cron/process-debate-notifications` daily, and that route calls
`process_debate_notification_events_v2`, which only exists if migration
`20260721000003` was applied. Either the V2 migrations *are* live (contra
every doc in `docs/`), or that cron has failed every day since it was added.

Compounding this: the five V2 migrations carry timestamps
(`20260718*`, `20260721*`) **earlier** than any new V1.5 migration. If they
are pending, a routine migration push applies them first.

Establish, before writing code:

1. Which of the five V2 migrations are actually applied (query the migration
   ledger and `pg_proc`, do not infer).
2. Whether `debates.format_version` exists in the live database.
3. The **true current** definition of `notifications_type_check` as deployed.
4. Whether the debate-notifications cron is succeeding or erroring.

Everything downstream — especially the notification constraint rebuild and the
V2 deletion plan — depends on the answers.

---

## Part 3 — State machine

```
recruiting ──start_debate_v1_5 (both slots accepted)──> opening
                │                                          │ moderator advances
                │ moderator cancels                        ▼
                ▼                                      rebuttal
            cancelled <────── moderator cancels ──────────  │ moderator advances
                ▲                                          ▼
                └────────── moderator cancels ──────────  voting
                                                           │ complete_debate_v1_5
                                                           ▼
                                                       completed
```

| Prototype state | `debates.status` | `debates.current_phase` |
|---|---|---|
| Recruiting | `open` | `recruiting` |
| Opening arguments | `active` | `opening` |
| Rebuttals | `active` | `rebuttal` |
| Final community vote | `active` | `voting` |
| Verdict / archive | `closed` | `completed` |
| Cancelled | `cancelled` | *(unchanged)* |

Every forward transition is moderator-initiated and takes an
`p_expected_phase` argument compared under a row lock — a cheap
compare-and-swap that stops a double-click from skipping a phase. This is the
one lesson worth carrying over from the V2 hardening work.

**Submission windows are independent of phase.** An argument requires
`current_phase = 'opening'` **and** `now() <= opening_deadline`. A vote
requires `current_phase = 'voting'` **and** `now() <= voting_deadline`. Both
conditions, always, in SQL.

---

## Part 4 — Schema delta

One additive migration. Nothing dropped, nothing replaced. Existing debates
(`debate_variant = 'legacy'`) behave exactly as they do today.

### `debates` — new columns

```sql
alter table public.debates
  add column if not exists debate_variant      text not null default 'legacy',
  add column if not exists recruiting_deadline timestamptz,
  add column if not exists opening_deadline    timestamptz,
  add column if not exists rebuttal_deadline   timestamptz,
  add column if not exists voting_deadline     timestamptz,
  add column if not exists cancelled_at        timestamptz,
  add column if not exists cancelled_by        uuid references public.profiles(id) on delete set null,
  add column if not exists cancellation_reason text,
  add column if not exists recap_status        text not null default 'none'
    check (recap_status in ('none','pending','generating','ready','failed')),
  add column if not exists recap_attempts      integer not null default 0,
  add column if not exists recap_key_disagreement  text,
  add column if not exists recap_agreement         text,
  add column if not exists recap_strongest_for     text,
  add column if not exists recap_strongest_against text;
```

`debate_variant` is `'legacy' | 'v1_5'`. It is **not** `format_version` — that column
belongs to V2 and may or may not exist (Part 2).

`round_duration_minutes` is retained and ignored. Deadlines are absolute.

Dropped from rev 1: `opening_grace_granted` (no automatic grace in a manual
pilot).

### Constraints

```sql
alter table public.debates drop constraint if exists debates_status_check;
alter table public.debates add constraint debates_status_check
  check (status in ('open','active','closed','cancelled'));

alter table public.debates drop constraint if exists debates_current_phase_check;
alter table public.debates add constraint debates_current_phase_check
  check (current_phase in ('recruiting','opening','rebuttal','closing','voting','completed'));
```

`'closing'` stays valid so existing rows remain legal. No V1.5 debate enters it.

### `debate_slots_v1_5` — new table

```sql
create table if not exists public.debate_slots_v1_5 (
  debate_id    uuid not null references public.debates(id) on delete cascade,
  stance       text not null check (stance in ('for','against')),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'invited'
                 check (status in ('invited','accepted','declined')),
  invited_by   uuid references public.profiles(id) on delete set null,
  invited_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (debate_id, stance),
  unique (debate_id, user_id)
);
```

`PRIMARY KEY (debate_id, stance)` is what structurally guarantees 1v1.
`UNIQUE (debate_id, user_id)` stops one person holding both sides.

`debate_participants` is left completely untouched and remains the legacy
join table.

RLS: public `SELECT`. **No client INSERT/UPDATE/DELETE policy at all** — the
RPCs own every write.

### `debate_argument_sources_v1` — new table

```sql
create table if not exists public.debate_argument_sources_v1 (
  id          uuid primary key default gen_random_uuid(),
  argument_id uuid not null references public.debate_arguments(id) on delete cascade,
  url         text not null check (length(url) between 1 and 2048),
  title       text check (length(title) <= 300),
  added_by    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);
```

Max 5 per argument, enforced in the submission RPC. Public `SELECT`, no client
write policy. Named distinctly from V2's `debate_argument_sources` so the two
can never collide.

### Closing the direct-write bypass — **mandatory**

The review's most important technical finding. Today's RLS policies permit
direct client `INSERT` into `debate_arguments`, `debate_participants`, and
`debate_motion_votes`. On a V1.5 debate that bypasses word limits, the phase
check, the deadline, the 1v1 cap and the voting window entirely.

Each policy is replaced with the identical policy plus a variant guard, so
legacy debates keep working and V1.5 writes are forced through the RPCs
(which are `SECURITY DEFINER` and bypass RLS as their owner):

```sql
-- debate_arguments: reproduce the CURRENT policy from
-- 20260704000001_trust_safety_v1.sql verbatim, then add:
--   and exists (select 1 from public.debates
--               where id = debate_id and debate_variant = 'legacy')
```

Apply the same `debate_variant = 'legacy'` condition to the INSERT policies on
`debate_participants` and `debate_motion_votes`.

Direct `debate_votes` writes are also restricted to legacy debates so V1.5
upvotes cannot bypass the shared, locking `toggle_debate_vote` RPC. The RPC
itself remains shared by both variants.

---

## Part 5 — RPC contracts

All `SECURITY DEFINER`, `SET search_path = public`, `revoke all ... from
public` followed by a narrow grant, `auth.uid()` validated first,
`is_suspended()` checked on every participation write, debate row locked
before any mutation.

| Function | Granted to | Contract |
|---|---|---|
| `create_debate_v1_5(title, description, tags, recruiting_deadline, opening_deadline, rebuttal_deadline, voting_deadline)` | `authenticated` | Creator must be `verified` or editor/admin. Motion is 10–160 characters; shared context is required and 30–900 characters; at most 6 tags of 1–40 characters. Deadlines are strictly increasing and in the future. Sets `debate_variant='v1_5'`, `status='open'`, `current_phase='recruiting'`, `moderator_id = auth.uid()`. |
| `invite_debater_v1_5(debate_id, user_id, stance)` | `authenticated` | Manager only (moderator/editor/admin). Only during `recruiting`. Inserts a `debate_slots_v1_5` row with `status='invited'`. Rejects: an occupied side (PK enforces this anyway), the same user on both sides, inviting the moderator, inviting a suspended user. Notifies the invitee. |
| `respond_to_debate_invitation_v1_5(debate_id, accept)` | `authenticated` | Invitee only, own row only. Sets `accepted` or `declined` plus `responded_at`. Only during `recruiting`. Idempotent. |
| `revoke_debate_invitation_v1_5(debate_id, stance)` | `authenticated` | Manager only, during `recruiting`. Deletes the slot so the side can be re-invited. Refuses if that debater has already submitted an argument. |
| `start_debate_v1_5(debate_id, expected_phase)` | `authenticated` | Manager only. **Readiness gate: refuses unless both slots exist with `status='accepted'`.** Refuses if `opening_deadline` has passed. Sets `status='active'`, `current_phase='opening'`. Idempotent. |
| `advance_debate_phase_v1_5(debate_id, expected_phase)` | `authenticated` | Manager only. `opening→rebuttal→voting` only. Compare-and-swap on `expected_phase` under lock; a mismatch returns `stale_no_op` rather than transitioning. |
| `submit_debate_argument_v1_5(debate_id, content, sources jsonb)` | `authenticated` | Rejects suspended callers. Stance resolved server-side from `debate_slots_v1_5` (never from the request). `round_number` derived from `current_phase` (never from the request). Requires `current_phase IN ('opening','rebuttal')` **and** `now() <= the matching deadline`. Word limit: opening 300, rebuttal 200. **One submission per debater per phase**, serialised by locking the caller's slot row. At most 5 sources, each with a non-empty url; all validated before the argument is inserted, so an invalid source rejects the whole call atomically. |
| `cast_final_vote_v1_5(debate_id, vote)` | `authenticated` | Requires `current_phase='voting'` **and** `now() <= voting_deadline`. Debaters may vote. Upsert on `(debate_id, user_id)`; re-voting the same value removes it. Updates the denormalised counts. |
| `extend_deadline_v1_5(debate_id, which, new_deadline, expected_current_value)` | `authenticated` | Manager only. `which ∈ ('recruiting','opening','rebuttal','voting')`. New value must be in the future and must not cross the next deadline. `expected_current_value` is a compare-and-swap so a double-click cannot stack two extensions. |
| `complete_debate_v1_5(debate_id, expected_phase)` | `authenticated` | Manager only, from `voting`. Sets `status='closed'`, `current_phase='completed'`, **`recap_status='pending'`**. This is the prototype's "Close debate" button. |
| `cancel_debate_v1_5(debate_id, reason)` | `authenticated` | Manager only, non-empty reason. Sets `status='cancelled'` plus `cancelled_at/by/reason`. Idempotent. Never deletes arguments — the prototype keeps them visible. |

### Legacy RPC separation

Add a `debate_variant = 'v1_5'` rejection guard to **five** legacy RPCs:
`join_debate`, `cast_motion_vote`, `start_debate`, `advance_debate_phase`,
`close_debate`.

**`toggle_debate_vote` is explicitly excluded from that list.** Rev 1
contradicted itself here. Argument upvotes are shared by both formats. It
needs: the debate-existence check it lacks, a rejection of `closed` **and**
`cancelled` debates, and the `REVOKE`/`GRANT` pair. It stays a direct client
RPC for both formats.

### Recap durability

The moderator's `complete_debate_v1_5` sets `recap_status='pending'`. It does
**not** call an HTTP endpoint — a SQL function cannot, and rev 1's
fire-and-forget pattern was unreliable even where it could.

Instead: the server action that calls `complete_debate_v1_5` requests recap
generation after the RPC returns. The recap route sets `generating`, then
`ready` or `failed`, incrementing `recap_attempts`. The verdict page renders
each state honestly, and a moderator-visible **Retry recap** action exists for
`failed`. A background retry worker is deliberately out of scope for the
pilot — with manual completion there is always a human present.

---

## Part 6 — Mockup corrections

The prototype is the visual contract **after** these changes:

- **Replace `1 of 2 confirmed` and `2/2`** with single-slot language: "FOR —
  confirmed" / "FOR — awaiting response" / "FOR — not yet invited".
- **Replace the public join affordance** with the invitation flow: moderator
  sees "Invite a debater"; the invitee sees an accept/decline prompt.
- **Add the source-entry UI** to the composer (up to 5 URLs) — the verdict page
  cites sources but nothing in the prototype collects them.
- **Label the recap as AI-assisted** and never imply it decided the outcome.
  The verdict is the vote count.
- **State that submissions are final once submitted.** This is the pilot rule —
  simplest, and it matches the existing "Opening submitted" copy. Editable-
  until-deadline is a later upgrade.
- **Render times in the viewer's local timezone**, with WAT as secondary
  context. The prototype hardcodes WAT.
- **Rebuild clickable text as real buttons/links.** "Extend recruiting",
  "Cancel debate" and "Remind voters" are currently `<span style="cursor:pointer">`.
- **Drop the prototype chrome** — the Viewing-as / Scenario / Viewport pickers,
  the device frame, and the hard-coded sample data are walkthrough scaffolding,
  not product.

---

## Part 7 — Changes from rev 1

| # | Rev 1 | Rev 2 |
|---|---|---|
| 1 | 1v1 asserted, enforced by an RPC check | 1v1 guaranteed by `PRIMARY KEY (debate_id, stance)` |
| 2 | Public first-come-first-served joining | Moderator invitation + acceptance |
| 3 | RLS INSERT policies left permissive — **direct client writes bypassed every V1.5 rule** | Direct-write policies variant-gated to `'legacy'` |
| 4 | `toggle_debate_vote` both rejected V1.5 and shared with it — a self-contradiction | Excluded from the rejection list; shared, with closed/cancelled checks added |
| 5 | Lazy evaluator applied one transition per call, leaving stale debates in the wrong phase and accepting late votes | No automatic progression at all; every write RPC checks its own deadline as well as the phase |
| 6 | Recap reused an unreliable fire-and-forget fetch, with no path at all when a SQL function completed the debate | `recap_status` state machine, moderator-triggered, with a Retry action |
| 7 | Moderator "Close debate" button had no server contract | `complete_debate_v1_5` |
| 8 | Assumed the V2 migrations were unapplied | Part 2 requires establishing real deployment state first |
| — | Daily cron + lazy evaluation + grace periods + auto-cancel | Removed entirely (D3) |
| — | V2 left dormant | V2 deleted (D4) |

---

## Part 8 — Phased Claude Code prompts

### Standing rules — paste at the top of every prompt

```
Project: Indegenius (Think_Africa). Next.js App Router v16, React 19,
TypeScript, Tailwind, Supabase.

Read docs/debate-v1.5-build-spec.md before starting. It is the contract.

Standing rules:
1. Every migration is additive. No column dropped, no table replaced. Existing
   debates (debate_variant='legacy') must keep working exactly as they do today.
2. Every SECURITY DEFINER function: SET search_path = public, validate
   auth.uid() first, is_suspended() on participation writes, lock the debate
   row before mutating, explicit REVOKE ALL FROM PUBLIC then a narrow GRANT.
3. Every write RPC checks BOTH current_phase AND its own deadline. Never one
   without the other.
4. Use existing Tailwind tokens (emerald-brand, gold, gold-ink, purple-accent,
   green-tint, gold-tint, purple-tint, green-wash, canvas, surface, ink,
   ink-muted; font-sans, font-display). No raw hex.
5. Client-side validation is for feedback only. The RPC is authoritative and
   its error message must always surface to the user.
6. When done: npm run lint && npm run typecheck && npm test
7. Report what you could not do rather than working around it.
```

---

### Phase 0 — Establish deployment state *(investigation only, no code)*

```
[standing rules]

Do not write any migration in this phase. Produce
docs/debate-deployment-state.md answering, with evidence:

1. Which of these five migrations are actually applied to staging and to
   production? Query the Supabase migration ledger and pg_proc — do NOT infer
   from docs/, which may be wrong:
     20260718000002_debate_v2_foundation.sql
     20260718000003_debate_v2_lifecycle_permissions.sql
     20260721000001_debate_v2_room_signal.sql
     20260721000002_debate_v2_cross_examination.sql
     20260721000003_debate_v2_subscriptions_notifications.sql

2. Does public.debates.format_version exist in the live database?

3. What is the TRUE current definition of notifications_type_check as
   deployed? Every later migration that touches it must be rebuilt from this,
   not from any migration file's assumption.

4. Is the /api/cron/process-debate-notifications cron succeeding or failing?
   It calls process_debate_notification_events_v2, which only exists if
   20260721000003 was applied. vercel.json schedules it daily. Either the V2
   migrations are live (contradicting every doc in docs/), or this cron has
   errored every day since it was added. Find out which.

5. Given the answers: what is the safe order of operations for adding a new
   migration, considering the five V2 files carry EARLIER timestamps than any
   new one and would be applied first by a routine push?

Report findings and stop. Do not proceed to Phase 1 without them.
```

---

### Phase 1 — Live V1 security fixes *(independent, ship on its own)*

```
[standing rules]

Four live security gaps in the CURRENT V1 system, independent of V1.5. See
docs/debate-v1-hardening-plan.md Part 2. One migration:
supabase/migrations/<timestamp>_debate_v1_security_fixes.sql

1. Replace the "Moderators can update their debates" policy on public.debates.
   It has USING (auth.uid() = moderator_id) and NO WITH CHECK, so a moderator
   can write any column — status, current_phase, vote counts, recap_text —
   directly from the browser, bypassing every RPC guard. Add both USING and
   WITH CHECK, plus a trigger rejecting authenticated-role changes to
   lifecycle columns. Moderators keep editing title, description, tags.

2. REVOKE ALL ... FROM PUBLIC / GRANT EXECUTE ... TO authenticated on all six
   V1 RPCs (join_debate, cast_motion_vote, toggle_debate_vote, start_debate,
   advance_debate_phase, close_debate). All currently carry Postgres's default
   PUBLIC grant, so anon can call them.

3. Fix toggle_debate_vote: it never confirms the argument's debate exists and
   never checks its status, so arguments in a closed debate can still be
   upvoted via direct RPC. Use its existing "return a JSON error object"
   convention, not RAISE.

4. Fix close_debate's null-moderator false positive: moderator_id is
   ON DELETE SET NULL and the function raises 'Debate not found.' on NULL,
   making that debate permanently uncloseable by anyone including an admin.

Equivalents for 2-4 exist, already reviewed, inside
20260718000003_debate_v2_lifecycle_permissions.sql. Extract the V1-relevant
logic. Whether you may apply that file at all depends on Phase 0's findings —
do not apply or modify it here.

Write docs/debate-v1-security-fix-verification.md with runnable SQL proving
each fix, to run against staging before deploy.
```

---

### Phase 2 — Schema

```
[standing rules]

Implement Part 4 of the spec. One migration:
supabase/migrations/<timestamp>_debate_v1_5_foundation.sql

- New columns on debates, with debate_variant defaulting to 'legacy'.
- Relaxed status and current_phase CHECK constraints (keep 'closing' valid).
- debate_slots_v1_5, with PRIMARY KEY (debate_id, stance) and
  UNIQUE (debate_id, user_id). The PK is what structurally guarantees 1v1 —
  do not weaken it. Public SELECT, no client write policy.
- debate_argument_sources_v1. Public SELECT, no client write policy.
- Recap status columns.

CRITICAL — close the direct-write bypass. Replace the INSERT policies on
debate_arguments, debate_participants, and debate_motion_votes so each also
requires the debate's debate_variant = 'legacy'. Reproduce each policy's CURRENT
definition verbatim first (debate_arguments' latest is in
20260704000001_trust_safety_v1.sql — check for anything newer) and add the
variant condition. Without this, a client can bypass every V1.5 rule with a
direct .insert(). Restrict direct debate_votes writes too; V1.5 upvotes use
the shared RPC.

Then write lib/debateV15.ts: phase order, transition predicates, deadline
checks, word limits (opening 300, rebuttal 200), submission caps. Pure
functions, no Supabase. Unit-test in lib/debateV15.test.ts. SQL stays
authoritative; this mirrors it for client feedback and testing.

Add lib/debateV15.ts to tsconfig.check.json.

No UI in this phase.
```

---

### Phase 3 — RPCs

```
[standing rules]

Implement every function in Part 5. One migration:
supabase/migrations/<timestamp>_debate_v1_5_rpcs.sql

Non-negotiable requirements, each fixing a real defect in current V1:
- submit_debate_argument_v1_5 derives round_number from current_phase and
  resolves stance from debate_slots_v1_5. Neither is ever accepted from the
  caller. Today both are client-supplied and unchecked.
- It requires current_phase AND now() <= the matching deadline. Both.
- Word limits and one-submission-per-phase are enforced in SQL. Lock the
  caller's slot row to serialise concurrent submissions from the same user.
- cast_final_vote_v1_5 requires current_phase='voting' AND
  now() <= voting_deadline.
- start_debate_v1_5 refuses unless BOTH slots are status='accepted'. This is
  the readiness gate and the most important rule in the design.
- Every moderator transition takes p_expected_phase and compares it under the
  row lock, returning stale_no_op on mismatch.
- extend_deadline_v1_5 takes expected_current_value as a compare-and-swap so
  duplicate clicks cannot stack extensions.
- Add debate_variant='v1_5' rejection guards to FIVE legacy RPCs: join_debate,
  cast_motion_vote, start_debate, advance_debate_phase, close_debate.
  toggle_debate_vote is EXCLUDED — it is shared by both formats. Give it the
  debate-existence check and closed/cancelled rejection instead.
- Extend notifications_type_check using the TRUE deployed definition from
  Phase 0, not any migration file's assumption. Append:
  debate_invitation, debate_invitation_response, debate_phase_advanced,
  debate_cancelled.

Extend lib/debateV15.test.ts with a contract test per rule.
```

---

### Phase 4 — Recruiting and invitations

```
[standing rules]

New directory app/(main)/debates/[id]/v15/. Route to it from
app/(main)/debates/[id]/page.tsx based on debates.debate_variant, using the same
branching pattern the existing V2 check uses there.

Recruiting screen:
- Motion, context, moderator attribution, all four deadlines in the VIEWER'S
  LOCAL TIMEZONE (the prototype hardcodes WAT — show local, WAT secondary).
- Two slots, FOR and AGAINST. Each renders exactly one of: not yet invited /
  awaiting response from <name> / confirmed <name> / invitation declined.
  Single-slot language only — no "1 of 2 confirmed".
- Moderator: invite a debater to a side (user search), revoke a pending
  invitation, replace a declined invitee, or remove an accepted debater before
  the debate starts; extend recruiting; cancel debate (confirmation + reason).
- Invitee: accept/decline prompt, stating the commitment plainly — "Accepting
  commits you to submit one opening argument and one rebuttal before their
  deadlines. Your side is locked once you accept."
- Everyone else: "Waiting for both sides to be confirmed. The moderator cannot
  start the debate until each side has an accepted debater."
- Moderator readiness checklist. Start is disabled until both slots are
  accepted, with the blocking reason visible.

All clickable affordances are real <button>/<a> elements, not styled spans.
```

---

### Phase 5 — Opening, rebuttal, voting

```
[standing rules]

Opening and rebuttal screens:
- Phase header: current phase, its deadline, and what comes next.
- Two argument columns. Each shows the submitted argument, or "Awaiting FOR's
  opening argument.", or "Deadline passed. You did not submit an opening
  argument for FOR."
- During rebuttal, both openings appear above as reference.
- Composer visible only to the debater whose slot is empty this phase, and
  only while the deadline has not passed. Live word counter (opening 300,
  rebuttal 200) and a sources field (up to 5 URLs).
- State clearly that a submission is final once submitted.
- Moderator: advance phase, extend the current deadline, cancel.
- Cancelled banner where applicable, with arguments still readable.

Voting screen:
- "Argument submission is closed", the voting deadline, all four arguments
  readable together.
- FOR/AGAINST vote control and the running total.
- This line verbatim near the control: "Argument upvotes identify strong
  arguments. They do not decide the debate — only your final vote counts
  toward the verdict."
- Upvoting stays available per-argument and visibly separate from the verdict
  vote.
- Moderator: Remind voters, and Close debate (calls complete_debate_v1_5,
  with confirmation).

FOR and AGAINST must be distinguishable without relying on colour alone.
```

---

### Phase 6 — Verdict and recap

```
[standing rules]

Verdict screen:
- Community verdict as a percentage split plus total votes ("FOR — 58% to
  42%", "413 final votes cast").
- Key disagreement, Areas of agreement, Strongest — FOR, Strongest — AGAINST,
  Sources cited, Participants, Related debates.
- The recap is AI-assisted and must be labelled as such. It summarises; the
  verdict comes from the vote count and nothing else. Never render AI text in
  a way that implies it decided the debate.

Recap generation:
- complete_debate_v1_5 sets recap_status='pending'.
- The server action that called it then requests generation. The recap route
  sets 'generating', then 'ready' or 'failed', incrementing recap_attempts.
- The verdict page renders every state honestly: pending, generating, ready,
  and failed with a moderator-visible Retry action.
- The debate is complete and readable regardless of recap state. Recap failure
  must never block the verdict.

First check whether app/api/debate-recap/route.ts can produce the four
structured fields or only the single recap_text blob, and report before
changing it.
```

---

### Phase 7 — Creation flow

```
[standing rules]

Update app/(main)/debates/create/page.tsx to create V1.5 debates.

- Replace the DURATION_OPTIONS picker (5/10/15 minutes — a synchronous-format
  artefact at line 17) with the four deadlines.
- Offer presets, since few moderators will want to pick four datetimes by
  hand. Suggested default: 3 days to recruit, 2 days per argument phase,
  2 days to vote. Presets matter more to completion rate than almost anything
  else in this build — make the default path one click.
- Show and store times unambiguously; validate strictly increasing deadlines
  client-side, with the RPC re-validating.
- Update the debates list to show V1.5 phase and next deadline, and to render
  cancelled debates distinctly rather than hiding them.
```

---

### Phase 8 — Delete the V2 stack

```
[standing rules]

Per decision D4, remove Debate V2 so the codebase carries two debate systems
(legacy V1 and V1.5), not three.

Depends entirely on Phase 0's findings — read docs/debate-deployment-state.md
first and follow what it actually found, not what any other doc claims.

If the V2 migrations were NEVER applied:
- Delete the five migration files.
- Delete app/(main)/debates/[id]/v2/, lib/debateV2.ts, lib/debateV2Ui.ts,
  lib/debateV2Lifecycle.ts and their tests.
- Delete app/api/cron/advance-debate-rounds/ and
  app/api/cron/process-debate-notifications/, and remove the latter from
  vercel.json's crons array.
- Remove ActivateDebateV2.tsx, the DEBATE_V2_ACTIVATION_ENABLED gate, and the
  V2 branch in app/(main)/debates/[id]/page.tsx.
- Delete docs/debate-v2-*.md, retaining docs/debate-v1.5-build-spec.md.
- Keep lib/debateV2Ui.ts's resolveDebateExperienceVersion ONLY if something
  still calls it; otherwise remove it too.

If some V2 migrations WERE applied, deletion is a database change, not a file
deletion. In that case: do NOT drop tables in this phase. Write a removal plan
naming every applied object, whether any holds data, and a safe drop order —
then stop and report.

Run npm run lint && npm run typecheck && npm test after removal. Nothing
should reference a deleted module.
```

---

### Phase 9 — Verification sweep

```
[standing rules]

No new features.

1. npm run lint && npm run typecheck && npm test — all clean.

2. Walk every prototype state: recruiting (nobody invited / one invited /
   one accepted / both accepted), opening (neither, one, both submitted;
   deadline passed), rebuttal, voting, verdict, and cancelled from each state.

3. Bypass testing — this is the point of the phase. With the client bypassed
   (direct supabase-js calls as an authenticated user), confirm each of these
   is refused SERVER-side:
   - inserting into debate_arguments directly on a V1.5 debate
   - inserting into debate_motion_votes directly on a V1.5 debate
   - submitting an over-limit argument
   - submitting a second argument in the same phase
   - submitting after the phase deadline has passed
   - voting outside the voting phase, or after the voting deadline
   - claiming a second slot on an occupied side
   - starting a debate with only one accepted slot
   - a non-moderator calling any manager-only RPC
   Each must fail. Any that succeeds is a release blocker.

4. Mobile at 375px. Accessibility: FOR/AGAINST distinguishable without colour,
   labelled controls, role="alert" on errors, full keyboard path through
   invite → accept → submit → vote.

5. Write docs/debate-v1-5-verification.md recording what passed, what failed,
   and what remains unverified.
```

---

## Part 9 — Out of scope

- No cross-examination, closing round, jurors, confidence scores, argument
  relation types, or reaction taxonomy. If V1.5 succeeds and users ask for
  more structure, that is when those concepts earn their way back.
- No lifecycle automation (D3). Additive later.
- No debate-in-feed integration.
- No editable-after-submission. Pilot rule is final-on-submit.
