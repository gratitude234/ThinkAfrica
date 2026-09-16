# Database incident diagnostics

What to run after the database becomes unhealthy again, what the answers mean,
and what this telemetry genuinely cannot tell you.

Installed by `supabase/migrations/20260908000001_database_telemetry.sql`.

---

## 1. The one command

Open the Supabase SQL Editor (it runs as `postgres`) and run:

```sql
select * from private.db_incident_report(60);
```

The argument is the window in minutes, looking back from now. Use 30 for a
sharp spike, 60 for a slow degradation, 180 if you only noticed hours later.

To look at a window that has already passed, pass its end:

```sql
select * from private.db_incident_report(60, '2026-09-08 14:30:00+00');
```

The result is four columns: `section`, `ordinal`, `label`, `detail`. It reads
top to bottom.

| Section | What it answers |
|---|---|
| `1_window` | Which minutes this covers, and how many captures actually landed |
| `2_health` | Connections, waits, temp I/O, cache, deadlocks and rollbacks over time |
| `3_top_queries` | What became expensive *in this window*, ranked by delta |
| `4_connection_sources` | Who opened the connections and what state they sat in |
| `5_long_running` | The individual backends that were stuck |
| `6_limits` | What this report cannot see, restated in the output itself |

### Read `1_window` first

`captures` versus `expected_captures` is the first fact worth having. The job
runs every five minutes, so a 60-minute window should contain about 12 rows.
**Four captures where twelve were expected is itself the finding**: the database
was unable to run a tiny bounded job, which means the problem was not one slow
query but the instance as a whole.

---

## 2. Reading it

### `2_health` — the time series

One row per capture, oldest first. The fields that carry the diagnosis:

- **`connections` against `max_connections`.** Connection exhaustion looks like
  `connections` climbing toward `max_connections` while `active` stays low and
  `idle_in_transaction` rises. That is a client holding transactions open, not
  a slow database.
- **`waiting` and `lock_waiting`.** Backends blocked on something. A high
  `lock_waiting` with a low `active` is a lock pile-up behind one long
  transaction, and `5_long_running` will name it.
- **`longest_active_query_ms` / `longest_transaction_ms`.** A transaction older
  than the whole incident window is almost always the cause rather than a
  symptom.
- **`temp_bytes_delta`.** Bytes spilled to disk during that five minutes. A
  sudden rise means a query outgrew `work_mem` and started sorting on disk,
  which is one of the few things that can take an otherwise healthy small
  instance down.
- **`cache_hit_percent`.** Normally in the high nineties. A drop means the
  working set stopped fitting in shared buffers.
- **`deadlocks_delta`, `rollbacks_delta`.** Rollbacks rising sharply with
  commits flat is the application failing, not retrying successfully.
- **`sessions_fatal_delta` / `sessions_killed_delta`.** Sessions the server
  ended. Non-zero here during an outage is a strong signal.
- **`capture_duration_ms`.** How long telemetry itself took. If this climbs
  from ~50ms to seconds, even trivial catalogue reads were queuing.
- **`query_capture_error`.** Set when the `pg_stat_statements` scan failed or
  ran out of time. The health numbers in that row are still good.
- **`can_read_all_stats`.** If this is ever `false`, treat every connection
  count in that row as an undercount: without `pg_read_all_stats` membership,
  `pg_stat_activity` hides other roles' `state` and `query`.

### `3_top_queries` — deltas, not lifetime totals

`pg_stat_statements` counters are cumulative since the last reset, so "the most
expensive query since startup" is nearly always the same boring query and tells
you nothing. Everything in this section is the **change across the window**:

- `total_exec_time_ms_delta` — total database time this statement consumed
  during the incident. This is the ranking that matters most.
- `calls_delta` — a query that got 100× more frequent is a different problem
  from one that got 100× slower. This column separates them.
- `mean_ms_worst_interval` — the worst five-minute average.
- `temp_blks_written_delta` — spilling to disk.
- `shared_blks_read_delta` — reads that missed shared buffers.

A delta comes back `NULL`, never a wrong number, when it cannot be trusted:
`pg_stat_statements` was reset, or the entry was evicted and re-created, inside
that interval.

### `4_connection_sources`

Aggregated over the window, one row per
`application_name` / `user` / `state` / wait event, with `peak_backends`.

Names to expect: PostgREST, GoTrue (Auth), the Supabase pooler, `pg_cron`, and
anything the application sets. `(no application_name)` is usually a direct
connection.

### `5_long_running`

Only backends that had been on the same statement for more than five seconds,
five per capture at most. `query_excerpt` is truncated to 200 characters and
**may contain literal parameter values**, which is why this table never leaves
the `private` schema.

---

## 3. Digging further

The report is a summary. The underlying objects are queryable directly.

Health, minute by minute, with the deltas already computed:

```sql
select captured_at, total_connections, active_connections,
       idle_in_transaction_connections, waiting_connections,
       temp_bytes_delta, cache_hit_percent, xact_rollback_delta
  from private.db_health_deltas
 where captured_at > now() - interval '3 hours'
 order by captured_at;
```

One statement's behaviour over time, once you have its `queryid` from the
report:

```sql
select captured_at, calls_delta, total_exec_time_delta,
       mean_exec_time_delta, temp_blks_written_delta
  from private.db_query_deltas
 where queryid = 1234567890123456789
   and captured_at > now() - interval '6 hours'
 order by captured_at;
```

The raw captures, if you need a column the report does not surface:

```sql
select * from private.db_health_snapshots     order by captured_at desc limit 20;
select * from private.db_connection_snapshots order by captured_at desc limit 50;
select * from private.db_activity_snapshots   order by captured_at desc limit 20;
select * from private.db_query_snapshots      order by captured_at desc limit 50;
```

---

## 4. Checking the telemetry itself

Is the job scheduled and running?

```sql
select * from private.inspect_indegenius_cron_jobs()
 where job_name = 'indegenius-db-telemetry';
```

Run a capture by hand:

```sql
select * from private.capture_db_telemetry();
```

Is `pg_stat_statements` actually available?

```sql
select extname, extversion from pg_extension where extname = 'pg_stat_statements';
select private.pgss_schema();
select pgss_available, pgss_statements_tracked, pgss_stats_reset, query_capture_error
  from private.db_health_snapshots
 order by captured_at desc limit 1;
```

If `pgss_available` is false, the extension is not installed and needs
`shared_preload_libraries`. Health and connection telemetry keep working
without it; only section 3 goes empty.

---

## 5. Cost and retention

| | |
|---|---|
| Schedule | `3-59/5 * * * *` — every 5 minutes, at minute 3 |
| Runs per day | 288 |
| Rows per run | 1 health + ~10-25 connection + 0-5 activity + ~20-30 query |
| Rows per day | roughly 10,000-16,000 |
| Retention | 7 days, pruned inside the same job |
| Steady state | under 100,000 rows, a few tens of MB |
| Runtime | tens of milliseconds normally; hard ceiling 8 seconds |

The job carries `statement_timeout = 8s` and `lock_timeout = 2s`. If telemetry
cannot finish quickly it fails and records nothing for that interval, by
design. The one thing worse than no diagnostics is diagnostics that add to the
outage they exist to explain.

Pruning happens inside the same job. There is no second cron entry for it.

---

## 6. What this cannot tell you

Be precise about this, because the gap is where the current outages probably
live.

**Observable from inside PostgreSQL:**

- Query execution time, call counts, rows, and per-statement block counters
- Connection counts, and the application, user and state behind each
- Wait events, including lock waits
- Shared buffer hits and reads (the cache hit ratio)
- Temp file and temp block I/O, which is the disk-spill signal
- Transaction commits, rollbacks and deadlocks
- Database size, and per-backend I/O totals via `pg_stat_io`

**Not observable from inside PostgreSQL, at all:**

- **Total host RAM, free memory, or swap usage.** Postgres does not know how
  much memory the machine has or how much is left.
- **The Linux OOM killer.** If the kernel killed a backend or the postmaster,
  nothing in SQL records it. The symptom you would see here is a gap in the
  capture series plus `sessions_fatal` climbing, which is suggestive, not
  proof.
- **Platform CPU, disk throughput, disk queue depth, or IOPS limits.**
- **Connections refused before Postgres accepted them.** Client-side connection
  timeouts and pooler saturation happen outside the server's view, so the
  "connection timeouts" symptom may not appear in `total_connections` at all.
- **PostgREST and GoTrue internals.** Schema-cache failures and Auth 504s are
  events in those services. What is visible here is only their effect on the
  database, if any.
- **Anything during the minutes the database was unreachable.** The telemetry
  job is a database client. If the database could not answer, the job did not
  run, and there is no row. That absence is evidence, but it is not a
  measurement.

For host-level resource metrics, use the Supabase dashboard: **Database >
Reports** for CPU, memory, disk I/O and connection graphs, and the project's
Prometheus-compatible metrics endpoint for the same data at higher resolution.
Cross-referencing a memory spike there with a `temp_bytes_delta` spike here is
how the two halves of an incident get connected.

---

## 7. Privacy

All four tables live in the `private` schema, which PostgREST does not expose,
and `anon` and `authenticated` have no `usage` on it. Each table has RLS
enabled and forced with no policies, so only a `BYPASSRLS` role (`postgres`,
`service_role`) can read a row.

Two places store statement text:

- `db_query_snapshots.query_excerpt` — from `pg_stat_statements`, which
  normalises literals to `$1`, `$2`, so this is the shape of a statement rather
  than anyone's data. Truncated to 500 characters.
- `db_activity_snapshots.query_excerpt` — from `pg_stat_activity`, which
  **does** carry literal values. Truncated to 200 characters, and written only
  for backends stuck for more than five seconds, at most five per capture.

Do not copy the output of section 5 into a shared document without reading it
first.
