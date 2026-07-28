# Debate V1 — how it is built, and how to solidify it

Audit date: 27 July 2026. Everything below is read from the migrations and
components as they actually stand, not from the V2 design docs.

---

## Part 1 — How V1 is built today

### Data model

Four tables, all created early and barely changed since:

| Table | Shape | Notes |
|---|---|---|
| `debates` | `id, title, description, moderator_id, status, round_duration_minutes, tags, created_at, ends_at` + later `current_phase`, `motion_for_count`, `motion_against_count`, `recap_text`, `recap_generated_at`, `format_version` | `status` is `open \| active \| closed`; `current_phase` is `opening \| rebuttal \| closing`. `moderator_id` is `ON DELETE SET NULL`. |
| `debate_arguments` | `id, debate_id, author_id, content, round_number, upvotes, created_at` + later `stance` | `stance` is nullable — legacy rows have none, and `resolveStance()` in the page falls back to round-number parity. |
| `debate_participants` | `(debate_id, user_id)` PK, `stance`, `joined_at` | One stance per person per debate, locked on join. |
| `debate_motion_votes` | `(debate_id, user_id)` PK, `vote`, `created_at` | Separate from argument upvotes. |
| `debate_votes` | `(user_id, argument_id)` PK | Argument upvotes. Denormalised onto `debate_arguments.upvotes`. |

### Lifecycle

```
open --start_debate--> active/opening --advance--> rebuttal --advance--> closing --close_debate--> closed
```

Three phases, defined in `lib/debatePhases.ts` with client-side word limits
(opening 300, rebuttal 250, closing 200) and a phase→round-number map
(1/2/3).

Every transition is **manual and moderator-driven**. `start_debate` sets
`ends_at = now() + round_duration_minutes * 3`, but **nothing ever reads that
value to act on it** — there is no cron, no scheduled job, no auto-advance and
no auto-close for V1. `ends_at` is decorative; it drives a countdown in the UI
and nothing else.

### Permissions

- **Creating a debate** requires `verified = true` or role `editor`/`admin`
  (`20260501000001_debate_v1_polish.sql`). Good gate.
- **Starting / advancing / closing** is the moderator, or any editor/admin.
- **Joining** locks a stance permanently — `join_debate` returns the existing
  stance rather than changing it, and there is no UPDATE or DELETE policy on
  `debate_participants`.
- **Submitting an argument** is a **direct client INSERT**, not an RPC. The
  RLS policy (latest version in `20260704000001_trust_safety_v1.sql`) is the
  only enforcement point. It checks: authenticated, own `author_id`, not
  suspended, `stance IN ('for','against')`, debate is `active`, and a matching
  `debate_participants` row exists.

### Live updates

`LiveArguments.tsx` subscribes to Supabase realtime for argument inserts,
upvote updates, and debate-row updates — but only when
`shouldUseRealtime()` returns true, which requires
`NEXT_PUBLIC_ENABLE_REALTIME=1`. That env var appears nowhere else in the
repo, and `20260521000001_disable_realtime_for_launch_stability.sql` dropped
`debate_arguments` from the `supabase_realtime` publication entirely.

**So V1 has no live updates at all in production.** A "Live" debate is a page
you have to manually refresh. This is the single biggest gap between what the
UI promises and what it does.

---

## Part 2 — What is actually broken

Ordered by severity. Every item is verified against the migrations, not
inferred.

### P0 — Security fixes exist but were never applied

`20260718000003_debate_v2_lifecycle_permissions.sql` contains fixes for three
**live V1 bugs**. That migration has never been run against any database, so
all three are still live:

1. **All six V1 RPCs are executable by `anon`.** `join_debate`,
   `cast_motion_vote`, `toggle_debate_vote`, `start_debate`,
   `advance_debate_phase`, `close_debate` all carry Postgres's default
   `EXECUTE`-to-`PUBLIC` grant; none ever received an explicit `REVOKE`. Each
   rejects an unauthenticated caller internally, so this is not currently
   exploitable — but it is the wrong default and one internal-check regression
   away from being serious.

2. **`toggle_debate_vote` never checks the debate's status.** Arguments in a
   closed debate can still be upvoted through a direct RPC call. It also never
   confirms the argument's debate exists.

3. **`close_debate` breaks permanently if the moderator's profile is
   deleted.** `moderator_id` is `ON DELETE SET NULL`, and `close_debate`
   raises "Debate not found." when it reads `NULL`. That debate can then never
   be closed by anyone, including an admin.

### P0 — The moderator UPDATE policy has no `WITH CHECK`

```sql
CREATE POLICY "Moderators can update their debates" ON public.debates
  FOR UPDATE USING (auth.uid() = moderator_id)
```

`USING` with no `WITH CHECK` means a moderator can write **any column** on
their own debate directly from the browser client — `status`,
`current_phase`, `motion_for_count`, `motion_against_count`, `recap_text`,
even `format_version`. Every guard in `start_debate` / `advance_debate_phase`
/ `close_debate` is bypassable with one `.update()` call. This is the most
serious issue in V1.

### P1 — Argument submission is almost entirely unenforced server-side

The RLS policy checks who you are and that you joined. It does **not** check:

- **Word limits.** 300/250/200 are enforced only in `ArgumentForm.tsx`. A
  10,000-word argument inserts fine.
- **`round_number`.** It is supplied by the client from `PHASE_ROUND_MAP` and
  never validated against `debates.current_phase`. A client can post a
  round-3 "closing" argument during the opening phase.
- **How many arguments you may submit.** There is no cap at all. One
  participant can post fifty arguments in a phase and bury the other side.

For a product whose entire value proposition is *structured* debate, the
structure currently exists only in the UI.

### P1 — A debate can stall forever

Nothing auto-advances or auto-closes. If a moderator starts a debate and then
disappears, it stays `active` in the opening phase indefinitely, with a
countdown that expired weeks ago still rendered. Editors and admins can
intervene, which is the saving grace — but that is manual cleanup, not a
system property.

### P2 — Smaller correctness issues

- **`toggle_debate_vote` has a check-then-act race.** `SELECT EXISTS` then
  `INSERT`/`DELETE` with no lock; two concurrent toggles can both read "not
  voted" and produce a wrong final state plus a drifted `upvotes` counter.
- **`cast_motion_vote` recomputes counts with a full `COUNT(*)`** — mostly
  self-healing, but concurrent votes can still write a stale denormalised
  count.
- **`notify_debate_reply` notifies every previous arguer on every argument.**
  O(n) notifications per submission, no dedup, no per-debate opt-out. A busy
  debate is a notification firehose.
- **Legacy `stance IS NULL` rows** still exist and are resolved by round-number
  parity in `resolveStance()`. That heuristic is wrong for any legacy argument
  posted out of turn.
- **No moderation path for debate arguments.** There is a SELECT and an INSERT
  policy and nothing else — no UPDATE, no DELETE. An abusive argument cannot be
  removed or hidden by anyone, including an admin, through the app.

---

## Part 3 — The plan

Four stages. Stage 1 is non-negotiable; the rest are judgement calls.

### Stage 1 — Close the security holes (do this regardless of anything else)

One new migration. Small, surgical, no product change.

1. Replace the `debates` UPDATE policy with one that has a `WITH CHECK` and
   restricts writable columns to the presentational ones (`title`,
   `description`, `tags`). Lifecycle columns move to RPC-only.
2. `REVOKE ALL ... FROM PUBLIC` / `GRANT EXECUTE ... TO authenticated` on all
   six V1 RPCs.
3. Add the closed-debate and existence checks to `toggle_debate_vote`.
4. Fix `close_debate`'s null-moderator false positive.

Items 2–4 can be lifted almost verbatim from
`20260718000003_debate_v2_lifecycle_permissions.sql` — the code is already
written and reviewed, it has just never been applied. Extract the V1-relevant
statements into a standalone V1 migration rather than applying the whole V2
migration.

**Effort: small. Risk: low. Do it this week.**

### Stage 2 — Make the structure real

Move argument submission from a direct client INSERT to a
`submit_debate_argument_v1` `SECURITY DEFINER` RPC that enforces, server-side:

- word limit for the current phase,
- `round_number` derived server-side from `debates.current_phase` (never
  client-supplied),
- a submission cap per debater per phase — I would start with 2,
- stance resolved from the caller's `debate_participants` row rather than
  trusted from the request.

Keep the RLS policy as defence-in-depth but tighten it to block direct inserts
once the RPC exists.

This is the change that turns V1 from "a comment thread with phase labels"
into an actual structured debate, and it is a fraction of V2's complexity.

**Effort: medium. Risk: medium — it changes the write path, so it needs the
ArgumentForm updated in lockstep.**

### Stage 3 — Stop debates from stalling

Two options, and I would do the first:

**(a) Soft expiry, no cron.** When `ends_at` has passed, the UI stops
accepting arguments and shows "This debate has run over — the moderator can
close it or extend." Add an editor/admin "close stalled debate" affordance in
the admin hub. Purely client + policy work, no scheduled infrastructure.

**(b) Real auto-advance via cron.** A `/api/cron/advance-debates` route on the
existing `CRON_SECRET` convention. More correct, but it needs sub-daily cron
frequency — which is the same unresolved Vercel plan question blocking V2, and
`vercel.json` currently has no such entry.

Option (a) gets you 80% of the benefit with none of the infrastructure
dependency. Take (b) later if debate volume justifies it.

**Effort: (a) small, (b) medium + an operational decision.**

### Stage 4 — Fix the "Live" lie

Right now the product says Live and behaves static. Pick one:

- **Enable realtime properly**: re-add `debate_arguments` to the publication
  and set `NEXT_PUBLIC_ENABLE_REALTIME=1`. The client code already exists and
  works. But realtime was disabled deliberately "for launch stability" — find
  out why before re-enabling.
- **Poll instead.** V2 already solved this well: a cheap
  fingerprint query every 15s, paused when the tab is hidden, stopped when the
  debate closes (`DebateV2Room.tsx` + `loadRoomSignal.ts`). That pattern is
  portable to V1 in a day and has no infrastructure dependency.

I would port the polling pattern. It is proven in this codebase, degrades
gracefully, and does not reopen whatever stability problem caused realtime to
be switched off.

**Effort: small-medium. Risk: low.**

---

## What I would not do

- **Do not add moderation tooling for debate arguments yet** unless you have
  actually seen abuse. It is a real gap, but it is a gap in a room nobody is
  currently being harmed in.
- **Do not fix the legacy `stance IS NULL` rows** with a migration until you
  know how many exist. Run the count first; if it is under a hundred, fix them
  by hand.
- **Do not build phase-level analytics** before Stage 1–3 are done.

---

## Sequencing against V2

Stages 1 and 2 are pure V1 investment and are **not** wasted if you later ship
V2 — the security fixes are shared, and the submission RPC teaches you what
enforcement actually matters before committing to V2's much larger rule
surface.

Stage 4's polling port is directly reusable: it is V2's own mechanism, moved
earlier.

The honest read: Stage 1 is mandatory maintenance. Stages 2–4 are roughly two
to three weeks of work that make V1 a genuinely solid product — and that is
the version worth putting in front of users to find out whether anyone wants
structured debate at all, before spending anything more on V2.
