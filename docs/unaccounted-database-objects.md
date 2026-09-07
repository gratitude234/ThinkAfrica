# Database objects the application never names

Phase 4, step 18. Three objects turned up in the Phase 3 catalogue dump that no
line of application code references. Each is classified **KEEP**, **DEFER** or
**REMOVE LATER**, with the evidence.

All three were migrated to the Neon scratch database verbatim, because Phase 3's
job was a faithful copy and deciding what to drop is a different decision from
deciding how to copy. Nothing here has been dropped from production, and nothing
should be dropped from production as part of the migration.

## Method

The catalogue is authoritative, not the repository. Phase 2 inferred migration
state from files in `supabase/pending/` and got it wrong: four of five were
already applied. So each object below was checked three ways:

1. `grep` for the name across `app/`, `lib/` and `components/`.
2. `pg_dump` output in `scripts/migration/out/schema.neon.sql`, for the
   definition and for what else references it.
3. A read-only probe against production Supabase: a row count per table, and one
   deliberately invalid RPC call.

No writes, no DDL.

## `public.content_reports` — REMOVE LATER

| | |
|---|---|
| Rows in production | 0 |
| Application references | none |
| Superseded by | `public.reports` |

Two reporting tables exist. The application writes to `public.reports`
(`components/moderation/reportActions.ts:76`), and `content_reports` is the
earlier design that was replaced rather than dropped.

They are not equivalent, which is how you can tell which is current.
`content_reports` has `content_type` in `('post','comment','debate_argument')`
and a bare `content_id` with no foreign key: nothing constrains that id to
point at a row of the type named beside it. `reports` replaced it with three
nullable typed columns and a `CHECK` that exactly one is populated and matches
`target_type`, plus `resolved_by`, `resolved_at` and `resolution_action` for
the moderation queue. `debate_argument` is a content type the product no longer
has.

**Why not now:** it is empty and inert, so it costs nothing to carry, and a
migration is the wrong time to also be deleting tables. Dropping it changes
production schema for no migration benefit and adds one more difference between
the two databases while they are being compared.

**When:** after the cutover, as ordinary cleanup. It has no dependents: no
foreign keys point at it, and `reports` does not reference it.

## `public.post_views` — REMOVE LATER

| | |
|---|---|
| Rows in production | 0 |
| Application references | none |
| Superseded by | `posts.view_count` and `record_post_engagement()` |

```sql
CREATE TABLE public.post_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid,
    viewer_id uuid,
    viewed_at timestamp with time zone DEFAULT now(),
    session_id text
);
```

A per-view event log that was never wired up. Note what it lacks: no primary key
constraint listed beyond the column default, no foreign keys, no index on
`post_id`. It is a sketch, not a table that was in service and then retired.

View counting is done instead by `record_post_engagement()`, called from
`lib/postEngagementServer.ts:383`, which increments the counters on `posts`
directly. That is a different design decision, not an implementation of this
table: counters, not events.

**Why not now:** same as above. It is empty, nothing points at it, and it is
carrying no risk.

**Worth saying plainly:** if per-view analytics are ever wanted, this table is
not a head start. Anything built then should be designed against the question
being asked, and a `post_id` with no foreign key and no index is not that.

## `private.provision_personal_workspace_impl(text)` — REMOVE LATER, and it is already broken

| | |
|---|---|
| Application references | none |
| Public wrapper | `public.provision_personal_workspace(text)` |
| Tables it operates on | `public.firms`, `public.firm_memberships` |
| Do those tables exist? | **No** |

This is the one worth reading carefully.

The function is `SECURITY DEFINER`, `SET search_path TO ''`, and reads
`auth.uid()`. It reads and writes `public.firm_memberships` and `public.firms`,
serialising on a `SELECT ... FOR UPDATE` of the caller's `profiles` row so two
simultaneous logins cannot create two workspaces. It is careful, competent code.

**Neither table exists.** `public.firms` and `public.firm_memberships` appear
exactly four times in the entire schema dump, all four inside this function's
body. There is no `CREATE TABLE` for either, in the dump or anywhere in
`supabase/`. A `SELECT` against them through PostgREST finds nothing to query.

So the function cannot succeed. `plpgsql` resolves table names at execution
rather than at definition, so it was accepted by the database and would fail at
its first statement that touches a missing relation. It has presumably never
been called: an authenticated caller would get a raw `relation ... does not
exist` back.

A probe with an empty firm name returned `permission denied for schema private`,
which tells us something separate and mildly reassuring: the `public` wrapper is
`LANGUAGE sql` and **not** `SECURITY DEFINER`, so the caller's own privileges
apply to reaching `private`, and `service_role` does not have `USAGE` on that
schema. The wrapper is unreachable in practice as well as broken in principle.

**Classification: REMOVE LATER**, and it is the one of the three with an actual
argument for removing it rather than just an absence of an argument for keeping
it:

- It is a `SECURITY DEFINER` function that reads `auth.uid()`, which is the
  exact category `docs/rpc-identity-migration.md` is about. Leaving a dead one
  in the catalogue means the next person auditing that category has to work out
  from scratch that it is dead. This document is that work, done once.
- On Neon `auth.uid()` returns NULL, so it now fails one statement earlier,
  at `raise exception 'UNAUTHENTICATED'`. Failing closed, but for a reason that
  has nothing to do with why it was already broken, which is the kind of
  coincidence that makes a later audit harder rather than easier.

**Why not now:** dropping a `SECURITY DEFINER` function is a production schema
change, and the DO NOT list for this phase forbids DDL against production
Supabase. It is also not urgent: unreachable and non-functional is not the same
as dangerous.

**When:** with the same cleanup pass as the two tables, and drop the public
wrapper in the same statement.

## What this changes about the migration

Nothing operationally. All three objects are inert in both databases.

One thing about the RPC inventory: `docs/rpc-identity-migration.md` tracks 22
`auth.uid()`-dependent functions, and `provision_personal_workspace` is not one
of them. That omission was correct but undocumented, which is the same as
accidental. This is the record of why it stays out: it needs a delete, not an
identity migration, and adding it to that list would overstate what remains.

## Not investigated here

`public.reports` is empty too (0 rows), but it is the current table with live
application code writing to it. An empty table is not an unused one when the
feature it backs is new.
