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

Do not promote or apply the SQL candidate until every staging and production
result in `docs/debate-deployment-state.md` is filled from the live database
and Vercel:

1. Debate V2 migration-ledger rows.
2. Debate V2 catalog fingerprints and any V2 data.
3. ~~The exact deployed `notifications_type_check` definition and stored
   types.~~ **Resolved 2026-07-29** — see below.
4. Legacy debate RPC bodies, grants, and RLS policies.
5. Debate notification cron health and production `CRON_SECRET` presence.

### Probe 3 result (2026-07-29)

`pg_get_constraintdef` was read from the live database via the dashboard SQL
editor. The deployed `notifications_type_check` allows exactly thirty types and
matches `supabase/migrations/20260728000001_debate_v1_5_foundation.sql`
character for character, including order. `author_published` is absent, as
expected.

Two consequences:

- The V1.5 debate foundation migration has reached this database. Files and
  deployed constraint agree on this object; no reconciliation is needed for it.
- The candidate no longer appends `author_published` to whatever it finds. It
  now restates the full thirty-one-type list, matching how all eight migrations
  that touch this constraint already behave. Appending would have left
  `author_published` living only in the database, and the next debate migration
  — copied from a file, as they all are — would have silently dropped it,
  disabling in-app publication delivery with no error surface. A drift guard
  raises if the deployed list ever contains a type the file would remove.

Probes 1, 2, 4 and 5 remain open. None of them gate this feature specifically;
they were bundled in as caution while probe 3 was unknown.

This workspace had a Supabase REST URL and service-role key, but no Supabase
CLI project link, Postgres connection string, connected database query tool, or
existing read-only SQL RPC on 2026-07-29. PostgREST cannot expose the required
`supabase_migrations`, `pg_proc`, and `pg_constraint` probes, and it cannot
inspect Vercel cron history. The live probe therefore remains unresolved. Do
not infer it from repository migration files.

## Promotion and staging sequence

After resolving the Debate state:

1. Reconcile any migration-ledger/catalog disagreement before running a
   database push.
2. Re-run the probe-3 query against the target database. The candidate's drift
   guard will refuse to apply if that database allows a type the file omits.
3. Copy the reviewed SQL candidate into `supabase/migrations` with a timestamp
   that is safe relative to the resolved Debate files.
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
