# Debate deployment state — Phase 0

Answers the five Phase 0 questions in `docs/debate-v1.5-build-spec.md` Part 8.

**Status: SQL not yet run.** This document is in two halves.

- **Part A — Static findings.** Derived by reading `supabase/migrations/*.sql`,
  `vercel.json` and `app/api/cron/*` in this repo. These are facts about the
  *files*, not about the database. They are already reliable and are what makes
  the probes in Part B short.
- **Part B — Probes.** Copy/paste SQL. Run each block against **staging** and
  then **production** and paste the output into the result tables. Until those
  tables are filled in, every "Answer" line reads `UNKNOWN`.

No claim anywhere in this document is sourced from another file in `docs/`.
Per the spec, those may be wrong.

---

## Part A — Static findings

### A1. Fingerprints: what each V2 migration uniquely creates

Each of the five migrations leaves at least one object that no other migration
creates. Presence of the fingerprint is direct evidence the file ran, whatever
the migration ledger says.

| Migration | Unique fingerprint object(s) |
|---|---|
| `20260718000002_debate_v2_foundation` | column `debates.format_version`; tables `debate_memberships`, `debate_rounds`, `debate_argument_sources`, `debate_reactions`, `debate_ballots`, `debate_subscriptions`, `debate_moderation_events`; function `debates_guard_format_version()`; columns `debate_arguments.round_id / parent_argument_id / relation_type / entry_type / claim / edited_at / metadata` |
| `20260718000003_debate_v2_lifecycle_permissions` | column `debates.closure_kind`; policy named **`V1 moderators can update their own V1 debates`** on `debates`; functions `can_manage_debate_v2`, `count_words_v2`, `activate_debate_v2`, `close_debate_v2`, `advance_due_debate_rounds_v2`, `get_debate_ballot_results_v2`, `is_editor_or_admin`, `log_debate_moderation_event`, `extend_debate_round_v2` |
| `20260721000001_debate_v2_room_signal` | function `get_debate_room_signal_v2(uuid)` — **but see A2** |
| `20260721000002_debate_v2_cross_examination` | table `debate_cross_exchanges`; functions `submit_cross_examination_question_v2`, `submit_cross_examination_answer_v2` |
| `20260721000003_debate_v2_subscriptions_notifications` | table `debate_notification_events`; column `debate_subscriptions.is_subscribed`; function `process_debate_notification_events_v2`; `notifications_type_check` containing `'debate_v2_round_change'` |

### A2. Two migrations redefine each other's objects — order of checks matters

- `20260721000002` contains its **own** `CREATE OR REPLACE FUNCTION
  public.get_debate_room_signal_v2` (line 676), so the mere existence of that
  function does **not** prove `...0001` ran. Use `debate_cross_exchanges` to
  detect `...0002`, and treat `...0001` as "cannot be distinguished from
  `...0002` by object presence alone" — fall back to the ledger, or to
  `pg_get_functiondef` text comparison (probe B2c).
- `20260721000003` re-defines nine functions first created in `...0003`/`...0002`
  (`join_debate_v2`, `cast_debate_ballot_v2`, `start_debate_round_one_v2`,
  `advance_or_close_debate_round_v2`, `submit_debate_argument_v2`,
  `toggle_debate_reaction_v2`, `submit_cross_examination_question_v2`,
  `submit_cross_examination_answer_v2`, `set_debate_subscription_v2`).

### A3. `20260718000003` rewrites six **live V1** functions

This is the single most consequential static finding for Phase 1.

`20260718000003_debate_v2_lifecycle_permissions.sql` does not only add V2
objects. It issues `CREATE OR REPLACE FUNCTION` for all six current V1 debate
RPCs:

`join_debate`, `cast_motion_vote`, `toggle_debate_vote`, `start_debate`,
`advance_debate_phase`, `close_debate`.

Consequence: **whether Phase 1 has anything to fix is itself a Phase 0
question.** If this migration is applied, the three defects Phase 1 targets
(missing `REVOKE`/`GRANT`, `toggle_debate_vote`'s absent debate check,
`close_debate`'s null-moderator false positive) may already be fixed in
production. Probe B4 reads the deployed function bodies so you can tell.

### A4. `20260718000003` also rewrites the RLS policies Phases 1 and 2 target

Two policies the spec assumes are in a known state are changed by this V2
migration:

1. **`debates` UPDATE policy.** The migration drops
   `"Moderators can update their debates"` and replaces it with
   `"V1 moderators can update their own V1 debates"`, which has both `USING`
   and `WITH CHECK` — i.e. it already does most of Phase 1 item 1. Its
   predicate is `auth.uid() = moderator_id AND format_version = 1`, so it only
   works if `20260718000002` also ran.

   > **Phase 1 impact.** Its prompt says "Replace the *Moderators can update
   > their debates* policy". If `...0003` is applied, that policy name does not
   > exist and a `DROP POLICY IF EXISTS` on it is a silent no-op — the fix
   > would appear to succeed while changing nothing. Phase 1 must target
   > whichever name probe B5 actually finds. The V2 version still lacks the
   > lifecycle-column trigger Phase 1 asks for, so that part is needed either way.

2. **`debate_arguments` INSERT policy.** The migration drops and re-creates
   `"Authenticated users can submit arguments"`, adding `AND format_version = 1`
   to the `debates` existence subquery.

   > **Phase 2 impact.** The spec (Part 4) says to reproduce the current policy
   > "from `20260704000001_trust_safety_v1.sql`". That is correct **only if
   > `...0003` is unapplied**. If it is applied, copying the `20260704000001`
   > text would silently *revert* the `format_version = 1` guard while adding
   > the `format = 'legacy'` one. Probe B5 returns the deployed text — Phase 2
   > must build on that, not on any file.

`20260501000001_debate_v1_polish.sql` and `20260423000012_debate_participants.sql`
also redefined this policy earlier; `20260704000001` is the latest **non-V2**
version. The full chain is: `20260402000000` → `20260423000012` →
`20260501000001` → `20260704000001` → `20260718000003`.

### A5. `notifications_type_check` — the full chain

Seven migrations touch this constraint. Reconstructed in timestamp order:

| Migration | Values after it runs |
|---|---|
| `20260420193000_journal_system` | 15 base values |
| `20260423000003_response_posts` | + `response_post` (16) |
| `20260501000002_opportunity_hub_v1` | + `opportunity_inquiry` (17) |
| `20260704000001_trust_safety_v1` | + `moderation_post_removed`, `moderation_comment_hidden`, `account_suspended` (20) |
| `20260705000003_reviewer_removal_and_review_started_notice` | + `review_started` (21) |
| `20260706000001_review_reminder_tracking` | + `review_reminder` (22) |
| `20260721000003_debate_v2_subscriptions_notifications` | + `debate_v2_round_change`, `debate_v2_final_vote`, `debate_v2_direct_response`, `debate_v2_evidence_requested` (26) |

Nothing else in `supabase/` alters it.

So there are exactly **two candidate deployed definitions**:

- **Candidate N (no V2)** — 22 values, as at `20260706000001`:

  ```
  like, comment, follow, debate_reply, debate_argument, fellowship, badge,
  post_approved, post_rejected, post_published, review_assigned,
  review_started, review_reminder, revision_requested, co_author_invite,
  co_author_accepted, co_author_declined, response_post, opportunity_inquiry,
  moderation_post_removed, moderation_comment_hidden, account_suspended
  ```

- **Candidate V (with V2)** — Candidate N plus `debate_v2_round_change`,
  `debate_v2_final_vote`, `debate_v2_direct_response`,
  `debate_v2_evidence_requested` (26 values).

This makes the constraint itself an independent second fingerprint for
`20260721000003`. If probe B3 returns anything that is **neither** candidate,
something was applied outside the migration files and Phase 3 must be rebuilt
from the probe output verbatim.

### A6. The cron: three possible explanations, not two

`vercel.json` schedules exactly one debate cron:

```json
{ "path": "/api/cron/process-debate-notifications", "schedule": "0 10 * * *" }
```

`app/api/cron/process-debate-notifications/route.ts` calls
`admin.rpc("process_debate_notification_events_v2", { p_limit: 50 })`, which
exists only under `20260721000003`.

The spec frames this as a binary — either V2 is live, or the cron has errored
daily. There is a **third** case, and it is checked first because it is cheap:

```ts
const cronSecret = process.env.CRON_SECRET;
if (!cronSecret || auth !== `Bearer ${cronSecret}`) return 403;
```

If `CRON_SECRET` is unset in the Vercel production environment, the route
returns **403 before ever touching the database**. Vercel records that as a
non-2xx invocation. In that case the daily failure says nothing at all about
whether the V2 migrations are applied, and the cron log is not evidence either
way. Check the env var before reading the invocation logs (probe B6).

Also noted: `app/api/cron/advance-debate-rounds/route.ts` exists and calls
`advance_due_debate_rounds_v2`, but is **not** in `vercel.json`'s `crons`
array — it is unscheduled dead code, reachable only by a manual request with
the right bearer token. Phase 8 deletes it.

### A7. `20260718000002` is **not** safely re-runnable

It contains bare `CREATE POLICY` statements with no preceding
`DROP POLICY IF EXISTS` (e.g. `"Debate memberships are viewable by everyone"`,
line 171; likewise the SELECT policies on `debate_rounds`,
`debate_argument_sources`, `debate_reactions`, `debate_ballots`,
`debate_subscriptions`, `debate_moderation_events`).

This matters for one specific scenario: **objects present but ledger empty**,
which happens if someone pasted the SQL into the Supabase dashboard editor
instead of running `supabase db push`. A later `db push` would then try to
re-apply the file and abort at the first `CREATE POLICY` with
`42710 policy ... already exists`. The Supabase CLI runs each migration in a
transaction, so the partial migration rolls back — but the push fails and any
*later* pending migration (including a V1.5 one) never runs.

This is why probe B1 checks the ledger and probe B2 checks the catalog, and why
disagreement between them is a distinct outcome in the Q5 decision table.

---

## Part B — Probes

Run in the Supabase SQL editor (or `psql`) as an owner/service role. Run the
whole of Part B against **staging** first, then **production**, and keep the
two result sets separate.

### B1 — Migration ledger

```sql
select version, name
from supabase_migrations.schema_migrations
where version in (
  '20260718000002','20260718000003',
  '20260721000001','20260721000002','20260721000003'
)
order by version;
```

Context — the five newest recorded migrations, to see where the ledger stops:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version desc
limit 10;
```

And the full pending-set question — anything on disk not in the ledger:

```sql
-- Compare this output against `ls supabase/migrations/`.
select version
from supabase_migrations.schema_migrations
where version >= '20260704000001'
order by version;
```

### B2 — Catalog fingerprints (authoritative over the ledger)

**B2a — one row per migration, applied / not applied:**

```sql
with probe as (
  select
    to_regclass('public.debate_memberships')      is not null as t_memberships,
    to_regclass('public.debate_cross_exchanges')  is not null as t_cross,
    to_regclass('public.debate_notification_events') is not null as t_notif_events,
    exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='debates'
               and column_name='format_version')             as c_format_version,
    exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='debates'
               and column_name='closure_kind')               as c_closure_kind,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='can_manage_debate_v2') as f_can_manage,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='get_debate_room_signal_v2') as f_room_signal,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='process_debate_notification_events_v2') as f_process_notif
)
select '20260718000002_foundation'      as migration, (t_memberships and c_format_version) as applied from probe
union all select '20260718000003_lifecycle',   (c_closure_kind and f_can_manage)   from probe
union all select '20260721000001_room_signal', (f_room_signal)                     from probe
union all select '20260721000002_cross_exam',  (t_cross)                           from probe
union all select '20260721000003_subs_notif',  (t_notif_events and f_process_notif) from probe;
```

> `20260721000001_room_signal` reports true whenever `...0002` ran — see A2. If
> `...0002` is applied, treat that row as inconclusive and use B2c or B1.

**B2b — every V2 function actually present:**

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.proname like '%\_v2' or p.proname like 'debate%')
order by p.proname;
```

**B2c — disambiguate `...0001` from `...0002` by function body:**

```sql
-- The 20260721000002 rewrite of get_debate_room_signal_v2 references
-- cross-examination. If this returns false while the function exists,
-- only 20260721000001 ran.
select position('cross' in lower(pg_get_functiondef(p.oid))) > 0 as is_0002_version
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname='get_debate_room_signal_v2';
```

**B2d — do any V2 tables hold data?** (Decides whether Phase 8 is a file
deletion or a data migration.)

> Run this **only after B2a**, and delete the lines for any table B2a reported
> as absent — a `UNION ALL` over a missing relation fails the whole statement
> with `42P01 relation does not exist`.

```sql
select 'debate_memberships' t, count(*) from public.debate_memberships
union all select 'debate_rounds',            count(*) from public.debate_rounds
union all select 'debate_argument_sources',  count(*) from public.debate_argument_sources
union all select 'debate_reactions',         count(*) from public.debate_reactions
union all select 'debate_ballots',           count(*) from public.debate_ballots
union all select 'debate_subscriptions',     count(*) from public.debate_subscriptions
union all select 'debate_moderation_events', count(*) from public.debate_moderation_events
union all select 'debate_cross_exchanges',   count(*) from public.debate_cross_exchanges
union all select 'debate_notification_events', count(*) from public.debate_notification_events;
```

```sql
-- Any debate actually running as V2?
select format_version, status, current_phase, count(*)
from public.debates
group by 1,2,3
order by 1,2,3;
```

### B3 — True deployed `notifications_type_check`

```sql
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.notifications'::regclass
  and contype = 'c'
order by conname;
```

Extracted value list, easier to diff against A5:

```sql
-- One row per allowed value, in declaration order — easier to diff against A5.
-- (pg_get_constraintdef renders the list as ARRAY['like'::text, ...].)
select (regexp_matches(pg_get_constraintdef(oid), '''([a-z0-9_]+)''::text', 'g'))[1]
         as allowed_type
from pg_constraint
where conrelid = 'public.notifications'::regclass
  and conname = 'notifications_type_check';
```

```sql
-- Sanity: does live data already contain types the constraint forbids?
select distinct type from public.notifications order by 1;
```

### B4 — Deployed V1 RPC bodies and grants (decides Phase 1's scope)

```sql
select p.proname,
       p.prosecdef                                as security_definer,
       array_to_string(p.proconfig, ', ')         as config,
       pg_get_userbyid(p.proowner)                as owner,
       coalesce(array_to_string(p.proacl::text[], ' | '), 'NULL (= default PUBLIC EXECUTE)') as acl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public'
  and p.proname in ('join_debate','cast_motion_vote','toggle_debate_vote',
                    'start_debate','advance_debate_phase','close_debate')
order by p.proname;
```

> `acl` = `NULL (= default PUBLIC EXECUTE)` means Phase 1 item 2 is still
> needed for that function: anon can call it. Any explicit ACL listing
> `=X/postgres` only, plus `authenticated=X/...`, means it is already fixed.

```sql
-- Does the deployed toggle_debate_vote check the debate exists / is open?
-- (Phase 1 item 3.)
select pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='toggle_debate_vote';

-- Does the deployed close_debate still raise on a NULL moderator_id?
-- (Phase 1 item 4.)
select pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='close_debate';
```

```sql
-- Any debate that close_debate's NULL-moderator bug would strand:
select count(*) from public.debates where moderator_id is null and status <> 'closed';
```

### B5 — Deployed RLS policies on the four debate tables

```sql
select tablename, policyname, cmd,
       coalesce(qual, '-')       as using_expr,
       coalesce(with_check, '-') as with_check_expr
from pg_policies
where schemaname='public'
  and tablename in ('debates','debate_arguments','debate_participants',
                    'debate_motion_votes','debate_votes')
order by tablename, cmd, policyname;
```

Record verbatim. Phase 2's rewritten policies must be built from this output,
not from any migration file (A4).

### B6 — Cron health

Not SQL. In the Vercel dashboard, for the **production** project:

1. **Settings → Environment Variables** — is `CRON_SECRET` set for the
   Production environment? Record yes/no. If **no**, the cron returns 403
   before reaching the database and its failures prove nothing about the
   migrations (A6).
2. **Cron Jobs** (or Observability → Logs, filtered to
   `/api/cron/process-debate-notifications`) — status code and response body of
   the last few daily invocations. Record the most recent status and message.

Expected signatures:

| Observed | Means |
|---|---|
| `403 {"error":"Forbidden"}` | `CRON_SECRET` missing/mismatched. Says nothing about migrations. |
| `500 {"error":"Could not find the function public.process_debate_notification_events_v2 ..."}` | `20260721000003` is **not** applied to production. |
| `200 {"processed":0,...}` | `20260721000003` **is** applied. |

---

## Part C — Results

> Fill in from Part B. Leave `UNKNOWN` where not yet run.

### Q1. Which of the five V2 migrations are applied?

| Migration | Ledger (B1) | Catalog (B2) | Staging | Production |
|---|---|---|---|---|
| `20260718000002_debate_v2_foundation` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| `20260718000003_debate_v2_lifecycle_permissions` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| `20260721000001_debate_v2_room_signal` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| `20260721000002_debate_v2_cross_examination` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| `20260721000003_debate_v2_subscriptions_notifications` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

**Answer: UNKNOWN.**

### Q2. Does `public.debates.format_version` exist?

Staging: UNKNOWN. Production: UNKNOWN.
Any rows with `format_version = 2`: UNKNOWN (B2d).

**Answer: UNKNOWN.**

### Q3. True deployed `notifications_type_check`

Paste B3 output here verbatim:

```
UNKNOWN
```

Matches Candidate N (22) / Candidate V (26) / neither: **UNKNOWN**.

**Answer: UNKNOWN.** Phase 3 must append the four new V1.5 types
(`debate_invitation`, `debate_invitation_response`, `debate_phase_advanced`,
`debate_cancelled`) to *this* list, whatever it turns out to be.

### Q4. Is the debate-notifications cron succeeding?

`CRON_SECRET` set in production: UNKNOWN.
Last invocation status / body: UNKNOWN.
Interpretation per A6 table: UNKNOWN.

**Answer: UNKNOWN.**

### Q5. Safe order of operations for a new migration

Once Q1 is answered, read the matching row. All five V2 files carry timestamps
(`20260718*`, `20260721*`) earlier than any new V1.5 migration, so a routine
`supabase db push` applies pending V2 files **first**.

| Q1 outcome | Safe order |
|---|---|
| **None applied**, ledger agrees | Do Phase 8's *file deletion* **before** Phase 2. Delete the five V2 files and the V2 app code first; then the ordering hazard cannot occur, because there is nothing pending ahead of the new migration. Phase 2 then reproduces the `20260704000001` policy text as the spec says, and adds no `format_version` reference (the column will not exist). |
| **All five applied**, ledger agrees | No ordering hazard — nothing is pending, and the new timestamp sorts last. But: Phase 2 must reproduce the **`20260718000003`** policy text (keeping `AND format_version = 1`), Phase 3 must extend **Candidate V**, and Phase 1's items 1–4 are likely already fixed — re-scope it from B4/B5 rather than writing the migration blind. Phase 8 becomes a database change: write the drop plan, do not drop. |
| **Partially applied** (any subset) | Worst case. Do **not** push anything until each missing file is dealt with individually: either apply it deliberately, or delete it and hand-write a targeted migration for whatever the applied ones left behind. Note `20260718000003` depends on `format_version` from `...0002`, and `...0003`'s `notifications_type_check` rebuild depends on `...0006`'s version. |
| **Ledger and catalog disagree** (objects exist, ledger empty — dashboard-applied) | Do **not** run `supabase db push` at all until reconciled. `20260718000002` is not re-runnable (A7) and the push will abort, blocking every later migration. Reconcile with `supabase migration repair --status applied <version>` for each version whose objects are present, re-run B1, and only then proceed. |

**Answer: UNKNOWN** until Q1 is filled in.

---

## Part D — Corrections to the build spec that Phase 0 already forces

These hold regardless of what the probes return, and should be applied to
`docs/debate-v1.5-build-spec.md` before Phases 1–3 run.

1. **Part 4, "Closing the direct-write bypass"** tells Phase 2 to reproduce the
   `debate_arguments` INSERT policy "from `20260704000001_trust_safety_v1.sql`".
   That file is the latest *non-V2* definition only. `20260718000003` redefines
   it (A4). Phase 2 must copy from probe B5's output.
2. **Phase 1 item 1** names the policy `"Moderators can update their debates"`.
   Under `20260718000003` that name no longer exists — it is
   `"V1 moderators can update their own V1 debates"` (A4). A `DROP ... IF
   EXISTS` on the old name would be a silent no-op.
3. **Phase 1 items 2–4** may already be done in production. `20260718000003`
   rewrites all six V1 RPCs (A3). Re-scope from B4 before writing the migration.
4. **Part 2's framing of the cron as a binary is incomplete.** A missing
   `CRON_SECRET` produces a daily 403 that never reaches the database (A6).
5. **`app/api/cron/advance-debate-rounds/`** is not in `vercel.json` and is
   never invoked (A6). The spec's Phase 8 correctly deletes it; worth knowing it
   is already inert.
6. **The V1.5 `format` column and V2's `format_version` column can coexist**,
   but note `debates_guard_format_version()` is a `BEFORE INSERT OR UPDATE OF
   format_version` trigger that raises when `auth.role() = 'authenticated'`. A
   `SECURITY DEFINER` `create_debate_v1_5` still runs with the caller's
   `auth.role()`, so it must never write `format_version` explicitly. Omitting
   the column entirely (letting the `DEFAULT 1` apply) is safe — the trigger's
   `INSERT` branch only fires when a non-1 value is supplied.
