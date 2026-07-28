# Debate V1.5 verification and release gate

Last updated: 2026-07-28.

## Local verification

The implementation has been checked statically with:

```text
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test -- lib/debateV15.test.ts lib/debateV15Migration.test.ts lib/debateRecap.test.ts lib/actionInbox.test.ts
npm.cmd run build
git diff --check
```

The focused contract suite covers the manual lifecycle, strict 1v1 readiness,
deadlines, one-shot submissions, source validation, final-vote outcomes,
recap parsing, notification actions, UI/RPC name alignment, RLS policy shape,
function grants, legacy RPC compatibility, and the absence of automatic V1.5
lifecycle functions.

No browser automation was run, by request. The standalone prototype was
reviewed from its HTML/CSS/JavaScript source. Responsive and visual behavior
still needs one short human walkthrough in staging before launch.

## Do not push the migrations yet

The repository contains earlier Debate V2 migrations whose live state is
unknown. A normal migration push may apply those files before the V1.5 files.
Run every Phase 0 probe in `docs/debate-deployment-state.md` against staging
and production first, and record the outputs there.

At minimum, confirm:

1. Which V2 timestamps are present in the migration ledger.
2. Whether `debates.format_version` and the V2 catalog objects exist.
3. Whether any live debate is already `format_version = 2`.
4. The deployed bodies and grants of all legacy debate RPCs.
5. Every value currently stored in `notifications.type`, plus the deployed
   `notifications_type_check` definition.

An unknown live-only notification type will make the V1.5 constraint rebuild
fail. A ledger/catalog disagreement can make an earlier V2 migration fail on
duplicate objects before V1.5 is reached.

## Staging database checks

After Phase 0 is resolved, apply the two V1.5 migrations to staging and verify
all of the following through authenticated Supabase clients—not as the
database owner, because an owner bypasses RLS:

- A verified member can create a V1.5 debate; an unverified member and a
  suspended member cannot.
- Direct V1.5 writes to slots, sources, arguments, motion votes, and argument
  votes fail. The matching RPC succeeds for an authorized caller.
- A moderator's direct debate update can change only title, description, and
  tags. Direct lifecycle/counter/recap/deadline changes fail.
- Legacy RPCs still work on legacy debates and clearly reject V1.5 debates.
- Both invited sides must accept before start. The same person cannot occupy
  both sides.
- Opening and rebuttal accept one final submission per debater, enforce
  300/200 words, reject invalid sources, and reject submissions after the
  matching deadline.
- Final voting is unavailable before the voting stage and after its deadline.
  Repeating the same vote removes it; switching sides reconciles both counts.
- Cancelled debates retain submitted arguments and cannot be presented as
  completed.
- Completing a debate persists the vote result even if recap generation
  fails. Failed recaps become retryable.
- The protected-field trigger permits V1.5 `SECURITY DEFINER` transitions and
  service-role recap updates while blocking direct authenticated writes.

Run concurrency checks with two sessions for:

- invite versus revoke;
- two submissions by the same debater;
- two final-vote clicks;
- argument upvote versus debate close;
- two phase-advance or completion clicks.

The losing request must become a safe no-op or a clear rejection; counts and
phase must remain correct.

## Runtime configuration

Confirm these server-side values in staging and production:

```text
ADMIN_SECRET
GEMINI_API_KEY
NEXT_PUBLIC_APP_URL
SUPABASE_SERVICE_ROLE_KEY
```

`GEMINI_RECAP_MODEL` is optional and defaults to `gemini-3.6-flash`.

Refresh the PostgREST schema cache after applying the migrations, then confirm
all new RPC signatures are discoverable. V1.5 itself needs no cron.

## Human staging walkthrough

Use one moderator, two debaters, one ordinary voter, and one signed-out
browser. Check creation, invitation notifications, accept/decline/replacement,
both writing stages, deadline-passed states, final voting, zero-vote and tied
verdicts, cancellation, recap success/failure/retry, local timezone plus WAT,
keyboard dialogs, and mobile layout.

Only enable the production creation entry point after these checks pass.
