# Debate V2 UI build — phased Claude Code prompts

Working document for building the debate experience shown in
`Indegenius Debate Prototype (Standalone).html` (the walkthrough mockup).
Each phase below is a **copy-pasteable prompt** for Claude Code. Run them in
order; do not skip Phase 0.

---

## Before you start: what is already true

Read this section yourself. It is also summarised into each prompt, but the
corrections here change how much work the phases actually are.

**The mockup is not a green-field spec.** Almost every concept in it already
exists in the repo:

| Mockup element | Already implemented at |
|---|---|
| Lobby / join as debater or juror | `app/(main)/debates/[id]/v2/V2Lobby.tsx` |
| Round rail (Opening → Rebuttal → Cross-Ex → Closing → Final Vote) | `V2RoundProgress.tsx` |
| Argument cards + reactions | `V2ArgumentCard.tsx`, `V2ReactionBar.tsx` |
| Composer with Supports/Challenges/Answers/Clarifies | `V2ArgumentComposer.tsx` |
| Cross-examination ask/answer | `V2CrossExamination.tsx` |
| Initial + final ballot, confidence, "which argument mattered most" | `V2BallotPanel.tsx` |
| Moderator start/advance/extend/close | `V2ModeratorControls.tsx` |
| Subscribe / notification prefs | `V2SubscriptionControl.tsx` |
| Room orchestration + 15s polling | `DebateV2Room.tsx` |
| Server data loading | `loadRoomData.ts`, `loadRoomSignal.ts` |
| Phase/relation/reaction copy | `labels.ts` |

All of it has colocated Vitest tests. **This project is a restyle plus two
genuinely new pieces (feed integration, nav alignment) — not a rebuild.**

**The design tokens already match the mockup.** `tailwind.config.ts` already
defines `emerald-brand #073929`, `gold #CE932B`, `gold-ink #8A5D1E`,
`purple-accent #391A60`, `green-tint`, `gold-tint`, `purple-tint`,
`green-wash`, `green-wash-border`, `canvas #FAF8F5`, `surface`, `ink`,
`ink-muted`, plus `font-sans` (Inter) and `font-display` (Bodoni Moda) —
byte-identical to the mockup's CSS variables. No palette work is needed.

**`CLAUDE.md` is stale and will mislead Claude Code.** It claims brand colors
`#10B981 / #F59E0B / #7C3AED` and "Playfair Display". Both are wrong. Phase 1
fixes this first, because every later phase reads `CLAUDE.md` for context.

**Two real gaps found while auditing:**

- `tsconfig.check.json` includes **zero** debate files, so `npm run typecheck`
  does not cover any of this work.
- `vercel.json` has no `/api/cron/advance-debate-rounds` entry at all (rounds
  will never auto-advance), and `/api/cron/process-debate-notifications` is
  scheduled daily (`0 10 * * *`) — far too infrequent for a live debate.

**Nothing in the V2 stack has ever run against a real database.** Migrations
`20260718000002`, `20260718000003`, `20260721000001`, `20260721000002`,
`20260721000003` are verified by static review and pure-JS contract tests
only. That is what Phase 0 exists to close.

---

## Standing rules — paste at the top of every prompt

```
Project: Indegenius (Think_Africa). Next.js App Router v16, React 19,
TypeScript, Tailwind, Supabase.

Standing rules for this task:
1. Do NOT edit any file in supabase/migrations/. The SQL is the authoritative
   contract. If UI work seems to need a schema or RPC change, STOP and tell me
   why instead of writing SQL.
2. Do NOT change any RPC signature, argument name, or return shape.
3. Do NOT change the rules encoded in lib/debateV2Lifecycle.ts or
   lib/debateV2.ts. They mirror the SQL deliberately; a divergence is a bug.
4. Use existing Tailwind tokens from tailwind.config.ts (emerald-brand, gold,
   gold-ink, purple-accent, green-tint, gold-tint, purple-tint, green-wash,
   green-wash-border, canvas, surface, ink, ink-muted; font-sans, font-display).
   Do NOT add raw hex values or new color tokens.
5. User-facing strings for phases, relations, reactions, and statuses come from
   app/(main)/debates/[id]/v2/labels.ts. Add there; never hardcode inline.
6. Keep every existing colocated *.test.tsx passing. Update a test only when
   the behaviour it asserts genuinely changed, and say so explicitly.
7. When done, run: npm run lint && npm run typecheck && npm test
8. Report anything you could not do rather than working around it silently.
```

---

# Phase 0 — Verify the V2 database layer against staging

**Blocking. Do not start UI work until this passes.**

```
Read docs/debate-v2-product-contract.md, docs/debate-v2-phase2-lifecycle.md,
and docs/debate-v2-phase4b-subscriptions-notifications.md in full.

Every Debate V2 migration in this repo has been verified only by static SQL
review and by pure-JS contract tests (lib/debateV2.test.ts,
lib/debateV2Lifecycle.test.ts). None has ever executed against a real
Postgres/Supabase instance. Your job is to close that gap.

Produce docs/debate-v2-staging-verification.md containing:

1. An ordered apply plan for these migrations against a fresh staging Supabase
   project:
     20260718000002_debate_v2_foundation.sql
     20260718000003_debate_v2_lifecycle_permissions.sql
     20260721000001_debate_v2_room_signal.sql
     20260721000002_debate_v2_cross_examination.sql
     20260721000003_debate_v2_subscriptions_notifications.sql
   Note any migration that must be applied after unrelated earlier ones, and
   verify the notifications_type_check value list matches what actually exists
   in supabase/migrations today (Phase 4B's doc records a prior near-miss here).

2. A concrete, runnable SQL test script per scenario below. Each must state its
   setup, the exact calls, and the expected result. These are the races the
   Phase 2 doc explicitly lists as unverified:
     a. Double-advance / round-skip: two concurrent advance_debate_round_v2
        calls with the same p_expected_round_id. Expect one transition, one
        stale_no_op — never a skipped round.
     b. Cron vs. concurrent extension: extend_debate_round_v2 pushes ends_at
        out while advance_due_debate_rounds_v2 is mid-flight. Expect not_due.
     c. Duplicate extension stacking: two extend calls with the same
        p_expected_ends_at. Expect one applied, one stale_no_op.
     d. Moderator reassignment between a manager's early authorization check
        and their lock acquisition. Expect the post-lock re-check to reject.
     e. A suspended user calling each of the six functions in
        SUSPENSION_GATED_FUNCTIONS_V2. Expect rejection from all six, and
        confirm set_debate_subscription_v2 is NOT gated (a suspended user must
        still be able to opt out of notifications).
     f. Submission limits under concurrency: same user, two simultaneous
        opening submissions. Expect exactly one to land.
     g. Ballot privacy: confirm get_debate_ballot_results_v2 never returns
        another user's ballot, that average_confidence is null below 3 ballots,
        and that anonymous callers see final results only on a closed debate.
     h. Function EXECUTE grants: confirm each function's actual grants match
        the inventory table in docs/debate-v2-phase2-lifecycle.md section I.

3. A cron section. vercel.json currently has NO /api/cron/advance-debate-rounds
   entry, so V2 rounds will never auto-advance, and
   /api/cron/process-debate-notifications is scheduled daily (0 10 * * *),
   which is far too infrequent for a live debate. Document the required
   schedules (round advancement needs every 1-5 minutes), what Vercel plan tier
   that requires, and the non-Vercel fallbacks. Do NOT edit vercel.json — this
   is my operational decision to make.

Do not modify any migration file. If a test reveals a bug, write it up in the
doc with a proposed fix and stop; do not apply the fix yourself.
```

---

# Phase 1 — Ground truth and guardrails

```
[standing rules]

Small, no-visual-change phase. Three tasks:

1. Fix the stale sections of CLAUDE.md. It currently claims brand colors
   #10B981 / #F59E0B / #7C3AED and "Playfair Display". The truth, per
   tailwind.config.ts and app/layout.tsx, is: emerald-brand #073929,
   gold #CE932B, gold-ink #8A5D1E, purple-accent #391A60, plus green-tint,
   gold-tint, purple-tint, green-wash, green-wash-border, canvas #FAF8F5,
   surface, ink, ink-muted; fonts are Inter (font-sans) and Bodoni Moda
   (font-display), not Playfair. Correct the UI Conventions section to match
   reality. While you are there, verify every other claim in CLAUDE.md's
   Architecture Overview against the actual tree and fix anything else stale.

2. tsconfig.check.json currently includes zero debate files, so npm run
   typecheck does not cover the Debate V2 UI at all. Add every file under
   app/(main)/debates/[id]/v2/ plus lib/debateV2.ts, lib/debateV2Ui.ts, and
   lib/debateV2Lifecycle.ts. Then run npm run typecheck and fix every error it
   surfaces. Report what it found — this is the first time these files have
   been type-checked as a group.

3. Write docs/debate-v2-ui-inventory.md: for each component under
   app/(main)/debates/[id]/v2/, one paragraph on what it renders today, which
   props it takes, and which part of the mockup it corresponds to. This is the
   map the later phases work against.

Make no visual changes in this phase.
```

---

# Phase 2 — Room shell and round rail

```
[standing rules]

Restyle the outer chrome of the Debate V2 room to match the mockup. Files:
app/(main)/debates/[id]/v2/DebateV2Room.tsx and V2RoundProgress.tsx.

The mockup's room shell has:
- A motion header: the motion statement in font-display, moderator attribution,
  a status pill (Open lobby / Live with a pulsing dot / Closed), and a
  countdown when a round is active.
- A horizontal round rail across the five phases, showing which is complete,
  which is active, and which is scheduled, with each phase's purpose text
  available on the active step.
- A calm, card-on-canvas layout: bg-canvas page, bg-surface cards, thin
  border-default hairlines, generous vertical rhythm. Deep green is used
  sparingly for emphasis, gold for the live/active accent.

Constraints:
- Phase names, purposes, and status labels come from labels.ts. If you need new
  copy, add it there.
- Do not change the polling logic, POLL_INTERVAL_MS, the roomSignalsDiffer
  check, or any data flow. This is presentation only.
- Keep DebateCountdown and ShareButton working; restyle rather than replace.
- The room must still render correctly for: anonymous viewer, authenticated
  non-participant, debater, juror, and moderator. Do not let a moderator-only
  affordance leak into a non-manager's view.

Update V2RoundProgress.test.tsx and DebateV2Room.test.tsx where the assertions
are genuinely about markup that changed. Do not weaken an assertion to make it
pass.
```

---

# Phase 3 — Lobby, stance selection, and ballots

```
[standing rules]

Restyle V2Lobby.tsx and V2BallotPanel.tsx to the mockup.

Lobby (mockup: "Argue FOR" / "Argue AGAINST" / join as juror):
- Side-by-side FOR/AGAINST cards showing who has already joined each side, and
  a separate, visually lighter juror join path.
- Make the stance lock explicit in the UI: a debater's stance cannot be changed
  by rejoining (resolveDebaterStanceOnJoin in lib/debateV2Lifecycle.ts). The
  current UI does not communicate this clearly enough — say it before the user
  commits, not after.
- Debaters may only join while status is 'open'; jurors may join while 'open'
  or 'active' (canJoinAsDebaterV2 / canJoinAsJurorV2). Reflect both windows.

Ballots (mockup: "Record your opening position" and "Cast your final ballot"):
- For / Against / Undecided, plus a required 1-5 confidence control.
  Confidence is required for every V2 ballot — do not render it as optional.
- Final ballot only: an optional "Which argument mattered most?" selector.
- Results bar shows for/against/undecided counts, and average confidence ONLY
  when total >= MIN_CONFIDENCE_SAMPLE_V2 (3). Below that the UI must explain
  why it is hidden rather than showing a blank or a zero.
- Respect canViewBallotResults: an anonymous viewer sees final results only on
  a closed debate.

Do not change ballot window rules, confidence validation, or visibility gating
— import and use the existing helpers from lib/debateV2Lifecycle.ts.
Keep V2Lobby.test.tsx and V2BallotPanel.test.tsx green.
```

---

# Phase 4 — Argument cards, composer, and reactions

```
[standing rules]

Restyle V2ArgumentCard.tsx, V2ArgumentComposer.tsx, and V2ReactionBar.tsx.

Argument cards (mockup):
- Stance is the primary visual signal — FOR and AGAINST must be
  distinguishable at a glance without relying on color alone (add a shape,
  label, or position cue; this is an accessibility requirement, not a
  preference).
- A rebuttal shows what it targets: "Challenges <author>'s claim: <claim>",
  built from the parent ref already on DebateV2ArgumentView.parent.
- Cited sources render as a compact list under the argument body.
- Reaction bar shows TOP_REACTION_TYPES first with an expander for the rest.
  needs_evidence (CRITICAL_REACTION_TYPES) must read as constructive, not as
  praise — style it distinctly.

Composer (mockup: "Your claim" / "Reasoning" / "This argument..."):
- Separate claim and reasoning inputs.
- During rebuttal only: a required parent-argument selector plus a required
  relation picker (Supports / Challenges / Answers / Clarifies) using
  RELATION_TYPE_LABELS and RELATION_TYPE_DESCRIPTIONS from labels.ts.
- A live word counter against the phase limit — opening 300, rebuttal 200,
  closing 150 — via countWordsV2. Show remaining submissions too (1 opening,
  2 rebuttals, 1 closing per debater).
- An optional source field.
- Client-side checks are for instant feedback ONLY. The SQL remains
  authoritative; never let a client check replace a server error, and always
  surface the server's message when it rejects.
- Preserve the user's typed content on a recoverable error. Do not reset forms.

Keep V2ArgumentCard.test.tsx, V2ArgumentComposer.test.tsx, and
V2ReactionBar.test.tsx green.
```

---

# Phase 5 — Cross-examination

```
[standing rules]

Restyle V2CrossExamination.tsx to the mockup's cross-examination screens
("Awaiting your answer", "Your answer", "Visible to the whole room once
submitted").

Requirements:
- Exchanges read as a question/answer pair, with the asker and target clearly
  attributed and the referenced argument quoted when present.
- Status chips use CROSS_EXCHANGE_STATUS_LABELS: Answered / Awaiting answer /
  Unanswered. Unanswered (expired) must look settled and neutral, not like an
  error — an unanswered question is a legitimate outcome and stays on the
  record permanently.
- Question limit: 60 words, max 2 per asker, shown as "N of 2 remaining".
  Answer limit: 120 words. Live counters on both.
- Only opposing debaters can be targeted; only the target can answer, and only
  while that exchange's own round is still the active cross-examination round.
  All of this is already computed by checkCrossExamQuestionEligibility,
  checkCrossExamTarget, checkCrossExamAnswerEligibility, and
  deriveCrossExchangeStatus — use them, do not reimplement.
- The section stays visible after the round ends so exchanges remain a durable
  record.

Keep V2CrossExamination.test.tsx green.
```

---

# Phase 6 — Closed state and recap

```
[standing rules]

Restyle the closed-debate view in DebateV2Room.tsx (the ClosedSummary section)
and align it with the mockup's "Archived recap" / "Debate recap" screens.

The mockup shows: a recap generation date, a "Generated by Claude" attribution,
a "Final verdict" section, a "Strongest cases, both sides" section, and the
viewer's own ballot.

Hard constraint, do not violate: the product contract states AI is assistive,
never authoritative — "AI never decides a winner, a phase transition, or a
ballot." The recap may summarise the strongest cases on each side and show the
community's final tally. It must NOT declare a winner, and the UI must not
imply the AI determined the outcome. Label AI-generated content clearly.

Also:
- Show initial vs. final ballot movement as plain before/after numbers. The
  existing code deliberately avoids declaring a winner from this — preserve
  that.
- Distinguish a normally completed debate from a force-closed one
  (closureKind), and say plainly that a force-closed debate ended early.
- Check whether the existing /api/debate-recap route works for V2 debates or
  assumes V1 shape. Report what you find; do not change the API in this phase.
```

---

# Phase 7 — Live debates in the home feed

```
[standing rules]

This phase is genuinely new work, not a restyle. lib/feedData.ts contains zero
references to debates today — the feed and the debates section are entirely
separate.

The mockup shows a live debate surfacing in the main content feed as a card
alongside posts, with a "Live debate" marker.

Task:
1. First, investigate and report before writing code. fetchFeedPage() in
   lib/feedData.ts is post-shaped throughout, with ranking in
   lib/feedRanking.ts and quality signals in lib/postQuality.ts. Tell me which
   of these is true and recommend one:
     (a) debates can be adapted into the existing feed item shape cleanly;
     (b) the feed needs a discriminated union of item types;
     (c) debates should be a separate rail above the feed rather than inline.
   Include the cost and blast radius of each. Do not proceed past this step
   without telling me your recommendation.

2. After I confirm the approach, implement it. Constraints:
   - Only surface debates that are actually live or in an open lobby. A closed
     debate does not belong in a live feed slot.
   - Do not regress feed pagination, ranking, or the home/following/latest tab
     behaviour. Add tests covering the new item type in the existing feed
     tests.
   - Respect FEATURE_FLAGS.debates — if debates are off, nothing debate-shaped
     appears in the feed.
   - Do not let a debate card trigger the per-post count queries
     (getCountsByPostId) meant for posts.

Add any file you touch to tsconfig.check.json if it is not already there.
```

---

# Phase 8 — Mobile shell alignment

```
[standing rules]

The mockup's mobile shell shows a bottom tab bar with Explore / Debates /
Profile. The app's actual BottomNav (app/(main)/BottomNav.tsx) has Home /
Explore / Messages / Profile, and already receives a hasActiveDebate prop from
app/(main)/layout.tsx.

Task:
1. Report the exact current tab set and how hasActiveDebate is used today
   before changing anything.
2. Reconcile with the mockup. Removing Messages to make room for Debates is a
   product decision I have not made — do not silently drop a tab. Present the
   options (replace Messages, add a fifth tab, or surface Debates via the
   existing hasActiveDebate affordance) with the tradeoffs, and wait for my
   call.
3. Once decided, implement it and keep BottomNav.test.tsx green.

Separately, and safe to do now: audit the Debate V2 room at mobile widths.
The room was built desktop-first. Check that the round rail, argument cards,
composer, ballot panel, and cross-examination forms are all usable at 375px,
that nothing overflows horizontally, and that no touch target is under 44px.
The layout already accounts for a fixed bottom nav via the
--mobile-visual-viewport-bottom custom property set in NavigationShell.tsx —
make sure the debate room's own sticky/fixed elements respect it and never sit
under the tab bar.
```

---

# Phase 9 — Verification sweep

```
[standing rules]

No new features. Verification only.

1. Run npm run lint, npm run typecheck, npm test. All three must be clean.
   Report anything you had to change to get there.

2. Accessibility pass on every V2 component:
   - FOR/AGAINST must be distinguishable without color.
   - Every form control has a label; every error uses role="alert"; every live
     region (countdowns, poll-driven updates) uses an appropriate aria-live.
   - Keyboard-only path through: join → submit argument → react → ask a
     cross-exam question → cast a final ballot.
   - Contrast check on gold-on-white and white-on-emerald-brand specifically —
     those are the two combinations in this palette most likely to fail.

3. Correctness audit against the contracts. For each of these, confirm the UI
   agrees with lib/debateV2Lifecycle.ts and report any divergence:
   word limits, submission limits, ballot windows, confidence requirement,
   the 3-ballot confidence threshold, ballot result visibility, cross-exam
   allowances, and reaction self-reaction rejection.

4. Confirm no client-side check has become load-bearing — every gated action
   must still surface the server's rejection if the client check is bypassed.

5. Write docs/debate-v2-ui-verification.md recording what you checked, what
   passed, what failed, and what remains unverified.
```

---

# Phase 10 — Rollout

```
[standing rules]

Do not run this phase until Phase 0's staging verification has actually passed
against a real database.

1. Document the exact activation path for a V2 debate end to end: the
   DEBATE_V2_ACTIVATION_ENABLED env var, the moderator-facing control in
   ActivateDebateV2.tsx, the service-role-only activate_debate_v2 RPC, and how
   resolveDebateExperienceVersion in lib/debateV2Ui.ts routes a debate to the
   V2 room.

2. Write a rollout checklist covering: which cron schedules must be live first
   (round advancement at 1-5 minute frequency is mandatory — without it, rounds
   never advance and a debate stalls forever), how to run a single pilot
   debate, what to watch, and the rollback path if something goes wrong
   mid-debate.

3. Explicitly document what a moderator should do if a debate stalls, since
   forced close is the only escape hatch and it is irreversible.

Do not flip any flag or edit vercel.json yourself.
```

---

## Sequencing notes

- **0 is blocking.** Everything after it is building on unverified foundations.
- **1 before everything else** — later phases read `CLAUDE.md`, and it is
  currently wrong about the palette and fonts.
- **2 → 6 are independent restyles** and can be reordered or parallelised.
- **7 and 8 contain product decisions** (feed shape, tab set). Both prompts are
  written to stop and ask rather than guess. Keep them that way.
- **9 after all UI phases.** **10 only after 0 has genuinely passed.**
