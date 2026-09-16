# Neon migration runbook

Everything here reads `.env.local` through `env.mjs`. No connection string is
ever passed on a command line, printed or logged: `psql` and `pg_dump` receive
them through libpq environment variables, which are visible to the process and
not to the process list.

**Supabase is only ever read.** The one destructive script, `reset-neon.mjs`,
refuses any host that is not `*.neon.tech`.

Written up in [docs/neon-schema-transformation.md](../../docs/neon-schema-transformation.md).

## The pipeline

```bash
node scripts/migration/check-connections.mjs    # all three, read-only
node scripts/migration/measure-supabase.mjs     # sizes + catalogue, read-only
node scripts/migration/check-pending-state.mjs  # which release candidates are live

node scripts/migration/reset-neon.mjs --yes     # scratch back to empty
node scripts/migration/dump-schema.mjs          # -> out/schema.raw.sql
node scripts/migration/transform-schema.mjs     # -> out/schema.neon.sql + MANIFEST.md
node scripts/migration/apply-schema.mjs         # preflight A, schema, preflight B
node scripts/migration/copy-data.mjs            # -> out/data.sql, loaded
node scripts/migration/reset-sequences.mjs

node scripts/migration/verify-schema.mjs        # object parity + security posture
node scripts/migration/verify-data.mjs          # row counts, digests, FK integrity
node scripts/migration/parity-check.mjs         # both adapters, same slugs
node scripts/migration/preview-check.mjs        # both adapters, real pages
node scripts/migration/test-identity-rpcs.mjs   # the six parameterised RPCs
```

Every step is idempotent and safe to re-run. The pipeline is built to be run
from empty rather than patched: a database reached by manual repair is one
nobody can reproduce.

## Credentials

| Variable | What | Used by |
|---|---|---|
| `SUPABASE_DB_URL` | The Supabase PostgreSQL URI. The direct host is IPv6-only, and `env.mjs` falls back to Supavisor session mode automatically when the machine has no IPv6 | measurement, dumps |
| `DATABASE_URL` | Neon **scratch**, pooled endpoint | parity, preview |
| `DATABASE_URL_DIRECT` | Neon **scratch**, unpooled. DDL and data loading only | preflight, schema, data, verification |
| `SUPABASE_POOLER_HOST` | Optional. Skips Supavisor region discovery | measurement, dumps |
| `PGBIN` | Optional. Directory holding `pg_dump` and `psql` if they are not on PATH and not in a standard install root | dumps, schema apply |

The parity check additionally reads `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`, both already in `.env.local`.

## The files

| File | What it does | Touches production? |
|---|---|---|
| `env.mjs` | Loads `.env.local`, finds `pg_dump`/`psql`, resolves the Supabase endpoint, redacts errors | no |
| `pg.mjs` | Runs `psql`/`pg_dump` with the connection in libpq env vars | no |
| `policy.mjs` | Decisions more than one script has to agree on, currently the tables whose data is excluded | no |
| `check-connections.mjs` | `current_database()` and `version()` on all three; stops if Neon is unexpectedly populated | reads Supabase |
| `measure-supabase.mjs` | Sizes, row counts, policies, functions, triggers, views, extensions, external foreign keys, storage buckets. Recommends dump-restore or logical replication | reads Supabase |
| `check-pending-state.mjs` | Which `supabase/pending/` candidates are actually live | reads Supabase |
| `dump-schema.mjs` | `pg_dump --schema-only` of `public` and `private` | reads Supabase |
| `transform-schema.mjs` | Four named rules, a manifest, and a guard that fails if any provider reference survives | no |
| `neon-preflight.sql` | Part A before the schema, Part B after, plus five verification queries | Neon only |
| `apply-schema.mjs` | Runs A, the schema, then B, in order | Neon only |
| `copy-data.mjs` | `pg_dump --data-only`, loaded in one transaction with user triggers off and foreign keys deferred | reads Supabase, writes Neon |
| `reset-sequences.mjs` | Sets every sequence past its column's maximum; checks `citation_sequences` separately | Neon only |
| `reset-neon.mjs` | Drops and recreates `public`, `private`, `auth`. Refuses anything not `*.neon.tech` | Neon only |
| `verify-schema.mjs` | Object parity against Supabase, plus the security posture the preflight establishes | reads both |
| `verify-data.mjs` | Row counts, primary-key digests, whole-row digests, `profiles.id` exactly, every FK revalidated | reads both |
| `parity-check.mjs` | Wraps `lib/db/parity.live.test.ts`: the same slugs through both adapters | reads both |
| `preview-check.mjs` | Both adapters serving real pages concurrently, compared on visible text | reads both |
| `test-identity-rpcs.mjs` | Applies and exercises the parameterised identity RPCs | Neon only |

## Two things worth knowing before you start

**The Supabase direct host is IPv6-only.** `db.<ref>.supabase.co` publishes no
A record. On a machine without IPv6 the failure is `ENOTFOUND`, which reads
like a wrong hostname rather than a missing route. `env.mjs` detects this and
falls back to Supavisor session mode (port 5432, username `postgres.<ref>`),
discovering the region once and caching it in `out/pooler-host.json`.

**`out/` is gitignored.** It holds schema dumps and catalogue extracts from the
live database. Table names are harmless; a dump is a copy of the production
schema and does not belong in version control.
