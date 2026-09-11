# Supavisor transaction mode stalls when demand exceeds the pool

Found while verifying that production's `DATABASE_URL` could authenticate
before enabling the first migrated read. It authenticates. It also stalls under
the access pattern a serverless function produces, and that is a blocker for
enabling migrated reads against it.

## The measurement

Same machine, same process, same `postgres.js` options as
`lib/db/postgres/connection.ts` uses in production (`max: 5`,
`prepare: false`, `idle_timeout: 20`, `connect_timeout: 15`,
`statement_timeout: 8000`). Each run issues five sequential queries to warm the
pool, then a burst of N trivial `select 1` queries at once.

| Target | Burst | Result |
|---|---|---|
| Supavisor session mode, 5432 | 10 | OK, 952ms |
| Supavisor transaction mode, 6543 | 10 | **stalls, killed at 25s** |
| Supavisor transaction mode, 6543 | 5 | OK, 1680ms |
| Supavisor transaction mode, 6543 | 2 | OK, 917ms |
| Neon pooled | 10 | OK, 2548ms |

Reproduced four times on transaction mode. Never once on Neon or on session
mode.

## What it is not

**Not this machine.** Neon is reached from the same process, in the same run,
with the same options and the same overflow condition, and drains every time.
The transport instability recorded in `docs/parity-transport-instability.md` is
real and separate; it produces dropped sockets, not a clean 25-second stall
that stops at exactly the pool boundary.

**Not connection exhaustion at the database.** `pg_stat_activity` during the
failures showed 30 of `max_connections` 60, with 21 idle.

**Not a slow query.** The queries are `select 1`. Five of them succeed in under
two seconds in the same run.

**Not a bad credential.** Authentication, counts, parameterised queries, jsonb
aggregation and the search domain's own `ilike` shape all pass on 6543.

## What it is

The break is exactly at `max`. Five concurrent queries against a pool of five
succeed; ten do not. `postgres.js` queues the overflow until a connection frees,
and against Supavisor transaction mode that queue never drains. Against Neon,
and against Supavisor session mode, the identical overflow drains normally.

Neither timeout helps, which is what makes it dangerous:

- `statement_timeout` is enforced by PostgreSQL, and a queued query has not
  reached PostgreSQL.
- `connect_timeout` governs establishing a connection, and the pool already has
  its five.

So the request hangs until something further out gives up. On Vercel that is
the function timeout, not an error the application can catch and convert into a
degraded response.

## Why it blocks the read cutover as planned

The plan was to move reads onto the repository layer while still pointing at
Supabase, then move the database to Neon later. That ordering sends every
migrated read through Supavisor transaction mode.

A warm serverless instance holding an open pool, receiving more concurrent
repository queries than `max`, is not an edge case for a feed or a search
endpoint. It is the normal shape of traffic. The failure mode is a hang rather
than an error, so it would present as timeouts rather than as anything pointing
at the pooler.

## Options

1. **Reorder: freeze, copy, point at Neon, then enable reads.** Reads never
   touch Supavisor transaction mode. Neon passes every test here and in
   `neon-verify.mjs`. It also collapses two cutovers into one, which removes
   the step where reads and writes are on different databases.
2. **Point `DATABASE_URL` at session mode, 5432.** Passes this test, but
   session mode holds a backend per client connection against
   `max_connections` 60, so a modest number of warm lambdas exhausts the
   database instead. Trading a stall for a different exhaustion.
3. **Raise `max` above expected per-instance concurrency.** Guessing at a
   bound that traffic can exceed, and the failure when it does is still a hang.

Option 1 is the only one where the evidence points the same way twice.

## Reproducing

```
node scripts/migration/txmode-check.mjs
```

The first five checks pass and `concurrency, 10 at once` fails. The check is
bounded at 20 seconds per step, because an unbounded version produces no output
at all and reads as the script hanging.
