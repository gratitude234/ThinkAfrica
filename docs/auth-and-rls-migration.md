# Auth, RLS, and where authorization has to move

The identity and authorization half of the Neon migration. Read
[database-access-inventory.md](database-access-inventory.md) first for what
touches the database; this document is about who is allowed to.

Nothing here is implemented. No RLS policy has been dropped, no id has been
touched, and no `auth.uid()` has been replaced. This is the strategy that has
to exist before any of that is safe.

---

## 1. `auth.users`, and the id that everything hangs off

### The dependency is small, and that is the good news

Only **three** places in the schema reference `auth.users` by foreign key:

| Table | Column | Rule |
|---|---|---|
| `profiles` | `id` | `PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE` |
| `activation_events` | `user_id` | `REFERENCES auth.users(id) ON DELETE SET NULL` |
| `saved_opportunities` | `user_id` | `REFERENCES auth.users(id) ON DELETE CASCADE` |

Plus one trigger and one function:

| Object | What it does |
|---|---|
| `on_auth_user_created` on `auth.users` | `AFTER INSERT` → `public.handle_new_user()` |
| `public.handle_new_user()` | Derives a unique username from the email local part and inserts the `profiles` row with `new.id` |
| `public.list_broadcast_contact_emails()` | Reads `id, email` out of `auth.users` in SQL, for the Resend audience |

**Every other user-owned table - 112 foreign keys across the schema - references
`public.profiles(id)`, not `auth.users(id)`.** The application's user graph is
already anchored on a table we own.

### The ids are the same UUID, and they must stay that way

`profiles.id` is not a separate identifier. It is `auth.users.id`, copied by the
trigger at signup and never reassigned:

```sql
INSERT INTO public.profiles (id, username, full_name, university)
VALUES (new.id, final_username, ...)
ON CONFLICT (id) DO NOTHING;
```

From there the same UUID propagates outward:

```
auth.users.id
  └── profiles.id                     (same value, copied at signup)
        ├── posts.author_id
        ├── comments.author_id
        ├── likes.user_id
        ├── bookmarks.user_id
        ├── follows.follower_id / following_id
        ├── notifications.user_id / actor_id
        ├── messages.sender_id, conversation_participants.user_id
        ├── post_authors.user_id            (co-authorship)
        ├── post_reviews.reviewer_id, post_editor_decisions.editor_id
        ├── admin_audit_events.actor_id
        ├── user_blocks.blocker_id / blocked_id
        ├── push_subscriptions.user_id
        └── ... 112 foreign keys in total
```

Application code treats the two as interchangeable, and it is right to:
`supabase.auth.getUser()` returns `user.id`, and that value is used directly as
`profiles.id`, `posts.author_id`, and every `user_id` above.

**The migration requirement follows directly: Better Auth must adopt the
existing UUIDs as its user ids.** Not map them, not translate them at a
boundary. If Better Auth mints new ids, every one of those 112 foreign keys
either breaks or needs a backfill, and a backfill of ownership columns is the
single most destructive operation available in this codebase. Two consequences
worth stating now, before the auth phase starts:

- Better Auth's user table must be seeded from `auth.users` with `id`
  preserved, along with `email`, `email_confirmed_at` and `created_at`.
- **Password migration is officially supported but must be rehearsed against a
  database copy before production cutover.** Better Auth documents a Supabase
  migration path that preserves the existing user UUIDs and carries the
  Supabase bcrypt password hashes across, so no forced reset is required.
  Phase 2 recorded this as "portability unverified", which understated it: the
  support exists. What has to be established is that it works on *this*
  project's data, which means running it end to end against a copy and signing
  in as a real migrated account before anything touches production.

  This matters more than it sounds. Phase 3 measured **256 rows in
  `auth.users`**, and a password migration that silently produces unverifiable
  hashes locks all 256 out at once, at the moment of cutover, with no way back
  except a mass reset email.

- **Active sessions need their own cutover plan, and do not migrate.** A
  Supabase session is a JWT signed with the project's secret plus a refresh
  token in Supabase's own store. Better Auth issues its own sessions and cannot
  validate either. So at cutover every signed-in member is signed out unless
  something is done about it, and "something" is a product decision with three
  shapes:

  | Option | Cost |
  |---|---|
  | Accept the sign-out | Everyone re-authenticates once. Simplest, and visible to every user on the same day |
  | Dual-validate for a window | The new stack accepts a Supabase JWT until it expires, then issues its own. Needs the Supabase JWT secret in the new runtime and a hard end date |
  | Cut over during a quiet window | Reduces how many people notice; does not change what happens |

  None of these is chosen here. What Phase 3 records is that the choice exists
  and belongs to the auth phase, not to the database phase, and that the
  default if nobody decides is the first row.

### What replaces the signup trigger

`handle_new_user()` cannot survive: it fires on a table that will not exist.
The profile creation moves into the application's sign-up flow, inside the same
transaction that creates the user row. That is an improvement in one respect
(the username-collision loop becomes testable) and a regression in another (a
user created by any path that skips the application no longer gets a profile).
The Neon schema should therefore keep a `NOT NULL` constraint and a foreign key
from `profiles.id` to the Better Auth user table, so the missing profile is a
constraint violation rather than a silently broken account.

---

## 2. RLS inventory

**146 live policies across 64 tables**, reconstructed by replaying the
migrations in order with drops and dropped tables applied
(`node scripts/audit/rlsAudit.mjs`, output in `scripts/audit/rls-audit.json`).
Verify against `pg_policies` before acting on it.

95 policies call `auth.uid()`. 17 call `auth.role()`. None uses `auth.jwt()`.

| # | Class | Count | Example |
|---|---|---:|---|
| 1 | Public read | 23 | `profiles`: visible per privacy setting; `posts`: `status = 'published'` |
| 2 | Owner write/read | 72 | `bookmarks`, `push_subscriptions`, `post_revisions`: `auth.uid() = user_id` |
| 3 | Membership / access | 38 | `messages`, `conversation_participants`, `post_versions`, all `research_project_*` |
| 4 | Admin / moderator | 13 | `reports`, `comments` (moderation), `fellowships`, `admin_audit_events` |
| 5 | Provider / service role | 0 remaining as policies | The broadcast tables have **RLS on with no policies**, so only `service_role` reads them |
| 6 | Open write | 1 | `contact_requests`: `FOR INSERT WITH CHECK (true)` |

A single policy can span classes: `posts`'s SELECT policy is a public read, an
owner read and a reviewer-membership read in one expression. The classifier
reports the strongest class; `rls-audit.json` carries the policy body.

Several class-2 and class-3 policies delegate to `SECURITY DEFINER` helpers
rather than inlining the check: `is_post_owner()`, `is_post_reviewer()`,
`is_post_coauthor()`, `can_access_research_project()`,
`can_contribute_research_project()`. Those helpers are the best starting point
for the application-side equivalents, because the predicate is already written
once and named.

### What each class becomes

| Class | After Better Auth + server-side authorization |
|---|---|
| **1 Public read** | Becomes the default. A published post is readable by anyone, so the repository simply filters on `status = 'published'`. The risk is the *inverse*: a repository that forgets the filter now returns unpublished rows, where RLS would have refused. Every public read repository needs the status predicate in the SQL, not in the caller. |
| **2 Owner** | Becomes an explicit `where user_id = $viewerId` in the repository, plus a check before the mutation. This is the largest class and the most mechanical. The danger is that omitting the predicate produces a working query rather than an error. |
| **3 Membership** | Becomes a service-layer check that runs *before* the mutation: "is this viewer a participant in this conversation", "can this viewer access this research project". The existing `SECURITY DEFINER` helpers can be kept as database functions and called by the service layer, which is the lowest-risk translation because the predicate does not get rewritten at all. |
| **4 Admin** | Already exists in application code. [lib/adminAccess.ts](../lib/adminAccess.ts) has a capability model (`AdminContext`, `requireCapability`, 13 capabilities) that is stricter than the RLS policies it sits alongside. Admin routes should keep using it and stop relying on the policy as a second line. |
| **5 Provider** | Disappears with the provider. The broadcast tables' "RLS on, no policies" arrangement was a way of saying "server only"; after the migration every table is server-only, and the equivalent is that no repository for those tables is reachable from a browser-facing action. |
| **6 Open write** | `contact_requests` is a public unauthenticated insert. It must move behind a route handler that adds a rate limit, because PostgREST is currently the only thing between that form and unlimited inserts. |

### RLS is not being dropped in this phase, and probably not in the next one

Keeping RLS on in Neon costs nothing and buys a second gate for as long as the
connection role is not the table owner. The realistic sequence is:

1. Migrate the schema to Neon **with the policies intact**, rewritten so that
   `auth.uid()` reads from a session setting the application sets per
   transaction (`current_setting('app.user_id', true)::uuid`).
2. Migrate domains one at a time, with the application doing its own
   authorization, and RLS still underneath as a backstop.
3. Only consider dropping a policy once the domain above it has explicit
   checks *and* those checks have tests.

Step 1 is worth its cost precisely because of the failure mode described in §4:
an authorization check that silently passes is much worse than one that fails.

---

## 3. What the connection role must not be

A direct PostgreSQL connection carries a role, and that role is the whole
security boundary. Two rules for the Neon setup:

- **The application role must not own the tables and must not be superuser.**
  A table owner bypasses RLS regardless of policies, which would silently turn
  step 1 above into a no-op. Create a separate `indegenius_app` role with
  `GRANT SELECT, INSERT, UPDATE, DELETE` on `public`, and keep `NOLOGIN`
  ownership elsewhere.
- **Migrations use a different role and a different connection string.** DDL
  through the same pooled connection the application uses is how a schema
  change becomes an outage.

That is the reason [neon-migration-plan.md](neon-migration-plan.md) §6 lists
both `DATABASE_URL` and `DATABASE_URL_DIRECT`.

---

## 4. The `auth.uid()` problem, stated as bluntly as it deserves

105 database functions call `auth.uid()`. 22 of them are called directly by
application code as RPCs. `auth.uid()` is defined as reading a claim out of the
JWT that PostgREST puts on the connection:

```sql
select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
```

On a database with no Supabase Auth and no PostgREST, that setting is never
set, so **`auth.uid()` returns null**. It does not error. It does not warn.

Which means a function like this:

```sql
update public.profiles set positioning_statement = p_value
 where id = auth.uid();
```

does not fail after the migration. It updates zero rows, returns successfully,
and the UI shows a saved state for a change that did not happen. The same
shape, applied to a policy, makes the policy deny everything, which at least
fails visibly. Applied to a `SECURITY DEFINER` mutation, it fails invisibly.

### The required pattern

Every one of the 22 called RPCs takes the acting user as a parameter, supplied
by the server after it has authenticated the caller:

```sql
create or replace function public.save_onboarding_topics(
  p_user_id uuid,          -- was auth.uid()
  p_topics text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'save_onboarding_topics requires a user id';
  end if;
  ...
end;
$$;
```

The `raise exception` is not decoration. It is what converts the silent failure
into a loud one, and it should be in every rewritten function.

### The migration-order rule that follows

**A domain's RPCs must be rewritten in the same change that moves that domain
off Supabase Auth, never before and never after.** A function that takes
`p_user_id` while Supabase Auth is still live is fine (the server passes
`user.id`). A function that still calls `auth.uid()` after Better Auth is live
is a data-loss bug. So: parameterise first, cut over second.

---

## 5. Security review: what changes at the boundary

Today, an unauthorized mutation is refused twice. Once by the application, if
it happens to check, and once by RLS, always. After the migration only the
first of those exists.

The concrete risk is not abstract. Of 183 write sites, **20 are in the browser
with RLS as the only gate**, and a large share of the server-side writes
currently rely on the policy rather than an explicit check, because the policy
was there and the check was redundant. Porting those queries verbatim to a
service-role connection converts "RLS blocks unauthorized mutation" into "any
server endpoint can update anything".

### The rule for every migrated write

Before any SQL mutation, in this order:

1. **Authenticated?** Resolve the viewer. No viewer, no write. Not `?? null`,
   not "assume the middleware did it".
2. **Owns the resource?** Load the row's owner and compare, or make ownership
   part of the `where` clause so a mismatch updates zero rows *and the caller
   checks the row count*. An `UPDATE ... WHERE id = $1 AND author_id = $2` that
   nobody checks the result of is the same silent failure as §4.
3. **Role permits it?** Through `lib/adminAccess.ts`'s capability model, not an
   ad-hoc `role === "admin"`.
4. **Business rules?** Status transitions in
   [lib/reviewWorkflow.ts](../lib/reviewWorkflow.ts), publish gates, word-count
   minimums, block relationships.

### Structural defences worth building before they are needed

- **Repositories that mutate take the viewer id as a required argument.** Not
  optional, not defaulted. A repository method that cannot be called without an
  actor is a repository method that cannot forget one.
- **Keep the ownership predicate in the SQL as well as in the check.** Belt and
  braces is exactly what is being lost; put some of it back where it is cheap.
- **`server-only` on every repository module.** `lib/db` already imports it.
  That import is what turns "a client component imported the database layer"
  from a runtime data leak into a build failure.
- **A test per migrated domain that asserts the check exists.**
  [lib/db/posts.authorization.test.ts](../lib/db/posts.authorization.test.ts)
  is the template: it reads the route and fails if a status the lookup can
  return is not gated. It is deliberately derived from
  `VISIBLE_POST_STATUSES` rather than hardcoded, so widening the lookup without
  widening the gate fails the build.

### The specific hole the proof of concept already had to close

`getPostBySlug` resolves `draft`, `pending` and `pending_revision` as well as
`published`. Under PostgREST, a stranger asking for someone's draft gets
nothing back, because the `posts` SELECT policy filters it out before the route
sees it; the route's own `if (post.status === "draft" && user?.id !== post.author_id) notFound()`
is a second opinion.

Under a direct connection the row comes back, and that `if` becomes the only
thing preventing an unpublished manuscript from being rendered. It is correct
today, in both `PostPage()` and `generateMetadata()`. It is now pinned by a
test so that it stays correct, and the same audit has to be done for every
domain before its adapter is switched.
