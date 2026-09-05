# Author Subscriptions and Publication Delivery V1 — release gate

Last updated: 2026-07-29.

## Current state

The application implementation is feature-gated by:

```text
NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED
```

Only the exact value `1` enables relationship RPC calls, subscription-table
queries, delivery workers, tracked redirects, author funnel reporting, and
subscription UI. Keep it unset or set to `0` for the initial code deployment.

The database SQL is intentionally stored at:

```text
supabase/pending/author_subscriptions_publication_delivery_v1.sql
```

It is not in `supabase/migrations`, so routine Supabase tooling will not apply
it.

## Blocking probes

Do not promote or apply the SQL candidate until this is read from the live
database:

1. ~~The exact deployed `notifications_type_check` definition and stored
   types.~~ **Resolved 2026-07-29**, then changed again by the Debate removal.
   See below.

The Debate probes that used to sit here are closed. The subsystem was removed
from the application and from the schema, so there is no V2 ledger row, catalog
fingerprint, RPC body or notification cron left to reconcile.

### Probe result (2026-07-29, superseded 2026-09-06)

`pg_get_constraintdef` was read from the live database via the dashboard SQL
editor. The deployed `notifications_type_check` allows exactly thirty types and
matches `supabase/migrations/20260728000001_debate_v1_5_foundation.sql`
character for character, including order. `author_published` is absent, as
expected.

Two consequences:

- The V1.5 foundation migration had reached this database. Files and deployed
  constraint agreed on this object at the time.
- The candidate no longer appends `author_published` to whatever it finds. It
  restates the full list, matching how every migration that touches this
  constraint already behaves. Appending would have left `author_published`
  living only in the database, and the next migration to rewrite the constraint
  — copied from a file, as they all are — would have silently dropped it,
  disabling in-app publication delivery with no error surface. A drift guard
  raises if the deployed list ever contains a type the file would remove.

**Superseded on 2026-09-06.** `20260906000004_remove_debate_schema` narrows the
deployed constraint by removing the ten `debate*` types, and the candidate's
list was updated to match. The count is no longer thirty-one. Re-run the probe
against the target database before promoting: the drift guard is what turns a
stale list into a failed apply rather than a silent data loss.

This workspace had a Supabase REST URL and service-role key, but no Supabase
CLI project link, Postgres connection string, connected database query tool, or
existing read-only SQL RPC on 2026-07-29. PostgREST cannot expose the required
`supabase_migrations`, `pg_proc`, and `pg_constraint` probes, and it cannot
inspect Vercel cron history. The live probe therefore remains unresolved. Do
not infer it from repository migration files.

## Promotion and staging sequence

1. Reconcile any migration-ledger/catalog disagreement before running a
   database push.
2. Re-run the probe query against the target database. The candidate's drift
   guard will refuse to apply if that database allows a type the file omits.
3. Copy the reviewed SQL candidate into `supabase/migrations` with a timestamp
   later than `20260906000004_remove_debate_schema`.
4. Apply that one reviewed migration to staging.
5. Refresh PostgREST's schema cache and verify all new RPC signatures.
6. Keep the feature flag off while checking tables, constraints, RLS, grants,
   trigger behavior, claim leases, and retry limits.
7. Use four staging accounts: primary author, subscriber, accepted co-author,
   and blocked user.
8. Subscribe the reader to both credited authors and publish one Post, one
   Article, and one accepted Research item.
9. Confirm one recipient/channel delivery, in-app-only Post delivery,
   Article/Research email and push policy, blocked-pair exclusion, tracked
   open/view/read attribution, and author-safe funnel counts.
10. Enable the flag in staging, complete the browser walkthrough, then repeat
    the migration verification and controlled enablement in production.

## Recovery behavior

No new Vercel cron is added. Immediate work is registered with Next.js
`after()` from all three publication paths. Durable retry recovery runs at the
start of the existing daily-brief cron, before brief content early returns.
Daily-brief dry-run mode does not disable publication recovery.

Publication success is independent of scheduling and fan-out. If immediate
scheduling or a provider fails, the database event stays retryable. The worker
uses bounded service-role claims, renewable leases, and at most five delivery
attempts.
