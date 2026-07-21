# Debate V2 Phase 4B: subscriptions and trustworthy event-driven notifications

## Deployment status

Not applied to any database. This repository has no local PostgreSQL/Supabase
harness (see `CLAUDE.md`), so everything below has been verified by static
review of the SQL and by pure-JS contract tests
(`lib/debateV2.test.ts`, `lib/debateV2Lifecycle.test.ts`,
`app/(main)/debates/[id]/v2/V2SubscriptionControl.test.tsx`,
`app/(main)/debates/[id]/v2/DebateV2Room.test.tsx`) that mirror the SQL's
logic, never by executing it. Concurrency, RLS, grants, and `SKIP LOCKED`
behaviour are claimed nowhere as verified — see "Staging checklist" below for
what must be run against a real environment before this ships.

### Post-review corrections (applied in place, migration never applied to a database)

Two issues found on review before this migration was ever deployed, both
fixed directly in `20260721000003` rather than via a corrective follow-up
migration:

1. **Stale `notifications_type_check`.** The original draft rebuilt the
   constraint from the older `20260501000002_opportunity_hub_v1.sql` value
   list, silently dropping five values added since: `review_started`,
   `review_reminder`, `moderation_post_removed`, `moderation_comment_hidden`,
   `account_suspended` (all introduced across
   `20260704000001_trust_safety_v1.sql`,
   `20260705000003_reviewer_removal_and_review_started_notice.sql`, and
   `20260706000001_review_reminder_tracking.sql`). This would have either
   failed the migration outright against any environment with existing rows
   of those types, or silently broken every review-reminder and
   trust-and-safety notification going forward. Fixed by reproducing the
   full, current 22-value list from `20260706000001` (the true latest
   definition) and appending only the four new `debate_v2_*` values.
2. **Suspended users could not manage their own notification preferences.**
   `set_debate_subscription_v2` originally called `is_suspended()` like every
   other participation RPC. Removed: unsubscribing or disabling
   notifications is not content creation, and blocking it would have let the
   system keep notifying a suspended user while refusing to let them opt
   out. `SUSPENSION_GATED_FUNCTIONS_V2` (`lib/debateV2Lifecycle.ts`) was
   corrected to match what the SQL has always actually gated — six
   participation-writing functions (the four from the Phase 2 hardening pass
   plus the two Phase 4A cross-examination RPCs, which were gated in SQL from
   the start but missing from this list) — and no longer includes
   `set_debate_subscription_v2`.

Migration: `supabase/migrations/20260721000003_debate_v2_subscriptions_notifications.sql`,
applied after (in this order): `20260718000002_debate_v2_foundation.sql` →
`20260718000003_debate_v2_lifecycle_permissions.sql` →
`20260721000001_debate_v2_room_signal.sql` →
`20260721000002_debate_v2_cross_examination.sql` → this migration. Purely
additive — no existing migration was edited, no table or column was dropped,
no V1 code path was touched.

## Scope

Builds an engagement layer: follow/unfollow a Debate V2 debate, manage the
five existing per-debate notification preferences, and receive deduplicated
in-app notifications for five event categories, without exposing ballot data
or slowing lifecycle transitions.

Explicitly **not** in scope (see "Phase 5 deferrals" for the full list):
discovery/feed ranking, AI features, recap generation/redesign,
recommendations, analytics dashboards, email, push delivery.

## A. Subscription semantics

`public.debate_subscriptions` (Phase 1, `20260718000002`) gained one column:

```sql
ALTER TABLE public.debate_subscriptions
  ADD COLUMN IF NOT EXISTS is_subscribed boolean NOT NULL DEFAULT true;
```

Three distinct states are now representable:

| State | Row exists? | `is_subscribed` |
|---|---|---|
| Never subscribed | No | — |
| Subscribed | Yes | `true` |
| Explicitly opted out | Yes | `false` |

A row is **never deleted** on unsubscribe — `set_debate_subscription_v2` sets
`is_subscribed = false` on the existing row instead. Deleting the row would
collapse "opted out" back into "never subscribed", which is exactly what
would let auto-subscription resurrect an opt-out.

The five existing preference columns (`notify_phase_changes`,
`notify_direct_responses`, `notify_evidence_requests`, `notify_final_vote`,
`notify_recap`) are unchanged and remain independently toggleable.

### Write path: `set_debate_subscription_v2`

```sql
set_debate_subscription_v2(
  p_debate_id uuid,
  p_is_subscribed boolean,
  p_notify_phase_changes boolean DEFAULT NULL,
  p_notify_direct_responses boolean DEFAULT NULL,
  p_notify_evidence_requests boolean DEFAULT NULL,
  p_notify_final_vote boolean DEFAULT NULL,
  p_notify_recap boolean DEFAULT NULL
) RETURNS jsonb
```

- Identity is always `auth.uid()` — there is no `p_user_id` parameter to spoof.
- `p_is_subscribed` is required and always wins — it is never preserved from
  an existing row.
- Each `p_notify_*` parameter is nullable; when omitted (`NULL`), the
  existing row's own value is preserved (`COALESCE(p_param,
  debate_subscriptions.column)`); on first-ever subscribe, an omitted
  preference falls back to the table's default (`true`).
- Atomic via `INSERT ... ON CONFLICT (debate_id, user_id) DO UPDATE`.
- Returns only the caller's own resulting row — never a subscriber count,
  never another user's row (structurally impossible: the function only ever
  reads/writes the row keyed by `(p_debate_id, auth.uid())`).
- `SECURITY DEFINER` (the table has no client write policy), `SET
  search_path = public`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO
  authenticated` only. **Not** gated on `is_suspended()`, unlike every other
  authenticated V2 participation RPC — deliberately: managing one's own
  notification preferences is not content creation, and a suspended user
  must still be able to unfollow a debate or disable notifications. Gating
  this would let the system keep notifying a suspended user while refusing
  to let them opt out.
- Rejects a V1 debate (`format_version <> 2`) and an unauthenticated caller
  (`auth.uid() IS NULL`), matching every other V2 RPC's error ordering.

Pure mirror: `resolveSubscriptionUpsert()` in `lib/debateV2Lifecycle.ts`.

## B. Auto-subscription: durable and opt-out-safe

`ensure_debate_subscription_default_v2(p_debate_id, p_user_id)`:

```sql
INSERT INTO public.debate_subscriptions (debate_id, user_id)
VALUES (p_debate_id, p_user_id)
ON CONFLICT (debate_id, user_id) DO NOTHING;
```

This single statement is the entire mechanism. `DO NOTHING` means it is
**structurally impossible** for this call to touch an existing row — an
opted-out user can call `join_debate_v2` or `cast_debate_ballot_v2` a
thousand times and their `is_subscribed = false` row is never altered.

### Chosen high-intent call sites

| Function | Auto-subscribes? | Why |
|---|---|---|
| `join_debate_v2` (debater or juror) | Yes | Explicit minimum bar from the task spec |
| `cast_debate_ballot_v2` (any stage) | Yes | A ballot can be cast without ever calling `join_debate_v2` — genuinely separate high-intent path |
| `submit_debate_argument_v2` | No | Requires an existing debater membership already — `join_debate_v2`'s hook has always already run |
| `submit_cross_examination_question_v2` | No | Same reasoning — requires debater membership |
| `submit_cross_examination_answer_v2` | No | Same reasoning — requires debater membership |
| `toggle_debate_reaction_v2` | No | Requires no membership at all; a single click is judged too low-intent to auto-opt someone in |

Pure mirror: `applyAutoSubscribeDefault()` and
`HIGH_INTENT_AUTO_SUBSCRIBE_FUNCTIONS_V2` in `lib/debateV2Lifecycle.ts`.

## C. Event inventory and deduplication

`public.debate_notification_events` is a transactional outbox: every
participation/lifecycle RPC that produces a notification-worthy event writes
exactly one compact row here, atomically with its own mutation, via
`emit_debate_notification_event_v2()`, which performs `INSERT ... ON
CONFLICT (event_key) DO NOTHING`. The `event_key` UNIQUE constraint is the
entire deduplication guarantee — retries, concurrent calls, and repeated
toggling all collide on the same key for the "same" real-world event.

| Event type | Emitted by | Target | `event_key` format | Suppression |
|---|---|---|---|---|
| `round_change` | `start_debate_round_one_v2` (genuine start only) | broadcast | `{debate}:round:{round}:active` | `already_started` short-circuit returns before emission |
| `round_change` | `advance_or_close_debate_round_v2` (new phase ≠ `final_vote`) | broadcast | `{debate}:round:{round}:active` | `stale_no_op`/`not_due`/`debate_completed` all return before emission |
| `final_vote_open` | `advance_or_close_debate_round_v2` (new phase = `final_vote`) | broadcast | `{debate}:final_vote:{round}` | same as above; never emitted alongside a generic `round_change` for the same transition |
| `direct_response_question` | `submit_cross_examination_question_v2` | the asked debater | `{debate}:cross_question:{exchange}` | every question is a genuinely new write (no retry branch exists) |
| `direct_response_answer` | `submit_cross_examination_answer_v2` (genuinely new answer only) | the original asker | `{debate}:cross_answer:{exchange}` | `already_answered` short-circuit returns before emission — a duplicate/retried answer call never reaches the emission statement |
| `direct_response_rebuttal` | `submit_debate_argument_v2` (`entry_type = 'rebuttal'`) | the parent argument's author | `{debate}:rebuttal:{new argument id}` | each rebuttal argument is created exactly once |
| `evidence_requested` | `toggle_debate_reaction_v2` (adding `needs_evidence` only) | the argument's author | `{debate}:evidence:{argument}` | scoped to `(debate, argument)` only — **not** per-reactor — see below; never emitted on removal |

**Broadcast events** (`round_change`, `final_vote_open`) have
`target_user_id = NULL`; the worker resolves every eligible subscriber at
delivery time. **Direct events** have exactly one `target_user_id`, set at
emission time from data already validated/locked in that same function call
(never a fresh, unvalidated client-supplied id).

### Evidence-request deduplication: a deliberate scope decision

`evidence_requested`'s key is `{debate}:evidence:{argument}` — scoped to the
argument alone, not the reactor. The **first** `needs_evidence` add on a
given argument, by anyone, creates the one and only lifetime event for that
argument. Every subsequent add — a different user flagging it, or the same
user after an off/on cycle — collides on the same key and is silently
absorbed. This is the chosen answer to "repeated off/on activity must not
create notification spam": the author is told once that an argument was
flagged, not once per flagger and not once per toggle cycle. A finer-grained
"notify once per distinct reactor" design was considered and rejected for
simplicity and stronger spam-proofing.

### Round/phase-change vs. final-vote: never both

`advance_or_close_debate_round_v2` and `start_debate_round_one_v2` choose
between the two broadcast event types with a single branch
(`resolveRoundTransitionEventType()` in `lib/debateV2Lifecycle.ts` mirrors
this): a transition into `final_vote` emits only `final_vote_open`; every
other transition emits only `round_change`. `debate_completed` (leaving
`final_vote` to close the debate) emits nothing — not one of the five
required categories; see Phase 5 deferrals.

### Recap: preference kept, no event wired

`notify_recap` remains a fully functional, independently toggleable
preference column. No `recap_ready` event type exists and nothing emits one
in this phase: Debate V2 has no reliable recap-completion signal in this
repository yet (recap generation/redesign is explicitly out of scope for
Phase 4B), and the task's own instruction is to wire this only if such a
signal already exists reliably. Wiring a real `recap_ready` event is a
Phase 5 item once V2 recap generation exists.

## D. Delivery worker

`process_debate_notification_events_v2(p_limit integer DEFAULT 50)`:

- `SECURITY DEFINER`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO
  service_role` only.
- `p_limit` clamped to `[1, 200]` (mirrors `clampNotificationWorkerLimit()`).
- Claims rows with `... FOR UPDATE SKIP LOCKED`, `WHERE status = 'pending' OR
  (status = 'failed' AND attempts < 5)`, `ORDER BY created_at`, `LIMIT
  v_limit` — the same shape as `advance_due_debate_rounds_v2`
  (`20260718000003`).
- Each event is processed inside its own `BEGIN ... EXCEPTION WHEN OTHERS
  ... END` block (an implicit savepoint), so one malformed event cannot
  abort the batch. A failed event's `attempts` counter and `last_error` are
  recorded; it remains retryable on the next run until `attempts` reaches 5
  (`NOTIFICATION_EVENT_MAX_ATTEMPTS`), after which it is permanently
  excluded (dead-lettered) — inspectable directly in the table, not
  automatically retried further.
- Recipients and their preferences are resolved **fresh at delivery time**
  from `debate_subscriptions`, never cached from emission time — so a
  preference change or unsubscribe between emission and delivery is always
  honoured.
- Delivery is a plain `INSERT` into the existing `public.notifications`
  table. No external notification provider exists in this repository, so
  per the task's own instruction, that insert is the entire delivery
  mechanism — no email, no push.
- Never holds a lock across an external network call — there is none.
- Returns `{ processed, delivered, skipped, failed, errors }` — `delivered`
  counts events where at least one notification was actually inserted;
  `skipped` counts events successfully processed with zero eligible
  recipients (a real, non-error outcome, e.g. everyone unsubscribed since
  emission); `failed` counts exceptions, each with its event id and message.

Called by `app/api/cron/process-debate-notifications/route.ts`, which
mirrors `app/api/cron/advance-debate-rounds/route.ts` exactly: `GET`,
`Authorization: Bearer <CRON_SECRET>` check, `createAdminClient()`, RPC call,
structured JSON response.

Pure mirrors: `clampNotificationWorkerLimit()`,
`isNotificationEventEligibleForProcessing()`,
`isEligibleForDebateNotification()`, `isEligibleBroadcastRecipient()` in
`lib/debateV2Lifecycle.ts`.

## E. Preference mapping

| Event type | Gating preference |
|---|---|
| `round_change` | `notify_phase_changes` |
| `final_vote_open` | `notify_final_vote` |
| `direct_response_question` / `direct_response_answer` / `direct_response_rebuttal` | `notify_direct_responses` |
| `evidence_requested` | `notify_evidence_requests` |

Every delivery, direct or broadcast, additionally requires
`is_subscribed = true`. There is no "default to notified" fallback anywhere:
a missing subscription row is never eligible.

`notifications.type` (the four new CHECK-constraint values) is coarser than
`event_type`: the three direct-response sub-events all map to
`debate_v2_direct_response` (see `debateNotificationTypeFor()`) — the
always-explicit `message` text, not the type, is what distinguishes them for
the reader.

| `event_type` | `notifications.type` |
|---|---|
| `round_change` | `debate_v2_round_change` |
| `final_vote_open` | `debate_v2_final_vote` |
| `direct_response_*` (all three) | `debate_v2_direct_response` |
| `evidence_requested` | `debate_v2_evidence_requested` |

## F. Privacy boundaries

No function introduced or modified in this migration ever reads
`debate_ballots` — this is structural, not merely reviewed: vote,
confidence, reason, and `influential_argument_id` cannot reach a
notification payload, an event row, or any return value, because nothing in
this migration's call graph touches that table at all.

Every notification message embeds only a display name (via
`debate_display_name_v2()`, itself only reading `profiles.full_name`/
`username`, already public throughout this codebase) plus generic phase
language — never question/answer/argument content, never a reactor or voter
identity, never a subscriber count or list.

`set_debate_subscription_v2` cannot see another user's subscription row —
it only ever touches `(p_debate_id, auth.uid())`.

## G. Grants and RLS

- `debate_subscriptions`: existing self-only `SELECT` policy and "no direct
  client write policy" are both unchanged. This migration adds a column,
  not a policy.
- `debate_notification_events`: RLS enabled, **zero** policies — not even a
  moderator-read policy. This is deliberate: it is internal delivery
  plumbing, not a user-facing audit trail (contrast
  `debate_moderation_events`, which is a genuine audit log with a
  moderator/editor/admin read policy). Every access path is either
  `SECURITY DEFINER` composition (bypasses RLS via table ownership) or the
  `service_role`-only worker (bypasses RLS by role).
- `notifications`: unchanged — still no client INSERT policy (dropped in
  `20260715000007_restrict_notification_inserts_to_admin.sql`); the worker
  writes to it only via its own `SECURITY DEFINER` execution.
- 13 functions created/replaced total. Full grant table:

| Function | Grant |
|---|---|
| `set_debate_subscription_v2`, `join_debate_v2`, `cast_debate_ballot_v2`, `submit_debate_argument_v2`, `toggle_debate_reaction_v2`, `submit_cross_examination_question_v2`, `submit_cross_examination_answer_v2` | `authenticated` |
| `process_debate_notification_events_v2` | `service_role` |
| `debate_display_name_v2`, `ensure_debate_subscription_default_v2`, `emit_debate_notification_event_v2`, `start_debate_round_one_v2`, `advance_or_close_debate_round_v2` | none (composition only) |

Full security-checklist audit (search_path, `auth.uid()` validation,
`is_suspended()` coverage, row locking, `REVOKE`/`GRANT`, no dynamic SQL,
minimal return payloads) is in the migration's own section 17 footer.

## H. Lock order

Unchanged from Phase 2/4A: **debate → membership/round/domain row →
mutation/event**. Every lock already present in the six extended functions
is preserved byte-for-byte — no addition in this migration adds, removes, or
reorders a single `FOR UPDATE`. Every new auto-subscribe/event-emission call
is placed strictly after the relevant mutation has already succeeded and
acquires no lock of its own — `INSERT ... ON CONFLICT DO NOTHING` is
self-atomic. No new lock kind is introduced, so no new deadlock-ordering
risk relative to Phase 2/4A.

## I. Deployment order

1. Apply `20260721000003_debate_v2_subscriptions_notifications.sql` (after
   confirming `20260721000002_debate_v2_cross_examination.sql` is the latest
   applied Debate V2 migration in the target environment). Before applying,
   confirm the target environment's live `notifications_type_check`
   constraint is a subset of the 22-value list this migration's `DROP` +
   `ADD CONSTRAINT` reproduces (section C above) — if any environment has
   drifted (a `notifications.type` value in use that isn't in that list),
   the `ADD CONSTRAINT` step will fail immediately and loudly rather than
   silently, but confirming beforehand avoids a failed deploy.
2. Run the staging checklist below before enabling the cron schedule.
3. The scheduler entry is already present in `vercel.json` (see section J) —
   confirm it deploys correctly and, if the project is on a Vercel plan that
   does not support sub-daily cron, adjust the schedule per section J's
   plan-tier caveat before or immediately after this deploy.
4. Deploy the application code in this changeset (UI, actions, loader,
   pure-logic modules) — safe to deploy before or after step 1, since every
   new code path degrades gracefully: `loadDebateV2Room` treats a missing
   subscription row as `null` (already the pre-migration state for every
   caller), and `V2SubscriptionControl` renders correctly from that `null`
   state regardless of whether the migration has been applied yet. The
   `set_debate_subscription_v2` RPC call will simply fail (function does not
   exist) until step 1 completes, surfaced as an ordinary recoverable error
   in the UI.

## J. Scheduler requirements

`vercel.json` now includes:

```json
{
  "path": "/api/cron/process-debate-notifications",
  "schedule": "*/5 * * * *"
}
```

Creating the route alone does not process anything — Vercel Cron only
invokes a route if it is listed here. `CRON_SECRET` must already be set
(existing requirement, `CLAUDE.md`); the route rejects any request without
`Authorization: Bearer <CRON_SECRET>`, identical to every other cron route
in this repo.

**Plan-tier caveat:** both pre-existing entries (`review-reminders`,
`daily-brief`) run once daily, which is consistent with either a deliberate
choice or a Vercel Hobby-tier account (Hobby caps cron jobs at once/day;
sub-daily schedules require Pro or above). `*/5 * * * *` is the intended,
timely interval — frequent enough that direct-response notifications feel
prompt, infrequent enough that a 50-event default batch comfortably drains
typical volume between runs — but if the deployed project is on a plan that
rejects or silently caps sub-daily cron, fall back to a daily schedule (e.g.
`0 * * * *` hourly, or match the existing daily cadence) until the plan is
confirmed. This was not verified against the actual Vercel project settings
as part of this change.

**Related, separate, pre-existing gap (not fixed here):**
`advance-debate-rounds` — the round-lifecycle auto-advance worker from
Phase 2 — is *also* not present in `vercel.json`. This is intentional and
already documented: `CLAUDE.md`'s `DEBATE_V2_ACTIVATION_ENABLED` note states
activation stays off "until staging concurrency/grant verification and cron
scheduling for round auto-advancement are confirmed." Scheduling that cron
is out of scope for Phase 4B and was not touched here; flagged only so it
isn't mistaken for something this change already handled.

## K. Staging checklist

None of the following is claimed as verified — each requires a real
PostgreSQL/Supabase environment:

- [ ] RLS direct-write rejection: an authenticated client attempting a raw
      `INSERT`/`UPDATE`/`DELETE` on `debate_subscriptions` or
      `debate_notification_events` is rejected.
- [ ] Grants: `anon` cannot execute `set_debate_subscription_v2` or
      `process_debate_notification_events_v2`; `authenticated` cannot
      execute `process_debate_notification_events_v2`; only `service_role`
      can.
- [ ] Unsubscribe survives later participation: unsubscribe, then rejoin /
      cast another ballot — `is_subscribed` stays `false`.
- [ ] Concurrent preference updates: two overlapping
      `set_debate_subscription_v2` calls for the same user serialize
      correctly with no lost update.
- [ ] Duplicate event insertion: force two concurrent calls that would
      produce the same `event_key` (e.g. two overlapping
      `advance_or_close_debate_round_v2` calls) — confirm only one event row
      exists.
- [ ] Two overlapping workers: run `process_debate_notification_events_v2`
      concurrently from two sessions against the same pending backlog —
      confirm no event is delivered twice and no row is double-claimed.
- [ ] Lifecycle transition vs. worker: confirm the emitting RPC's own
      transaction commits (and is not blocked by) a concurrently-running
      worker instance.
- [ ] Notification preference filtering: an unsubscribed user, and a
      subscribed user with the relevant preference off, receive nothing;
      toggling it back on affects only future events.
- [ ] Direct-response targeting: only the intended single recipient ever
      receives a `direct_response_*` notification, never a broader
      subscriber list.
- [ ] Evidence-request deduplication: confirm the one-per-argument lifetime
      cap holds under concurrent reactions from multiple users.
- [ ] Ballot privacy: inspect `debate_notification_events.payload` and every
      resulting `notifications` row for a real debate with cast ballots —
      confirm no vote/confidence/reason/influential_argument_id appears
      anywhere.
- [ ] V1 regression: confirm every V1 notification-producing path (likes,
      comments, follows, V1 debate replies, etc.) is unaffected, and that
      `set_debate_subscription_v2`/the new participation-RPC extensions
      reject a V1 (`format_version = 1`) debate cleanly.
- [ ] `notifications_type_check` completeness: after applying, confirm every
      pre-existing notification type still inserts successfully — in
      particular `review_started`, `review_reminder`,
      `moderation_post_removed`, `moderation_comment_hidden`, and
      `account_suspended` (the five values a pre-review draft of this
      migration would have dropped). Trigger at least one of each via the
      existing review-reminder cron and trust-and-safety flows and confirm
      the resulting `notifications` row is written, not rejected by the
      constraint.
- [ ] Suspended-user preference access: as a suspended test account, confirm
      `set_debate_subscription_v2` (unfollow, disable a preference) succeeds,
      and confirm every genuinely participation-writing V2 RPC
      (`join_debate_v2`, `cast_debate_ballot_v2`, `submit_debate_argument_v2`,
      `toggle_debate_reaction_v2`, `submit_cross_examination_question_v2`,
      `submit_cross_examination_answer_v2`) still rejects the same account.

## L. Phase 5 deferrals (explicit)

- Discovery/feed ranking surfaces for followed debates.
- Any AI-assisted feature (summarization, recommendation).
- Recap generation/redesign for Debate V2, and the `recap_ready` event this
  would unlock (the `notify_recap` preference is ready and waiting).
- Recommendations ("debates you might want to follow").
- Analytics/observability dashboards for notification volume or delivery
  health.
- Email delivery.
- Push delivery (`lib/push.ts` / VAPID infrastructure already exists in this
  repo for other features but is not wired to Debate V2 in this phase).
- A `debate_completed` notification event (closing from `final_vote`) — not
  one of the five required categories; a plausible small addition later.
- Client-side auto-scroll/focus onto the specific round/argument/exchange a
  notification link identifies. Every notification link already routes to
  the correct room (`/debates/{id}`), and safe, non-private target
  identifiers (round/argument/exchange id) are recorded on every event row
  — but the room UI does not yet read a query parameter to scroll/highlight
  that target on arrival. Low-risk, deferred purely for scope.
- Cross-tab live sync of subscription state via `get_debate_room_signal_v2`.
  Deliberately not extended in this phase — subscription state is
  caller-private, changes only through the caller's own action, and the
  task's own instruction is to extend that signal only if a genuine
  cross-tab requirement cannot be met more cheaply. `V2SubscriptionControl`
  is self-contained after its initial load; a second open tab will show its
  own last-known state until its own next full page load.
- Manual re-queue tooling for permanently dead-lettered notification events
  (`attempts >= 5`) — currently inspectable only via direct table access
  (`last_error`), not through any admin UI or RPC.
