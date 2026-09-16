# Neon migration plan

The data-layer half of the move to Cloudflare Workers + Hyperdrive + Neon: the
driver decision, the `lib/db` boundary, one domain behind it, and the runbook
for everything that has not been done yet.

Production is unchanged. Vercel serves the application, Supabase serves the
database, Supabase Auth serves sessions, Supabase Storage serves files, and
`DATABASE_ADAPTER` is unset, which means Supabase.

**Phase 2 status.** `postgres@3.4.9` is installed and
[lib/db/postgres/connection.ts](../lib/db/postgres/connection.ts) is complete:
`DATABASE_ADAPTER=postgres` now opens a real pool rather than throwing a
placeholder. The measurement tooling and the differential harness are written
and runnable. What does not exist is a Neon database to point them at; §5 says
exactly which two values are needed.

Companion documents: [database-access-inventory.md](database-access-inventory.md)
(what touches the database), [auth-and-rls-migration.md](auth-and-rls-migration.md)
(who is allowed to), [rpc-identity-migration.md](rpc-identity-migration.md) (the
`auth.uid()` functions), and
[pending-migration-decisions.md](pending-migration-decisions.md) (the five
unapplied release candidates).

---

## 1. Why this is happening

Repeated production outages with one shape:

```
PostgreSQL stops answering
  → PostgREST loses the database        → Supabase REST returns 522
  → Supabase Auth loses the database    → Auth returns 504
  → the Vercel function waits
  → 300-second platform timeout, nothing rendered
```

Two things follow, and they are different problems:

- **The fan-out is high.** One signed-out article view is ~17 HTTP round trips
  to Supabase, each of which is a separate PostgREST request with its own
  connection acquisition. That has already been reduced from 20 and is analysed
  query by query in [post-page-query-path.md](post-page-query-path.md) §8.
- **PostgREST is a second system between the application and its data.** Its
  schema cache, its connection pool and its availability are all independent
  failure surfaces, and none of them is one this team can inspect during an
  incident.

A direct SQL layer collapses ~17 HTTP requests into a small number of
statements on one pooled connection, and removes an entire tier from the
failure chain. That is the case for the migration. It is not a performance
project.

---

## 2. The database client: postgres.js

**Recommendation: [postgres.js](https://github.com/porsager/postgres) as the
driver, with hand-written repositories in `lib/db`. No ORM.**

### The candidates, judged against this repository

| | postgres.js | node-postgres (`pg`) | `@neondatabase/serverless` | Drizzle ORM |
|---|---|---|---|---|
| Works over Hyperdrive | Yes, with `nodejs_compat` | Yes, with `nodejs_compat` | **Bypasses it** - talks to Neon's own HTTP/WS proxy | Only as a layer over one of the first three |
| Bundle cost in a Worker | Small | Larger | Small | Driver + query builder + schema module |
| Raw SQL | Native, tagged templates | Native | Native | Supported, but it is not the point of using it |
| Transactions | `sql.begin()` | `client.query('BEGIN')` | Limited over HTTP; full over WebSocket | Delegated to the driver |
| Existing SQL functions | Called unchanged | Called unchanged | Called unchanged | Called unchanged, outside the type system |
| Migrations | Not its job - the repository already has 131 hand-written SQL migrations | Same | Same | Brings its own, which would compete with them |
| Cost of replacing 927 PostgREST call sites | One repository method per query | Same | Same | Same, **plus** modelling ~68 tables in a schema DSL first |

### Why postgres.js, specifically

**It is one of the two drivers Hyperdrive is built for.** Hyperdrive hands the
Worker a normal PostgreSQL connection string and pools on the far side; it
expects a wire-protocol client. The Neon serverless driver is excellent and
solves a different problem - reaching Neon from a runtime with no TCP - which
is not the problem here, because Hyperdrive provides the TCP and the pooling.
Choosing it would mean paying for Hyperdrive and not using it.

**It is smaller and simpler than `pg` for what this codebase does.** The
tagged-template API produces parameterised statements by construction, which
matters when 183 write sites are being rewritten by hand: `sql\`select * from
posts where slug = ${slug}\`` cannot become string concatenation by accident.

**No ORM, because the schema is not the kind an ORM helps with.** 131
migrations, 203 database functions, `SECURITY DEFINER` helpers, advisory locks,
counter tables maintained by triggers, `jsonb` aggregates. Modelling that in a
schema DSL would be a second description of the database that has to be kept in
sync with the first, and the first is the one production runs. Type safety
comes instead from explicit row interfaces at the repository boundary, mapped
once - which is what `lib/db/postgres/posts.ts` does and what
`lib/db/types.ts` declares.

### Installed, and what the options mean

`postgres@3.4.9` is a dependency as of Phase 2. It appears in no audit advisory
and is imported by exactly one module,
[lib/db/postgres/connection.ts](../lib/db/postgres/connection.ts), which is
`server-only`.

```ts
export const POSTGRES_POOL_OPTIONS = {
  max: 5,                  // a Worker holds at most six TCP connections
  prepare: false,          // both targets are transaction-mode poolers
  idle_timeout: 20,
  max_lifetime: 60 * 30,
  connect_timeout: 10,
  connection: { statement_timeout: 8000 },
  fetch_types: false,      // skips a type-OID round trip per cold isolate
};
```

None of these is a preference:

- **`max: 5`** because a Cloudflare Worker invocation may hold at most six TCP
  connections, and Hyperdrive pools on the far side anyway. The same number is
  right on Vercel for the mirror-image reason: Neon's pooler is doing the
  pooling, and a function that opens more sockets than it can use just holds
  them.
- **`prepare: false`** because both intended targets are transaction-mode
  poolers. A named prepared statement is bound to a backend connection, and a
  transaction-mode pooler does not promise the next statement lands on the same
  one.
- **`statement_timeout: 8000`** is the direct heir of
  [lib/supabase/fetchTimeout.ts](../lib/supabase/fetchTimeout.ts). That deadline
  exists because a database that stopped answering held a Vercel function open
  for 300 seconds and produced nothing. The same ceiling is set on the role by
  [neon-preflight.sql](../scripts/migration/neon-preflight.sql), so it holds
  even for a client that forgets to ask.
- **`idle_timeout` / `max_lifetime`** keep a serverless instance from holding a
  connection across long idle periods, which is how a small pool becomes a
  large one at the database.

Verify `max` and `prepare` against Cloudflare's current Hyperdrive
documentation before the Worker deploy; the recommended options have changed
before. They are pinned by [lib/db/index.test.ts](../lib/db/index.test.ts), so
changing them is deliberate rather than incidental.

### Where the connection string comes from

Two runtimes, two answers, and the module refuses to guess:

- **Vercel**, today and throughout the transition: `DATABASE_URL`, which must
  be Neon's *pooled* endpoint.
- **A Worker**, later: the string comes from the Hyperdrive binding, through
  `setConnectionString()`, never from an environment variable. A Worker that
  dials Neon directly bypasses the pool it is paying for.

`DATABASE_URL_DIRECT` is deliberately not read at runtime. It is the unpooled
admin connection for migrations and DDL, it belongs to a different role, and
runtime traffic on it is how a schema change becomes an outage. That rule is
also a test.

---

## 3. The `lib/db` boundary

```
app/ components/          UI. Names no table, holds no query.
      ↓
server actions / routes   Authenticate, authorize, then ask.
      ↓
lib/db                    The only place a provider is named.
      ↓
PostgreSQL (Supabase today, Neon later)
```

```
lib/db/
  types.ts                 Row shapes + repository contracts. Provider-neutral.
  index.ts                 getDatabase(): picks an adapter from DATABASE_ADAPTER.
  supabase/
    posts.ts               The PostgREST query, unchanged. The default.
  postgres/
    executor.ts            SqlExecutor: the two methods a repository needs.
    connection.ts          Where a driver will be attached. Throws until then.
    posts.ts               The same lookup as SQL, plus row mapping.
```

The structure is not imposed on the whole codebase. This repository already has
good domain boundaries in `lib/` - `feedData.ts`, `notificationData.ts`,
`profileViewData.ts`, `broadcastStore.ts`, `commentThread.ts` - and those are
where the next repositories belong, not in a parallel `lib/db/posts.ts`. What
`lib/db` owns is the *provider decision* and the contracts; a domain module
keeps owning its domain.

### The adapter switch

```ts
export function resolveAdapterName(raw = process.env.DATABASE_ADAPTER) {
  const value = raw?.trim();
  if (!value) return "supabase";
  if (ADAPTER_NAMES.includes(value)) return value;
  throw new Error(`DATABASE_ADAPTER must be one of ${...}. Received "${value}".`);
}
```

Three decisions in nine lines, each of which is tested:

- **Unset means Supabase.** An environment that has never heard of this
  variable behaves exactly as it did before.
- **An unknown value throws.** A typo during a cutover must not be
  indistinguishable from a deliberate decision to stay on Supabase.
- **The choice is process-wide, not per request.** A page composed of rows from
  two databases is not something anyone can reason about during an incident.

Migration granularity comes from the *repository*, not from the switch: a
domain moves when its repository has a Postgres implementation and the adapter
is pointed at it, one domain at a time.

---

## 4. Proof of concept: the public post lookup

`getPostBySlug()` was chosen because it is the safest interesting query in the
codebase. It is read-only, it is the hottest path in the product, it has no
writes and no cascade, it already had a single owner after the deduplication
work, and it is covered by tests that would notice a behaviour change.

**Before**: [lib/postBySlug.ts](../lib/postBySlug.ts) held `cache()` *and* the
PostgREST query.
**After**: it holds `cache()` and asks `getDatabase().posts.findBySlug(slug)`.
The query moved to [lib/db/supabase/posts.ts](../lib/db/supabase/posts.ts)
verbatim - same columns, same filters, same `maybeSingle()`, same error
message. Production behaviour is byte-identical.

[lib/db/postgres/posts.ts](../lib/db/postgres/posts.ts) is the same lookup as
SQL. It is written to be *behaviourally* identical rather than merely similar,
because the two have to be swappable without the route noticing:

| PostgREST | SQL | Why it matters |
|---|---|---|
| `profiles!posts_author_id_fkey (...)` | `left join public.profiles` + `jsonb_build_object` | The embed is an outer join. A post whose author row is gone still renders. An inner join would 404 it. |
| `.maybeSingle()` | `limit 2`, raise on two rows | `maybeSingle` fails on multiple matches. "Take the first row" would silently serve an arbitrary post if the `slug` unique constraint were ever lost. |
| Timestamps as ISO strings | `Date` from the driver, mapped back | `PostRecord.created_at` is typed `string` and callers format it. Handing them a `Date` is a type lie that mostly works. |
| `int8` as a number | String from the driver, parsed | Counters. `Number(...)` at the boundary, once. |

### Tests

| File | Proves |
|---|---|
| [lib/db/index.test.ts](../lib/db/index.test.ts) | Unset → Supabase; both names accepted; anything else throws; Postgres fails at selection with a named error while it has no driver |
| [lib/db/postgres/posts.test.ts](../lib/db/postgres/posts.test.ts) | The statement is constant and every value is a parameter; the join is outer; two rows is an error; timestamps and counters map correctly; a missing author does not drop the post |
| [lib/db/posts.authorization.test.ts](../lib/db/posts.authorization.test.ts) | The route gates every unpublished status the lookup can return, derived from `VISIBLE_POST_STATUSES` rather than hardcoded |
| [lib/postBySlug.test.ts](../lib/postBySlug.test.ts) | Unchanged: still one query per render per slug, still no cross-render leak |
| [app/(main)/post/[slug]/postQueryPath.test.ts](<../app/(main)/post/[slug]/postQueryPath.test.ts>) | Extended: the loader reaches the provider through `lib/db` and names none itself |

The authorization test is the one that earns its place. It exists because
moving to a direct connection removes RLS from underneath this lookup, and the
route's own status check stops being a second opinion and becomes the whole
of the authorization. See
[auth-and-rls-migration.md](auth-and-rls-migration.md) §5.

---

## 5. Migrating the schema and the data to Neon

Nothing here has been run. No Neon project has been created and no credentials
exist in this repository.

Runbook and scripts: [scripts/migration/](../scripts/migration/).

### What Phase 2 needs to proceed

Two values, and nothing else is blocking:

| Value | What it is | Used by |
|---|---|---|
| `SUPABASE_DB_URL` | The **direct** PostgreSQL connection string for the Supabase project (dashboard → Project Settings → Database → Connection string → URI). Not the anon key, not the service-role key, not the `https://` project URL: none of those can run a catalogue query. | [measure-supabase.mjs](../scripts/migration/measure-supabase.mjs), read-only |
| `DATABASE_URL` | A **Neon scratch** connection string, pooled endpoint. Suggested project name `indegenius-migration`. Never production. | [neon-preflight.sql](../scripts/migration/neon-preflight.sql), the data copy, and [parity-check.mjs](../scripts/migration/parity-check.mjs) |

Set them as environment variables; neither belongs in this repository, and
neither should be pasted into a conversation.

Note for this machine specifically: `psql` and `pg_dump` are not installed,
which is why the measurement step is
[measure-supabase.mjs](../scripts/migration/measure-supabase.mjs) (postgres.js,
no client binaries) rather than the shell script Phase 1 wrote. The shell
script still exists and is still correct where those binaries are available;
`pg_dump` will be needed for the schema dump itself in step 4 regardless.

### The allowlist, not the dump

`pg_dump` of a Supabase database will happily bring across `auth`, `storage`,
`realtime`, `vault`, `supabase_functions`, `extensions`, `graphql`, and grants
to `anon`, `authenticated` and `service_role`. Copying any of that is how the
new database inherits the old one's coupling. So the migration is an
**allowlist**:

**Schemas that move**: `public`, `private`.

**Object classes that move**: tables, columns, constraints, indexes, sequences,
views, functions, triggers, RLS policies (rewritten, see below), and the data.

**Objects that are excluded and must be checked for by name after the dump**:

| Excluded | Why | Replacement |
|---|---|---|
| `auth.*`, `storage.*`, `realtime.*`, `vault.*`, `net.*`, `supabase_functions.*`, `extensions.*`, `graphql*`, `supabase_migrations.*` | Provider-owned | Better Auth (own schema), R2, none, none |
| FK `profiles.id → auth.users(id)` | Target does not exist | FK to the Better Auth user table |
| FK `activation_events.user_id → auth.users(id)` | Same | Same, `on delete set null` preserved |
| FK `saved_opportunities.user_id → auth.users(id)` | Same | Same, `on delete cascade` preserved |
| Trigger `on_auth_user_created` and `handle_new_user()` | Fires on a table that will not exist | Profile creation in the sign-up transaction |
| `list_broadcast_contact_emails()` | Reads `auth.users` | Rewrite against the Better Auth user table. The reason it is SQL rather than a GoTrue call still applies |
| `private.dispatch_indegenius_cron` and the four scheduler functions | `pg_cron` + `pg_net` + `vault` | Cloudflare Cron Triggers → the same `/api/cron/*` routes |
| `cron_http_requests` table | Same | Whatever the new scheduler logs |
| Grants to `anon` / `authenticated` / `service_role` | PostgREST roles | One `indegenius_app` role, per [auth-and-rls-migration.md](auth-and-rls-migration.md) §3 |
| `debate_*` (17 tables) | Already dropped | Confirm absent before dumping |
| `webinars`, `webinar_attendees`, `webinar_questions` | No code references anywhere | **Check for rows before deciding.** Do not assume |

### Extensions required on Neon

| Extension | Used for | On Neon |
|---|---|---|
| `pgcrypto` | `gen_random_uuid()` throughout | Available |
| `uuid-ossp` | `uuid_generate_v4()` in the base schema | Available |
| `pg_stat_statements` | `private.capture_db_telemetry` | Available, may need enabling |
| `pg_cron` | The seven scheduled jobs | **Not available.** Rehost on Cloudflare Cron Triggers |
| `pg_net` | Cron dispatch to `/api/cron/*` | **Not available.** Same replacement |
| `vault` | The cron secret | **Not available.** Worker secret |

Verify availability against Neon's current extension list before relying on
this table.

### RLS policies

Migrate them, rewritten. `auth.uid()` becomes a session setting the application
sets per transaction:

```sql
-- once, in the Neon schema
create or replace function public.app_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- then, mechanically, in every policy and function
--   auth.uid()  →  public.app_user_id()
--   auth.role() →  a role check the application sets the same way
```

```ts
// and in the repository, per transaction
await sql`select set_config('app.user_id', ${viewerId}, true)`;
```

This keeps 146 policies working as a backstop while the application grows its
own checks, and it is a search-and-replace rather than a redesign. It only
works if the connection role does not own the tables:
[auth-and-rls-migration.md](auth-and-rls-migration.md) §3.

### Order of operations

1. Snapshot the live schema (`pg_dump --schema-only`) and the live catalogue
   queries from [database-access-inventory.md](database-access-inventory.md)
   §1. The catalogue is the source of truth, not the migration files.
2. Decide the pending-migration question
   ([database-access-inventory.md](database-access-inventory.md) §7): apply
   them to Supabase first, or exclude them from Neon and apply after.
3. Build the Neon schema from the edited dump. Apply it to a scratch Neon
   branch and read the diff against Supabase's catalogue until it is empty
   except for the deliberate exclusions.
4. Copy data in FK order, `COPY` per table, with triggers disabled and
   re-enabled. Counter tables (`post_like_counts`, `post_bookmark_counts`,
   `post_reference_counts`) are copied as data, not recomputed, and then
   reconciled - the reconciliation function already exists
   (`20260715000006_like_count_reconciliation_and_service_role_grant.sql`).
5. Reset sequences. `citation_sequences` in particular: a citation id that
   repeats is a published artefact with a duplicate identifier.
6. Verify row counts per table, then verify a sample of the aggregates.
7. Only then point a domain's adapter at it, in a preview deployment.

### Data volume

Unknown from the repository, and it decides the strategy: under a few GB, a
`pg_dump`/`pg_restore` with a maintenance window is simplest. Above that, or if
the window is unacceptable, logical replication from Supabase to Neon is the
tool, which needs `wal_level = logical` on the Supabase side and a publication.
**Measure first**:

```sql
select schemaname, relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid))
  from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 30;
```

---

## 6. Connection model

```
Browser
  └─ HTTPS → Cloudflare Worker  (no database credentials, ever)
                └─ Hyperdrive binding  (pooling, TLS, query cache)
                      └─ Neon PostgreSQL
```

### What Hyperdrive is doing

A Worker isolate is short-lived and there can be thousands of them. Opening a
PostgreSQL connection per isolate would exhaust Neon's connection limit
immediately; PostgreSQL connections are processes, not sockets. Hyperdrive
holds a warm pool near the database, terminates TLS once, and hands the Worker
what looks like a direct connection. It also caches read query results, which
is off by default per query and has to be reasoned about rather than assumed -
a cached read of a draft post is a correctness bug, not a speedup.

### Rules the application code has to follow

- **Never construct a connection from a raw URL in a Worker.** The connection
  string comes from the Hyperdrive binding. A direct `DATABASE_URL` in Worker
  code defeats the pool and will exhaust Neon under load. This is the single
  most important line in this section, and it is the reason
  `lib/db/postgres/connection.ts` is one function rather than something callers
  can bypass.
- **`max: 5`.** A Worker invocation may hold at most six TCP connections.
- **One `postgres()` instance per isolate, reused.** Module scope, created
  lazily, never per request.
- **Transactions pin a connection.** Keep them short and never `await` an HTTP
  call inside one. Most of this codebase does not need explicit transactions
  because the atomic operations are already database functions - which is now
  an argument for keeping them.
- **Statement timeout at the database, not only in the client.** The 8-second
  fetch deadline in [lib/supabase/fetchTimeout.ts](../lib/supabase/fetchTimeout.ts)
  exists because a hung PostgREST call held a Vercel function open for 300
  seconds. The direct-SQL equivalent is `statement_timeout`, set on the role,
  plus a client-side deadline. Do not lose that lesson in the port.

### Local development

Hyperdrive is not required locally. `wrangler dev` supports a local connection
string for a Hyperdrive binding, so local development points straight at a
Neon branch (or a local PostgreSQL container). The `SqlExecutor` seam means a
test needs neither.

### Vercel during the transition

Vercel functions are Node, so `postgres` works there directly - but *without*
Hyperdrive, which means the pooling has to come from somewhere else. Two
options, and the choice matters:

- **Neon's own pooled endpoint** (`-pooler` in the hostname, PgBouncer in
  transaction mode). Correct for Vercel, and it means prepared statements must
  be disabled on that connection.
- **Hyperdrive from Vercel.** Not what it is for.

So during the transition the two runtimes get different connection strings,
which is why `DATABASE_URL` and `DATABASE_URL_DIRECT` are separate variables in
§7 rather than one.

---

## 7. Environment variables

### Current, classified

| Variable | Disposition |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | REMOVE AFTER AUTH + STORAGE MIGRATION (last of the three to go) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | REMOVE AFTER AUTH + STORAGE MIGRATION |
| `SUPABASE_SERVICE_ROLE_KEY` | REMOVE AFTER DB + STORAGE MIGRATION |
| `SUPABASE_SERVER_TIMEOUT_MS` | REMOVE AFTER DB MIGRATION - replaced by `statement_timeout` and a client deadline |
| `POST_QUERY_DEBUG` | KEEP - still the way to prove the memo holds |
| `ADMIN_EMAIL` | KEEP - the bootstrap admin, independent of the auth provider |
| `ADMIN_SECRET` | KEEP |
| `CRON_SECRET` | KEEP - the routes are unchanged; only the scheduler moves |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_SENDER_DOMAIN`, `EMAIL_PLATFORM_SENDER_DOMAIN`, `EMAIL_APP_URL` | KEEP - Resend stays |
| `EMAIL_FROM` | **REMOVE NOW.** Read nowhere in the codebase |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GEMINI_TOPIC_MODEL`, `GOOGLE_TTS_API_KEY` | KEEP |
| `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_MAILTO` | KEEP |
| `FEED_EXPOSURE_SIGNING_SECRET`, `POST_ENGAGEMENT_SIGNING_SECRET` | KEEP |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_DOMAIN`, `NEXT_PUBLIC_GA_MEASUREMENT_ID` | KEEP |
| `SITEMAP_QUERY_TIMEOUT_MS` | KEEP |
| `DAILY_BRIEF_DRY_RUN` | KEEP |
| `NEXT_PUBLIC_ENABLE_REALTIME` | REMOVE AFTER DB MIGRATION - Supabase Realtime has no successor here |
| `NEXT_PUBLIC_*_ENABLED` feature flags (7 of them) | KEEP, but see [database-access-inventory.md](database-access-inventory.md) §7 |

### New

| Variable | Phase | Notes |
|---|---|---|
| `DATABASE_ADAPTER` | **Now** | `supabase` (default) or `postgres`. Unset behaves as before |
| `DATABASE_URL` | DB migration | Pooled. On Vercel, Neon's `-pooler` endpoint. In a Worker this is **not read**: the connection string comes from the Hyperdrive binding |
| `DATABASE_URL_DIRECT` | DB migration | Unpooled, for migrations and DDL only. A different role from `DATABASE_URL` |
| `BETTER_AUTH_SECRET` | Auth migration | |
| `BETTER_AUTH_URL` | Auth migration | |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` | Storage migration | Five buckets today: `avatars`, `post-images`, `audio-summaries`, `research-documents`, `research-project-assets` |
| Hyperdrive binding (`wrangler.toml`) | Cloudflare | A binding, not an environment variable. Cloudflare only |

No secret values appear in this repository, and none should. `DATABASE_URL`
carries a password and belongs in the platform's secret store on both sides.

---

## 8. What is not in this phase

DNS, the production domain, removing Supabase, removing Vercel, Better Auth,
R2, deploying a Worker, dropping RLS, touching user ids, any destructive
migration, and any change to product code outside the post lookup.
