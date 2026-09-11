# Keeping Neon current until write cutover

Neon is a snapshot. Production writes still go to Supabase, so the gap widens
every day, and any plan that ends with Neon serving reads has to close it.

This document records what was measured, which mechanism was chosen, and why
the two obvious alternatives were rejected on evidence rather than taste.

Reproduce any of it with:

```
node scripts/migration/drift-check.mjs        # how far apart they are now
node scripts/migration/sync-feasibility.mjs   # which mechanisms are available
node scripts/migration/freeze-check.mjs       # whether writes have stopped
```

## What the drift actually is

Measured 2026-09-11, against production.

| | |
|---|---|
| Tables in scope for migrated reads | 28 |
| Tables that have drifted | 12 |
| Rows on Supabase and absent from Neon | 283 |
| Rows on Neon and absent from Supabase | **0** |
| Orphaned foreign keys on Neon | 0 |
| Newest row on Neon | 2026-09-06 |

The zero in the third row is the most useful number in this document. Nothing
exists on Neon that does not exist on Supabase, which means no row has been
hard-deleted upstream since the snapshot was taken. Drift is therefore purely
forward: Supabase has rows Neon lacks, and Neon holds nothing stale.

That is a fact about this window, not a guarantee about the next one. A delete
that lands before cutover would leave Neon holding a row the product has
removed, and no copy keyed on "what is new" would ever find it. The chosen
mechanism does not depend on that staying true.

The drift is concentrated where you would expect from four days of ordinary
use: 79 notifications, 59 likes, 40 post revisions, 16 posts, 10 profiles, 10
follows, 6 comments, 4 bookmarks. The `posts` status distribution differs by 4
drafts and 12 published, which is the same 16 posts seen from the other side.

The remaining 59 are derived rather than written: 16 rows each in
`post_bookmark_counts` and `post_reference_counts`, 11 in `post_like_counts`,
and 16 in `post_authors`. The three counter tables carry one row per post and
are trigger-maintained, so they drift in lockstep with `posts` rather than
independently. That is worth knowing before reading a count mismatch on them as
a second problem: it is the same 16 posts, counted four more times.

## Mechanism 1: logical replication. Available, and rejected

Both halves support it, which was worth establishing rather than assuming:

| | Supabase | Neon |
|---|---|---|
| `wal_level` | `logical` | `replica` |
| Connecting role has `REPLICATION` | yes | yes |
| Replication slots free | 5 of 5 | n/a |
| `CREATE SUBSCRIPTION` permitted | n/a | yes |
| Tables with a primary key | 79 of 79 | 79 of 79 |
| Tables with default replica identity | 79 of 79 | 79 of 79 |

Every table has a primary key, so `UPDATE` and `DELETE` replicate correctly
rather than erroring at apply time. Subscriber-side triggers do not fire by
default, which matters here more than it usually does: the points system awards
on insert and the three counter tables are trigger-maintained, so an apply that
fired them would double every score in the product. Replication gets that right
where an application-level copy has to be careful.

It is still the wrong choice, for two reasons.

**The replication protocol cannot reach the publisher.** Supavisor does not
carry it, so a subscriber must connect to `db.<ref>.supabase.co` directly. That
host is IPv6-only: it publishes one AAAA record and no A record. The pooler is
the reverse, three A records and no AAAA. So the only endpoint that speaks
replication is reachable only over IPv6, and the subscriber would be Neon,
whose egress we do not control. Supabase sells an IPv4 add-on for the direct
connection, which turns this into a billing decision rather than an
impossibility, but it is a dependency on a paid network feature for a bridge
meant to last weeks.

**A replication slot is a production risk.** An inactive slot retains WAL
indefinitely. If the subscriber disconnects over a weekend, or lags, Supabase
accumulates write-ahead log until the disk fills, and a full disk on the
primary is an outage of the live product. That risk is justified for a
permanent architecture. It is not justified for a temporary bridge to a
database that currently serves nothing.

## Mechanism 2: timestamp-keyed incremental copy. Not viable

This is the approach that looks cheapest and is actually unsound here, so the
reason is worth stating precisely.

Of 79 public tables, 22 carry a column that moves when a row is updated. The
other 57 do not, and 35 of those are non-empty. The list includes almost every
table the migrated reads depend on:

`profiles`, `follows`, `likes`, `bookmarks`, `notifications`, `post_authors`,
`comment_votes`, `conversations`, `conversation_participants`, `post_revisions`,
`post_versions`, `post_reviews`, `post_editor_decisions`,
`profile_featured_posts`, `post_references`, and the three counter tables.

A copy keyed on `updated_at` would therefore detect **inserts** to those tables
and silently miss every **update**. A profile that changed its privacy setting,
a comment that was hidden, a post author whose invitation was accepted: all
invisible. The copy would report success and Neon would be quietly wrong in
exactly the places that decide visibility.

`messages.edited_at` deserves a specific mention because it is the trap inside
the trap. The column exists, so a table-driven implementation would treat it as
a clock, and zero rows in production have `edited_at > created_at`. It has
never moved. Keying on it would look like coverage and provide none.

Adding `updated_at` to 35 tables plus triggers to maintain it is a schema
change to a live product, in service of a mechanism that is being retired
within weeks.

## Mechanism 3: freeze, re-copy, verify, cut over. Chosen

The deciding fact is scale. The public schema is **28 MB** across **79 tables**;
the whole database including indexes and bloat is 52 MB. A full re-copy is
minutes of work, not hours, and `copy-data.mjs` already does it correctly:
parents before children so foreign keys stay enforced throughout, and
`DISABLE TRIGGER USER` so application triggers do not fire while constraint
triggers still do.

At this size, incremental machinery costs more than it saves and introduces the
one failure mode a full copy cannot have: a partial state that looks complete.

### The sequence

1. **Announce and freeze writes.** Enforced upstream, by putting the
   application into maintenance mode. Nothing in this repository can enforce it.
2. **Prove the freeze held.** `node scripts/migration/freeze-check.mjs --window 120`
   takes a census, waits, and takes it again. Exit 0 means nothing moved. It
   reports honestly that it can only see inserts and deletes on the 35 tables
   without an update clock, so it measures a freeze rather than applying one.
3. **Re-copy.** `node scripts/migration/reset-neon.mjs` then
   `node scripts/migration/copy-data.mjs`, followed by
   `node scripts/migration/reset-sequences.mjs`, which matters because
   sequences are not carried by any copy and a missed reset means the first
   insert after cutover collides with an existing key.
4. **Verify.** `node scripts/migration/verify-data.mjs` for the row-level
   digests, then `node scripts/migration/drift-check.mjs`, which must report
   zero drifted tables and zero orphaned foreign keys.
5. **Re-run parity.** `node scripts/migration/parity-all.mjs`, because the
   comparison that matters is against the database that will actually serve.
6. **Cut over reads and writes together**, then unfreeze.

### Why reads and writes move together

A read cutover that leaves writes on Supabase reintroduces the divergence this
whole document exists to close, and does it silently. The feed would list posts
the post page cannot find. There is no ordering of the two switches that is
safe apart from "at the same time, behind a freeze".

## The thing this does not settle

Neon freshness is only on the critical path if production reads point at Neon.

Migrated reads resolve their connection from `DATABASE_URL`. During this phase
the intended value is **production Supabase's own Postgres**, not Neon: same
database, same rows, no staleness, with PostgREST removed from the path. That
is what every parity harness has been comparing against, and it is why those
harnesses can claim same-instant equivalence at all.

So there are two different cutovers wearing similar names:

- **Transport cutover.** `READ_MIGRATED_DOMAINS=<domain>` with `DATABASE_URL`
  pointing at Supabase Postgres. Neon drift is irrelevant, because Neon is not
  in the path. This is what the parity evidence supports.
- **Database cutover.** `DATABASE_URL` pointing at Neon. Everything above
  applies, and the parity evidence does **not** transfer, because it was
  measured against a different database.

Enabling a domain while `DATABASE_URL` points at Neon would serve reads from a
database that no harness has compared, currently four days stale and missing 16
posts and 10 profiles. The two settings have to be checked together, and the
value of `DATABASE_URL` in the target environment is a precondition of any
read cutover decision.
