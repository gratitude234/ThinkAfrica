# ADR: authorization moves into the application

- **Status**: accepted, partially implemented
- **Date**: 2026-09-07 (Phase 4)
- **Supersedes**: nothing. This is the first record of the decision; the
  reasoning had been spread across
  [auth-and-rls-migration.md](auth-and-rls-migration.md) and the code.

## Context

Every authenticated operation in this application is currently authorized by
Postgres, not by the application. The mechanism is RLS: 151 policies, almost all
of which reduce to some form of `auth.uid() = <owner column>`. `auth.uid()` is a
Supabase function that reads the JWT claims GoTrue put on the connection, so the
policies work because the database knows who is asking.

Three things about that stop being true on Neon:

1. **There is no GoTrue.** Nothing sets the claims, so `auth.uid()` has nothing
   to read.
2. **The application connects as one role.** Every request shares a pooled
   connection under a single owner. There is no per-request database identity
   for a policy to compare against, and creating one per user is not compatible
   with connection pooling (nor with Hyperdrive, which is the deployment target).
3. **The owner role is exempt from RLS anyway.** A policy that a superuser or
   table owner never evaluates is not a control.

So the question is not *how do we port RLS*. It is *what replaces it*, and the
answer has to be decided once rather than per query, because the failure mode of
getting it wrong per query is silent.

## Decision

**Authorization becomes the application's responsibility, in one explicit shape,
at the boundary that issues the statement. RLS is migrated verbatim and left in
place as an inert second line, not removed.**

Concretely, four parts.

### 1. Every authenticated operation follows one sequence

```
authenticate  →  look up the resource  →  decide  →  statement  →  check rows affected
```

Never a statement whose `WHERE` clause is the authorization. A write that
authorizes by filter cannot distinguish "you may not" from "it does not exist",
and both come back as zero rows.

The affected-row check is not optional and not a nicety. Once RLS is inert it is
the only remaining signal that a write did what it was supposed to, so zero rows
updated is treated as an authorization failure, not as a no-op.

### 2. Identity is never a parameter

No repository method takes a user id from its caller. The viewer's identity
comes from the session, resolved server-side, at the point of use.

This is not a style preference. Phase 2 removed nine client components that ran
`.from("profiles").update(...)` against an id handed to them as a prop. Every
one of them was correct, and every one was correct only because RLS refused
anything else. An id in an argument position is an id a browser can choose.
`lib/profileMutations.ts` has no `profileId` parameter anywhere in it, and that
absence is the control.

### 3. Column allowlists move in front of the statement, default-deny

Supabase enforced which columns a member may change three ways: a column-level
`GRANT UPDATE`, a default-deny trigger
(`protect_profile_privileged_columns()`), and the RLS policy. The first two are
Supabase-shaped only in that they are enforced by the database we are leaving;
the *rule* they encode is application logic and is now stated as such, in the
same default-deny shape, in `SELF_EDITABLE_PROFILE_COLUMNS`.

Default-deny is the load-bearing half. An allowlist means adding a column to the
database does not quietly make it self-editable; a denylist means it does.

### 4. RLS is migrated, not dropped

All 151 policies were copied to Neon verbatim, with a two-function `auth`
compatibility shim whose `auth.uid()` returns NULL, and `anon`,
`authenticated` and `service_role` created as `NOLOGIN NOINHERIT` placeholders
so the `TO` clauses resolve.

The policies therefore **fail closed**: NULL never equals an owner column, so
every policy denies. They authorize nothing, and they are not pretending to.
What they buy is real:

- Any connection that is *not* the owner role, now or later, is denied by
  default rather than allowed by default. If the connection role is ever
  misconfigured, the failure is a denial rather than an exposure.
- The rules stay readable in the schema, which is where the next person will
  look for them.
- If a per-request identity ever becomes available, the policies are still
  there to be reactivated rather than reconstructed from git history.

Migrating them was also nearly free. Dropping them would have been work, and the
work would have been *removing a safety net*.

## Consequences

### Accepted costs

- **Authorization is now code, and code can be forgotten.** A new repository
  method that skips the sequence has nothing underneath it to catch the mistake.
  This is the real cost of the decision and there is no way to pay it down
  entirely. What reduces it: repository interfaces whose signatures make the
  wrong call unrepresentable (no id parameters), the affected-row check as a
  habit rather than a case-by-case judgement, and
  `lib/db/posts.authorization.test.ts` as the pattern for pinning it per domain.
- **A bug is now an exposure rather than a denial.** Under RLS, forgetting a
  check produced an empty result. Under application authorization, forgetting a
  check produces the row.
- **Reads and writes migrate on different schedules**, because reads of public
  projections need no authorization at all and writes need all of it. This is
  why `getDatabase().profiles` currently exposes one method, and why the
  profiles domain is read-only behind the adapter. See
  [profiles-domain-migration.md](profiles-domain-migration.md).

### What this makes possible

- Connection pooling and Hyperdrive, which per-user database roles would have
  ruled out.
- Authorization decisions that can be tested without a database, in
  milliseconds, at the point where they are made.
- Authorization rules that can say *why* something was refused, which an RLS
  policy structurally cannot.

## Alternatives considered

**Set the claims per request** (`set_config('request.jwt.claims', ...)` before
each statement, so `auth.uid()` keeps working). Rejected: it requires a
transaction or a dedicated connection per request to be safe, which defeats
pooling; a leaked setting between pooled requests authorizes one member as
another; and it keeps 151 policies as the primary control while making their
correctness depend on application code remembering to set a variable. That is
the worst of both models, not the best.

**Per-user database roles.** Rejected: incompatible with connection pooling at
any useful scale, and a role-per-member schema that grows with signups is an
operational problem rather than a security model.

**Drop RLS entirely once the application authorizes.** Rejected: see part 4. The
policies cost nothing to keep and fail closed. Removing a default-deny layer
because a different layer now also denies is trading a real margin for tidiness.

**A single `authorize()` middleware in front of every query.** Rejected as the
*primary* mechanism: it centralises the check away from the statement, and the
gap between "the check passed" and "this is the statement that ran" is exactly
where authorization bugs live. The sequence in part 1 keeps the decision and the
statement in the same function.

## Status of implementation

| Part | State |
|---|---|
| RLS migrated verbatim, failing closed | done (Phase 3) |
| `auth` shim, placeholder roles | done (Phase 3) |
| Column allowlist in the application, default-deny | done (Phase 2), profiles only |
| Identity never a parameter | done for profile writes; enforced by review elsewhere |
| Reads behind `lib/db` | posts and profiles (Phases 1 and 4) |
| Writes behind `lib/db` | **not started, deliberately** |
| Affected-row check as a repository rule | pattern established, not yet universal |
| Session identity the PostgreSQL adapter can verify | blocked on Better Auth |

The last row blocks the two above it. Until a session is issued and verified by
something the PostgreSQL adapter can read, a write against Neon would have to
trust an id the caller supplied, which is the shape of the bug this decision
exists to prevent.

## See also

- [auth-and-rls-migration.md](auth-and-rls-migration.md): the inventory this
  decision was made from, including the `auth.users` foreign keys, the RLS
  classification and the connection-role requirements.
- [rpc-identity-migration.md](rpc-identity-migration.md): the same problem for
  `SECURITY DEFINER` functions that call `auth.uid()` internally.
- [profiles-domain-migration.md](profiles-domain-migration.md): the read/write
  split as it currently stands for one domain.
