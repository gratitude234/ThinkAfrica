# The identity RPCs that gate the remaining read domains

**Status: blocking. Nothing here has been applied or changed.**

Eight normal-product read domains have moved behind explicit PostgreSQL
repositories. The ones that remain are gated on four database functions that
derive the acting user from `auth.uid()` and have no parameterised overload in
production.

This matters more than an ordinary missing function, because of *how* it fails.
`auth.uid()` returns null on a direct connection rather than raising. A function
written in terms of it does not error after the migration: it silently answers
as though nobody is signed in, and reports success. A reader would see an empty
onboarding state, an empty private profile, and no indication that anything went
wrong.

## What was measured

From the production catalogue (`scripts/migration/out/functions.tsv`), which is
the source of truth rather than `supabase/migrations/`, cross-referenced against
every `.rpc(` call in `lib/`, `app/` and `components/`.

41 RPCs are called from application code. 36 are safe: they either take the
actor as a parameter already or read no request context. Four are not.

| Function | Reachable from | Parameterised twin |
|---|---|---|
| `get_my_onboarding_state` | `lib/activation.ts`, `lib/discoverData.ts`, `lib/profileCommandCenterData.ts`, the home feed, settings, onboarding | Written in `20260909000001`, **not applied** |
| `get_my_profile_private` | `lib/profileCommandCenterData.ts`, the home feed, settings, subscriptions, onboarding, `components/ui/NotificationBell.tsx` | **Does not exist anywhere** |
| `complete_onboarding` | `app/(onboarding)/onboarding/actions.ts` (a write) | **Does not exist anywhere** |
| `record_user_activity_day` | `app/(main)/layout.tsx` (a write) | **Does not exist anywhere** |

`get_my_profile_private` is the widest of these: `NotificationBell` renders on
every authenticated page.

## What this blocks

- **Discover** and **activation state**, both of which read
  `get_my_onboarding_state`.
- **The profile command centre** and **the home feed**, which read both.
- Any read domain whose page also mounts `NotificationBell`, if the intent is
  for that page to be entirely free of PostgREST.

The two writes are listed for completeness. Writes are staying on Supabase for
this phase, so they are not blocking now, but they are the same defect and will
be blocking at write cutover.

## The remedy, in order

1. **Apply `20260909000001_parameterize_identity_rpcs.sql`.** It adds
   parameterised overloads for six functions, including
   `get_my_onboarding_state`, and keeps the no-argument forms delegating to
   them, so nothing calling the old signature breaks. This is a normal
   migration, not a cutover step.
2. **Write a parameterised `get_my_profile_private(p_user_id uuid)`**, in the
   shape `20260909000001` establishes: take the user id, raise on null, and
   leave the no-argument form delegating to it.
3. Then re-run the audit and migrate Discover, activation and the profile
   command centre.

Deliberately not done here. Applying a production migration is outside a
read-migration sprint, and doing it as a side effect of a refactor is how the
`reviewed_at` column and the missing `_v2` summary went unnoticed for as long as
they did.

## A related finding, same shape

`fellowship_applications.reviewed_at` does not exist, and the dashboard's
PostgREST select named it. That request has always failed with a 400 and the
caller discarded the error, so the applications list has silently been empty.
The column has been dropped from both backends, because a direct connection
raises where PostgREST returned nothing, and a quiet blank is better than a
broken page but worse than a correct one.

`get_public_profile_record_summary_v2` is the same story from the other side:
the code asks for it, the catalogue says it does not exist, so every profile
record load pays a failing RPC before the successful v1 call. The fallback
handles it correctly; the wasted round trip is the cost.

## How to re-run the audit

The catalogue is a snapshot. Refresh it with
`node scripts/migration/measure-supabase.mjs`, then compare it against the
call sites: any `.rpc(` whose catalogue row has `touches_auth = true` and an
empty `args` column is on this list.
