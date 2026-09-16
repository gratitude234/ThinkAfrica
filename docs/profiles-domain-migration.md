# The profiles domain behind `lib/db`

Phase 4. What moved, what deliberately did not, and what has to be true before
the rest can.

## The rule

**Reads are adapter-controlled. Writes are Supabase-only.**

One read is currently adapter-controlled: the public profile identity lookup by
username. Every profile write in the application goes to Supabase
unconditionally, with no adapter branch anywhere in its path, and this is not an
oversight or a staging step that was left half-done. It is the boundary the
phase was scoped to.

| | Read path | Write path |
|---|---|---|
| Selected by | `DATABASE_ADAPTER` | nothing; always Supabase |
| Supabase implementation | `lib/db/supabase/profiles.ts` | `lib/profileMutations.ts` |
| PostgreSQL implementation | `lib/db/postgres/profiles.ts` | none, on purpose |
| Authorization | none needed: the projection is public | application-level, see below |

## What moved

`loadProfileIdentity()` in `lib/profileViewData.ts` was a PostgREST select. It
is now a delegation:

```ts
return getDatabase().profiles.findIdentityByUsername(username);
```

The `SupabaseClient` parameter is still accepted and is ignored, named
`_supabase` so the omission reads as deliberate. Every caller already had a
client to hand; removing the parameter would have rippled a signature change
through call sites to no benefit while the adapter still defaults to Supabase.

Three things came with it:

- **The projection.** `PROFILE_BASE_SELECT` and `profileIdentitySelect()` now
  live in `lib/db/supabase/profiles.ts`, because that is the only module that
  still issues a PostgREST profile select. `lib/profileViewData.ts` names the
  `positioning_statement` column nowhere at all, which
  `lib/profilePositioningStatement.test.ts` pins.
- **The positioning gate.** Both adapters read
  `isProfilePositioningEnabled()`. On the PostgREST side it decides a select
  string; on the SQL side it selects between two whole statements, so neither
  statement is assembled from anything dynamic. The parity comparison checks
  the *presence* of the key as well as its value, so one side reading the gate
  differently from the other is a failure even when the value is null.
- **The row shape.** `ProfileIdentityRecord` moved to `lib/db/types.ts`, since
  both adapters have to produce it, and is re-exported from
  `lib/profileViewData.ts` so existing imports keep working.

## What did not move, and why

**Everything else on the profile page.** The viewer context (follower counts,
follow state, blocks, messaging eligibility), the publications list, featured
work, the record preview and the opportunity state all still take a
`SupabaseClient` and query it directly. They are not behind `lib/db` and are
not adapter-controlled.

That is not because they are hard. It is because the profile page is the first
page with more than one query on it, and moving one query is what makes the
comparison meaningful: if the page renders identically with the identity row
coming from Neon and everything else coming from Supabase, the identity row is
proven. Moving all six at once would have proven only that six changes together
did not break anything.

**The other three profile projections.** `app/(main)/settings/page.tsx`,
`app/(main)/[username]/record/page.tsx` and `lib/profileCommandCenterData.ts`
each build their own select and each carry their own copy of the positioning
gate. They are not duplicates of the public identity projection: they read
different column sets for different audiences, and collapsing them into one
shared projection would widen all three to the union. The positioning test
enumerates every file that builds a profile projection, so a new one cannot
appear without being listed.

**Every write.** See below.

## Why writes stay on Supabase

Not caution for its own sake. Three specific things:

1. **Phase 4 forbids authenticated application writes against Neon.** That is
   the scope boundary, and it is the right one: a write is the operation where
   getting authorization wrong is not recoverable by re-running the migration.

2. **The authorization that protects a profile write is Supabase-shaped.**
   `lib/profileMutations.ts` documents this at length. A member's own profile
   row is protected by three things: an RLS policy (`auth.uid() = id`), a
   column-level `GRANT UPDATE` naming twenty columns, and
   `protect_profile_privileged_columns()`, a default-deny trigger. On Neon the
   first of those is inert, because `auth.uid()` returns NULL there (see
   `docs/auth-and-rls-migration.md`), so policies fail closed and the row is
   not writable through them at all. Phase 2 already moved the allowlist into
   the application in the same default-deny shape, ahead of the statement. What
   has *not* happened is the part that decides *whose* row it is without
   `auth.uid()`.

3. **Better Auth is not in place.** Until the session that identifies the
   writer is issued and verified by something the PostgreSQL adapter can read,
   a write against Neon would have to trust an id the caller supplied. That is
   the exact shape of the bug Phase 2 removed from nine client components.

## How the two implementations are kept honest

Four layers, each catching something the others cannot.

- **`lib/db/supabase/profiles.test.ts`** pins the PostgREST side: the table, the
  filter, `.maybeSingle()` rather than `.single()` or `.limit(1)`, and the
  null-versus-error distinction. A null row with no error is an answer; a null
  row with an error is a failure wearing the same clothes, and reading the
  second as the first is what told every visitor that every member's profile
  did not exist while Supabase was unresponsive.
- **`lib/db/postgres/profiles.test.ts`** pins the SQL side: the two statements,
  the parameters, `limit 2` so a lost unique constraint raises rather than
  serving an arbitrary profile, and the mapper's treatment of every column that
  is not a plain string.
- **`lib/db/postgres/normalise.test.ts`** covers the driver boundary itself,
  in every form a value is known to arrive in. Both Phase 3 production failures
  were here and neither was caught by a type.
- **`lib/db/parity.ts` / `parity.live.test.ts`** compares the two against two
  real databases, field by field, over a case set chosen so the interesting
  rows are included: profiles with interests, profiles that chose none,
  profiles that never answered, verified profiles, organizations.
- **`scripts/migration/preview-check.mjs`** renders real profile pages through
  both adapters on the same build and compares the visible text. This is the
  only layer that would catch the `text[]` failure mode in the form it actually
  takes: a TypeError inside a Suspense boundary, on a page that still answers
  HTTP 200.

## The snapshot boundary

The live differential compares production Supabase against a Neon copy taken in
Phase 3. Production has kept accepting new work since, so a profile created
after the copy is missing from Neon for a reason that has nothing to do with the
adapters.

The harness excludes those rows, and derives the cut-off from Neon rather than
remembering it: the newest `created_at` the copy holds *is* the moment the copy
was taken. A row older than that which is missing from Neon really did fail to
copy, and still fails the check. This replaced a run that reported a genuine
7/8 as a parity defect.

## Before profile writes can move

In order:

1. Better Auth issuing a session the PostgreSQL adapter can verify server-side,
   so `updateOwnProfile()` has a writer identity that did not come from the
   caller.
2. A `ProfilesRepository` write method whose signature makes the wrong thing
   unrepresentable, in the shape `lib/profileMutations.ts` already uses: no
   `profileId` parameter, ever.
3. The affected-row check on every statement. Zero rows updated is an
   authorization failure, not a no-op, and is the only signal left once RLS is
   inert.
4. A parity run over writes, which is a different harness: reads can be compared
   by running both, writes cannot.

Until all four, `getDatabase().profiles` exposes reads only, and that is why the
interface has exactly one method on it.

## See also

- `docs/auth-and-rls-migration.md`: why `auth.uid()` returns NULL on Neon and
  what that does to 151 policies.
- `docs/adr-neon-authorization.md`: the decision record for
  application-level authorization.
- `docs/post-page-query-path.md` §8: the same treatment for the post domain.
- `docs/neon-migration-plan.md`: the copy this differential compares against.
