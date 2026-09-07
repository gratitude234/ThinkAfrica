# The Supabase to Neon schema transformation

How the application schema is taken off Supabase and put onto Neon, what could
not move unchanged, and what has to exist before each of those things can come
back.

Phase 3. Production is unchanged throughout: everything here runs against a
Neon **scratch** database, and Supabase is only ever read.

---

## 1. The pipeline

Five commands, in order, each idempotent and each safe to re-run:

```bash
node scripts/migration/check-connections.mjs   # all three databases, read-only
node scripts/migration/measure-supabase.mjs    # sizes and catalogue, read-only
node scripts/migration/dump-schema.mjs         # -> out/schema.raw.sql
node scripts/migration/transform-schema.mjs    # -> out/schema.neon.sql + manifest
node scripts/migration/apply-schema.mjs        # preflight A, schema, preflight B
node scripts/migration/copy-data.mjs           # -> out/data.sql, loaded
node scripts/migration/reset-sequences.mjs
node scripts/migration/verify-schema.mjs
node scripts/migration/verify-data.mjs
node scripts/migration/parity-check.mjs
node scripts/migration/preview-check.mjs
```

`reset-neon.mjs --yes` returns the scratch database to empty. The pipeline is
built to be run from empty rather than patched: a database reached by manual
repair is one nobody can reproduce, which is the thing Phase 3 exists to rule
out.

Everything reads `.env.local` through `scripts/migration/env.mjs`. No
connection string is ever passed on a command line, printed, or logged; `psql`
and `pg_dump` receive them through libpq environment variables, which are
visible to the process and not to the process list.

---

## 2. Getting to Supabase at all

`db.<ref>.supabase.co` publishes **only an AAAA record**. A machine without
IPv6 egress cannot resolve it, and the failure is `ENOTFOUND` from the
resolver, which looks like a wrong hostname rather than a missing route. This
machine has one link-local IPv6 address and no route: even `cloudflare.com`
over IPv6 is `ENETUNREACH`.

The IPv4 path is Supavisor, Supabase's pooler. `resolveSupabaseUrl()` uses the
direct host when it resolves and falls back to Supavisor when it does not, so
the same command works on a dual-stack machine and on this one.

Two details that are not optional:

- **Session mode, port 5432.** Transaction mode (6543) reuses a backend
  between statements, which breaks `pg_dump` and anything depending on session
  state. Every use here is a dump or a catalogue read.
- **The username becomes `postgres.<ref>`.** Supavisor routes to a tenant by
  username rather than by host, which is also how the region is discovered:
  each regional pooler is asked whether it knows the tenant, and exactly one
  says yes. The result is cached in `out/pooler-host.json`;
  `SUPABASE_POOLER_HOST` skips discovery.

---

## 3. What the transformation changes

`transform-schema.mjs` applies four named rules to the raw dump and records
every object it touches in `out/MANIFEST.md`. **17 objects changed: 9 removed,
8 rewritten.** Nothing is hand-edited.

The dump is already narrowed by `--schema=public --schema=private` and already
free of Supabase's role grants by `--no-owner --no-privileges`. What remains is
the places where application objects reach *into* provider-owned schemas.

### Removed: the scheduler (6 functions)

`private.dispatch_indegenius_cron`, `install_indegenius_cron_jobs`,
`remove_indegenius_cron_jobs`, `inspect_indegenius_cron_jobs`,
`prune_indegenius_cron_history`, `reconcile_indegenius_cron_http_requests`.

Their bodies read `pg_cron`, `pg_net` and `vault`. Neon has none of the three,
so the restore fails on the function body rather than at first use.

**Replacement**: Cloudflare Cron Triggers calling the same `/api/cron/*`
routes over HTTPS, with `CRON_SECRET` as a Worker secret. The routes are
unaffected; only the thing that calls them moves. The reconciliation function
has no successor and needs none: it exists because `pg_net` dispatches
asynchronously and the response lands later, and an HTTP call from a Worker is
synchronous.

`private.cron_http_requests` keeps its **schema** but not its **data**: nothing
on Neon writes it, and it is the only table that grows during a copy, which
made verification non-deterministic. See `scripts/migration/policy.mjs`.

### Replaced with a stub that raises: `list_broadcast_contact_emails`

It reads `auth.users`. It is **not** left returning an empty set, because
[CLAUDE.md](../CLAUDE.md) records exactly why that would be worse: an empty
audience syncs successfully and mails nobody. On Neon it raises
`feature_not_supported` until it is rewritten against the Better Auth user
table.

### Removed: three foreign keys to `auth.users`

`profiles_id_fkey`, `activation_events_user_id_fkey`,
`saved_opportunities_user_id_fkey`.

The columns keep their UUIDs untouched, which is the point: those are the same
values `auth.users` holds, so each key is re-addable against the Better Auth
user table without a backfill. The `ON DELETE` behaviour of each is recorded in
the manifest so it can be restored exactly.

### Re-qualified: five column defaults

`extensions.uuid_generate_v4()` becomes `public.uuid_generate_v4()`. Supabase
installs extensions into a dedicated `extensions` schema; the preflight
installs `uuid-ossp` into `public`.

### Made idempotent: two `CREATE SCHEMA` statements

The preflight creates `public` and `private` first, so a bare `CREATE SCHEMA`
aborts the restore on its first statement.

---

## 4. What the transformation deliberately does NOT change

**178 `auth.uid()` and 26 `auth.role()` call sites stay exactly as they are.**

Rewriting them here would be a regex pass over generated SQL touching every
authorization rule in the product at once, in a step nobody reviews line by
line. Instead the schema gains a two-function `auth` compatibility shim:

```sql
CREATE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT public.app_user_id() $$;
CREATE FUNCTION auth.role() RETURNS text AS $$
  SELECT CASE WHEN public.app_user_id() IS NULL THEN 'anon' ELSE 'authenticated' END
$$;
```

`public.app_user_id()` reads a transaction-local `app.user_id` setting that
**nothing currently sets**. So on Neon:

- every owner-scoped policy **denies** rather than matching rows,
- every `auth.role() = 'authenticated'` policy **denies**,
- every `SECURITY DEFINER` function guarding on a null uid **raises**.

Failing closed is the point. The shim exists so the migrated SQL still parses
and still refuses, not so that it still grants. Application-level
authorization, which Phase 2 made primary, is what admits a request.

This is not Supabase's `auth` schema. It is two functions, no tables, and the
schema comment says so.

### The pooling hazard, stated once

`app.user_id` must be set with `set_config(..., true)` inside an explicit
transaction, so it is discarded at COMMIT. A **session**-scoped setting on a
pooled connection is handed to whichever request gets that connection next,
which would give one member another member's identity. Under Hyperdrive, which
pools in transaction mode, that is not a theoretical risk.

**Nothing in the application sets it today, and Phase 3 deliberately did not
start.** Adopting it is a design task with its own review, not a side effect of
a schema copy.

### PostgREST role placeholders

35 policies name `authenticated` or `anon` in their `TO` clause. That is part
of the policy definition, not a privilege, so `--no-privileges` does not strip
it and the restore aborts on the first one.

They are created as `NOLOGIN NOINHERIT` with no grants. The alternative,
re-pointing `TO authenticated` at `indegenius_app`, looks more "working" and is
worse: it silently changes who 35 rules cover, in a generated file. As created,
the policies match no role that can connect, so they neither grant nor
obstruct. Combined with `auth.uid()` returning NULL, the schema's RLS is
**inert but intact**: preserved for inspection and for the eventual rewrite,
relied upon for nothing.

---

## 5. Two bugs this phase found that no unit test could

Both were found by running the real application against Neon, and both come
from the same root: `fetch_types: false`, the option Cloudflare recommends for
Hyperdrive, stops postgres.js asking the server for type OIDs.

### Array parameters

`p.status = any($2::text[])` with the statuses passed as a JS array. With no
type information postgres.js sends `published,pending,pending_revision,draft`
as text, Postgres reports `malformed array literal`, and **every post page
500s**.

Fixed by naming one placeholder per status, derived from
`VISIBLE_POST_STATUSES` so the SQL and the parameters cannot disagree about how
many there are. No array serialisation, no type inference.

### Array results

`p.tags` is `text[]`. The same missing type information means it arrives as the
literal string `{governance,energy}`, `PostTags` calls `.map()` on it, and the
article body fails to render **inside a Suspense boundary** — so the page still
returns HTTP 200, three quarters empty, with a `TypeError` visible only in the
server log.

Fixed by selecting `to_jsonb(p.tags)`, which postgres.js parses without any OID
lookup, plus a `toStringArray()` normaliser in the mapper so a future change to
the driver options cannot silently reintroduce it.

**The lesson worth keeping**: the parity harness reported 12/12 while the real
runtime was returning broken pages, because it built its own postgres.js client
with different options. It now imports `POSTGRES_POOL_OPTIONS` from the
application. A harness that configures its own client is testing a driver the
application never uses.

---

## 6. Verification

| Check | Result |
|---|---|
| Object parity | tables 80/80, indexes 268/268, triggers 40/40, policies 151/151, views 5 (+2 extension views), functions 138 (+31 extension functions, 6 removed by manifest), FK constraints 129 → 126 (3 removed by manifest) |
| Provider schemas imported | none |
| Foreign keys leaving public/private | none |
| `indegenius_app` owns | nothing, so RLS applies to it |
| `indegenius_app` statement timeout | 8s |
| `indegenius_app` access to `private` | none |
| RLS enabled | same tables as Supabase |
| Row counts and digests | 36,668 rows across 79 tables, all matching by count, primary-key digest and whole-row digest |
| `profiles.id` | 256 UUIDs, byte-for-byte identical |
| Foreign key integrity | 126 constraints revalidated, 0 invalid |
| Adapter parity | 12/12 slugs behaviourally identical |
| Live preview | 12/12 pages identical, one core query per render, 0 errors |

The +31 functions and +2 views on Neon are `uuid-ossp` and
`pg_stat_statements` landing in `public` rather than in a separate
`extensions` schema. They are reported, not failed.
