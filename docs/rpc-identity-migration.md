# The auth.uid() RPC migration

Twenty-two database functions are called directly by application code and
derive the acting member from `auth.uid()`. This is how they stop doing that,
which of them have been done, and why the rest have not.

Status: **9 of 22 parameterised in SQL, 0 switched over.** Six in Phase 2,
three more in Phase 4. Both migrations are written and unapplied; no caller
sends `p_user_id` yet.

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


### Parameterised in `20260910000001_parameterize_identity_rpcs_group2.sql` (3)

| Function | Domain | Callers today |
|---|---|---|
| `save_onboarding_identity` | Onboarding | `app/(onboarding)/onboarding/actions.ts` |
| `complete_onboarding` | Onboarding | `app/(onboarding)/onboarding/actions.ts` |
| `withdraw_post_submission` | Editorial | `app/(write)/write/deleteActions.ts` |

These three were deferred for reasons that were answerable rather than
permanent, and the answers were obtained before the SQL was written. That is
the whole content of this group: the port itself is mechanical.

**Which definition is live.** Read out of `pg_catalog` with
[read-function-defs.mjs](../scripts/migration/read-function-defs.mjs) and
compared against every candidate in `supabase/` with
[compare-function-defs.mjs](../scripts/migration/compare-function-defs.mjs),
on function bodies with comments and whitespace stripped:

| Function | Live definition | Stale |
|---|---|---|
| `save_onboarding_identity` | `20260824000003` | `20260824000001` |
| `complete_onboarding` | `20260824000001` | `20260815000002` |
| `withdraw_post_submission` | `20260720000001` | `20260722000001` |

Read the third row twice. The **later** migration is the stale one, so
"the most recent file wins" would have ported the wrong body. Onboarding
completion is now measured from a definition that is one file older than the
newest one naming it, and that is not an anomaly to be tidied up: it is what
the database says, and the database is the authority. This is the second time
in this migration that file-based inference was wrong, after Phase 2 inferred
four `supabase/pending/` migrations were unapplied when they were live.

**The `current_user` question.** Answered against a database rather than
reasoned about, by
[test-security-definer-frames.mjs](../scripts/migration/test-security-definer-frames.mjs),
with the function owner deliberately made a different role from the caller so
the probe can discriminate at all:

```
at the top level                    neondb_owner
inside a SECURITY DEFINER function  frame_probe_owner
through a SECURITY DEFINER wrapper  frame_probe_owner
through a plain wrapper             frame_probe_owner
```

A wrapper frame does not change what the inner function reads, for either
wrapper shape. So `withdraw_post_submission()` keeps bypassing
`guard_locked_post_write()` exactly as it does today. The highest-risk item on
the deferred list turned out to be safe, and it is worth saying that the test
was cheap: an hour of writing it against the scratch database replaced an
indefinite deferral.

**Both files were executed** against the Neon scratch database inside a
transaction that rolls back, by
[validate-migration.mjs](../scripts/migration/validate-migration.mjs). They
parse, they create exactly the expected seven signatures, and nothing was
applied anywhere. There is no local migration runner in this project, so a
file that has never been executed is a file nobody has proved parses.

One behaviour change to know about: the explicit `Authentication required.`
check at the top of each body is now `assert_identity_claim()`, which raises
`A user id is required.` with the same `42501`. The application never surfaces
an RPC's own message (`app/(onboarding)/onboarding/actions.ts` substitutes its
own copy), so this is visible only in server logs.


| Function | Why not yet |
|---|---|
| `get_my_profile_private` | Still called from the browser (`NotificationBell`, `OnboardingClient`). Parameterising it before those two move would create a signature nothing uses. Read-only, so the failure mode is an empty profile rather than a silent write. |
| `replace_my_featured_posts`, `replace_my_featured_posts_v2` | Two live versions behind `NEXT_PUBLIC_FEATURED_WORK_NOTES_ENABLED`. Parameterising a pair where only one is reachable doubles the surface for no gain until the flag is resolved. |
| `apply_post_edit_draft` | Publishing path. Same class of interaction with the post-lock triggers. |
| `submit_opportunity_outcome`, `dispute_opportunity_outcome`, `set_opportunity_outcome_visibility` | Gated by `NEXT_PUBLIC_CREDIBILITY_GRAPH_ENABLED`, which is off. Nothing calls them in production, so there is nothing to de-risk yet. |
| `set_topic_subscription` | Defined only in `supabase/pending/`. Not in the production database. |
| `create_research_collaboration_request` | Research is behind `FEATURE_FLAGS.research`, which is `false`. |
| `find_or_create_conversation` | Creates a conversation and both participant rows. Its argument is already `target_user_id`, so adding `p_user_id` changes a two-party function into one where the caller names both parties. Wants its own review. |
| `record_user_activity_day` | Called from the main layout on every signed-in page view. A change here touches every request; it is cheap to do and expensive to get wrong, so it goes in a group of its own. |
| `get_reader_affinity`, `get_viewer_post_engagement` | Reads, used for feed ranking. Called through `createAdminClient()` already, so they are the least urgent: a service-role caller has no `auth.uid()` today either. |

The pattern in the deferrals is deliberate, and group 2 shows what it is and
is not. The rule was never "avoid the hard ones". It is: **nothing is
parameterised on the strength of a body read out of a migration file, and
nothing is parameterised whose interaction with a trigger has been reasoned
about rather than tested.**

Group 2 did not relax that rule, it satisfied it. The bodies came out of the
catalogue, and the call-stack question was answered by running it. What remains
deferred is what still has an unanswered question or a caller that has not
moved, not what is difficult.

---

## 3a. A divergence found on the way: `guard_locked_post_write`

Not an RPC and not part of this migration, found while reading the catalogue
for `withdraw_post_submission`, and recorded here so it is not discovered a
third time.

**The trigger running in production matches neither version in `supabase/`.**
It is missing three checks that `20260720000001` defines. Fingerprinted by
the `RAISE EXCEPTION` messages in each body, which is a structural comparison
rather than a textual one:

| Check | In `20260720000001` | Live |
|---|---|---|
| `A submission awaiting review or in revision cannot change its classification.` | yes | **no** |
| `A submission awaiting review can only be changed by the editorial decision workflow.` | yes | **no** |
| `A submission in revision can only stay in revision or be resubmitted for review.` | yes | **no** |

They were not relocated. A catalogue-wide search for the message text finds
no function carrying it, and `public.posts` has ten triggers, none of which
is a second copy of this one.

So an author can currently reclassify their own submission while it sits in
review, and change its status outside the editorial decision workflow, in
ways the repository says are blocked. Restoring the checks is a separate
decision with its own migration, because "the file is newer than the database"
does not by itself establish which one is right: the checks may have been
removed deliberately and the migration file never updated.

### What this means for Neon

More than the divergence does, and it is the part that matters for the
migration rather than for the product.

`guard_locked_post_write()` opens with:

```sql
IF auth.role() IS DISTINCT FROM 'authenticated'
   OR current_user IS DISTINCT FROM 'authenticated' THEN
  RETURN COALESCE(NEW, OLD);   -- every check below is skipped
END IF;
```

On Neon the application connects as `indegenius_app`, never as the literal
role `authenticated`. `current_user` is therefore never `'authenticated'`,
the second disjunct is always true, and **the trigger bypasses every check on
every write**. Not some of them. All of them:

- self-publishing a research paper or policy brief as `published`
- writing `citation_id` or `published_version_id` directly
- editing an accepted publication that is supposed to be locked
- hard-deleting a post that is not a draft
- resurrecting a withdrawn submission back into `pending`
- modifying a post that moderation removed

This is a larger surface than the RLS policies, and unlike them it does not
fail closed. RLS on Neon denies because `auth.uid()` returns NULL and NULL
matches nothing. This trigger **allows** because its bypass condition is
written as an inequality, and an unrecognised role satisfies it.

**Every check in that trigger has to exist in the application before any
authenticated write to `posts` runs against Neon.** Not as a port of the
trigger, which would only reproduce a control that a future connection-role
change could disable the same way, but stated where the write is issued, in
the shape `docs/adr-neon-authorization.md` describes: look up the resource,
decide, then write, then check rows affected.

The `auth` shim cannot fix this. Making `auth.role()` return
`'authenticated'` would satisfy one disjunct and leave the other, and making
`current_user` read `'authenticated'` would mean connecting as a role named
that, which is a Supabase arrangement rather than a general one and would put
the application back inside RLS it has no way to satisfy.

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
