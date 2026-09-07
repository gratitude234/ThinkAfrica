# The auth.uid() RPC migration

Twenty-two database functions are called directly by application code and
derive the acting member from `auth.uid()`. This is how they stop doing that,
which of them have been done, and why the rest have not.

Phase 2 status: **6 of 22 parameterised in SQL, 0 switched over.** The
migration is written and unapplied; no caller sends `p_user_id` yet.

---

## 1. The problem, stated once

`auth.uid()` is defined as reading a claim PostgREST puts on the connection:

```sql
select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
```

On a database with no Supabase Auth and no PostgREST, that setting is never
present, so **`auth.uid()` returns NULL**. It does not error. It does not warn.

Which produces two failure modes, and the second is the dangerous one:

| Shape | What happens on Neon |
|---|---|
| `if auth.uid() is null then raise` | Every call raises. Loud, obvious, fixable. |
| `where user_id = auth.uid()` | Matches nothing. **Returns successfully.** The UI shows a saved state for a change that did not happen. |

All 22 currently use the first shape, so the immediate symptom would be
"everything is broken" rather than silent data loss. That is luck, not design:
a single function written the second way, or a single `update ... where` added
later, produces a change that reports success and does nothing.

---

## 2. The pattern

Each function gains an **overload** whose first argument is `p_user_id uuid`.
The body moves there. The original signature becomes a one-line wrapper.

```sql
-- The body, parameterised.
create or replace function public.save_onboarding_topics(
  p_user_id uuid,
  p_interests text[]
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_identity_claim(p_user_id);
begin
  ...
  update public.profiles set interests = p_interests where id = v_user_id;
  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;
end;
$$;

-- The original signature, unchanged for every existing caller.
create or replace function public.save_onboarding_topics(p_interests text[])
returns void language sql security definer set search_path = ''
as $$ select public.save_onboarding_topics((select auth.uid()), p_interests); $$;
```

Four properties this buys:

- **Additive.** PostgREST resolves an overload by the set of argument names in
  the request body, so a caller sending `{p_interests}` still reaches the old
  signature. The migration is deployable while every caller is unchanged.
- **One body.** A wrapper cannot drift from what it calls. Two copies of an
  authorization rule is worse than either copy.
- **A row-count check.** `if not found then raise` is added wherever it was
  missing. A write that matched nothing is now an error rather than a success,
  whichever identity source is in use.
- **A transitional guard.** `assert_identity_claim()` refuses a `p_user_id`
  that disagrees with `auth.uid()`, so granting the parameterised function to
  `authenticated` does not let a signed-in caller act as somebody else. A
  caller with no JWT (service role today, a direct connection later) is
  trusted, because that is what the parameter is for.

`assert_identity_claim()` and the wrappers are both removed by the cutover
migration, at which point the grant narrows to the application role.

---

## 3. Status of all 22

### Parameterised in `20260909000001_parameterize_identity_rpcs.sql` (6)

| Function | Domain | Callers today |
|---|---|---|
| `get_my_onboarding_state` | Onboarding | `OnboardingClient` (browser, read), 5 server modules |
| `save_onboarding_path` | Onboarding | `app/(onboarding)/onboarding/actions.ts` |
| `save_onboarding_preferences` | Onboarding | `app/(main)/settings/profileActions.ts` |
| `save_onboarding_topics` | Onboarding | `app/(onboarding)/onboarding/actions.ts` |
| `set_notification_preference` | Notifications | `app/(main)/settings/profileActions.ts` |
| `toggle_comment_vote` | Engagement | `app/(main)/post/[slug]/commentActions.ts` |

Chosen as three complete domains rather than six convenient functions: a
domain that is half parameterised is a domain nobody can reason about during
the cutover. Each body was read in full and ported statement by statement;
contracts are pinned by
[parameterizeIdentityRpcsMigration.test.ts](../supabase/migrations/parameterizeIdentityRpcsMigration.test.ts).

### Deferred, with reasons (16)

| Function | Why not yet |
|---|---|
| `save_onboarding_identity` | Redefined twice (`20260824000001`, then `20260824000003`). Porting it means being certain which definition is live, which needs the catalogue. It is the one onboarding function left, and it should go with the next group once `pg_get_functiondef` has been read off the database. |
| `complete_onboarding` | Same: redefined by `20260815000002` after `20260824000001`. It is also the longest of the 22, writes measurement fields guarded by their own trigger, and is the single most consequential function in the signup flow. Not a candidate for a port written from migration files. |
| `get_my_profile_private` | Still called from the browser (`NotificationBell`, `OnboardingClient`). Parameterising it before those two move would create a signature nothing uses. Read-only, so the failure mode is an empty profile rather than a silent write. |
| `replace_my_featured_posts`, `replace_my_featured_posts_v2` | Two live versions behind `NEXT_PUBLIC_FEATURED_WORK_NOTES_ENABLED`. Parameterising a pair where only one is reachable doubles the surface for no gain until the flag is resolved. |
| `withdraw_post_submission` | Interacts with `guard_locked_post_write`, which distinguishes a direct authenticated write from a `SECURITY DEFINER` one by comparing `current_user`. A wrapper adds a call frame; whether that changes `current_user` for the guard has to be tested against a database, not reasoned about. **The highest-risk one on this list.** |
| `apply_post_edit_draft` | Publishing path. Same class of interaction with the post-lock triggers. |
| `submit_opportunity_outcome`, `dispute_opportunity_outcome`, `set_opportunity_outcome_visibility` | Gated by `NEXT_PUBLIC_CREDIBILITY_GRAPH_ENABLED`, which is off. Nothing calls them in production, so there is nothing to de-risk yet. |
| `set_topic_subscription` | Defined only in `supabase/pending/`. Not in the production database. |
| `create_research_collaboration_request` | Research is behind `FEATURE_FLAGS.research`, which is `false`. |
| `find_or_create_conversation` | Creates a conversation and both participant rows. Its argument is already `target_user_id`, so adding `p_user_id` changes a two-party function into one where the caller names both parties. Wants its own review. |
| `record_user_activity_day` | Called from the main layout on every signed-in page view. A change here touches every request; it is cheap to do and expensive to get wrong, so it goes in a group of its own. |
| `get_reader_affinity`, `get_viewer_post_engagement` | Reads, used for feed ranking. Called through `createAdminClient()` already, so they are the least urgent: a service-role caller has no `auth.uid()` today either. |

The pattern in that table is deliberate: **nothing was parameterised that
could not be ported from a body read in full, and nothing was parameterised
that interacts with a trigger whose behaviour depends on the call stack.**
Those are exactly the cases where a rewrite that looks right is not.

---

## 4. Rollout, per function

The SQL and the switch-over are separate steps on purpose. Applying the
migration changes nothing; switching a caller before it is applied breaks that
caller immediately, because PostgREST answers an unknown signature with
`Could not find the function ... in the schema cache`.

1. **Apply the migration** to staging. Nothing changes: every caller still
   sends the old argument names.
2. **Verify the overloads exist** and that the old ones still work:
   ```sql
   select p.oid::regprocedure
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'save_onboarding_topics';
   -- expect two rows
   ```
3. **Exercise the old path** in staging: onboarding end to end, a notification
   switch, a comment upvote. All three must behave exactly as before.
4. **Switch one caller** to send `p_user_id`, taken from `requireViewer()` and
   never from an argument the client supplied. One caller, one deploy.
5. Repeat. When every caller of a function sends `p_user_id`, the wrapper is
   dead code and is dropped by the cutover migration, not before.

Step 4 is one line per call site, because Phase 2 already moved these calls
behind server actions where the viewer is resolved from the session:

```ts
// today
await supabase.rpc("save_onboarding_topics", { p_interests: interests });

// after the migration is applied and verified
await supabase.rpc("save_onboarding_topics", {
  p_user_id: viewer.userId,
  p_interests: interests,
});
```

`viewer.userId` comes from [lib/serverActions.ts](../lib/serverActions.ts)'s
`requireViewer()`, which reads the session. **A user id must never arrive as an
action argument**, which is the rule the whole of Phase 2's Track A exists to
establish.

---

## 5. The ordering rule

**A domain's RPCs are parameterised in the same release as, or before, that
domain leaves Supabase Auth. Never after.**

A function taking `p_user_id` while Supabase Auth is still live is fine: the
server passes `user.id` and `assert_identity_claim()` confirms it matches the
JWT. A function still calling `auth.uid()` after Better Auth is live is a
data-loss bug. So: parameterise first, cut over second.
