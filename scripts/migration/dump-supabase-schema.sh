#!/usr/bin/env bash
#
# Snapshot the Supabase schema for the Neon migration.
#
# Read-only. It connects to Supabase, writes files into scripts/migration/out/,
# and changes nothing. It does not connect to Neon at all.
#
# The output is a STARTING POINT, not a schema to apply. pg_dump will happily
# emit references to auth.users, grants to anon/authenticated/service_role, and
# pg_cron/pg_net objects, none of which exist on Neon. What to remove and what
# to replace it with is in docs/neon-migration-plan.md §5; the checks at the
# bottom of this script name every one of them so nothing is missed silently.
#
# Usage:
#   SUPABASE_DB_URL='postgresql://...' bash scripts/migration/dump-supabase-schema.sh
#
# Needs pg_dump and psql from a PostgreSQL client whose major version is at
# least the server's.

set -euo pipefail

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the Supabase connection string (direct, not pooled)}"

OUT="$(cd "$(dirname "$0")" && pwd)/out"
mkdir -p "$OUT"

echo "==> schema: public + private, no owners, no grants"
# --no-owner and --no-privileges drop the Supabase role names, which is the
# point: the grants are rewritten for one application role on the far side.
pg_dump "$SUPABASE_DB_URL" \
  --schema-only \
  --schema=public \
  --schema=private \
  --no-owner \
  --no-privileges \
  --no-publications \
  --no-subscriptions \
  --no-comments \
  > "$OUT/schema.sql"

echo "==> catalogue: the authoritative object lists"
# The migration files are cumulative and idempotent, so they are a good guide
# and a bad source of truth. These are the source of truth.
psql "$SUPABASE_DB_URL" -At -F$'\t' -c "
  select schemaname, tablename, policyname, cmd, roles::text, coalesce(qual,''), coalesce(with_check,'')
    from pg_policies
   where schemaname in ('public','private')
   order by schemaname, tablename, policyname
" > "$OUT/policies.tsv"

psql "$SUPABASE_DB_URL" -At -F$'\t' -c "
  select n.nspname, p.proname, p.prosecdef, pg_get_function_identity_arguments(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public','private')
   order by 1, 2
" > "$OUT/functions.tsv"

psql "$SUPABASE_DB_URL" -At -F$'\t' -c "
  select event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation
    from information_schema.triggers
   where event_object_schema in ('public','private')
   order by 1, 2, 3
" > "$OUT/triggers.tsv"

psql "$SUPABASE_DB_URL" -At -F$'\t' -c "
  select extname, extversion from pg_extension order by 1
" > "$OUT/extensions.tsv"

echo "==> sizes: decides dump-and-restore vs logical replication"
psql "$SUPABASE_DB_URL" -At -F$'\t' -c "
  select relname, n_live_tup, pg_total_relation_size(relid)
    from pg_stat_user_tables
   order by pg_total_relation_size(relid) desc
" > "$OUT/table-sizes.tsv"

echo "==> foreign keys that point outside public/private"
psql "$SUPABASE_DB_URL" -At -F$'\t' -c "
  select con.conrelid::regclass::text, con.conname, con.confrelid::regclass::text
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_class frel on frel.oid = con.confrelid
    join pg_namespace fnsp on fnsp.oid = frel.relnamespace
   where con.contype = 'f'
     and nsp.nspname in ('public','private')
     and fnsp.nspname not in ('public','private')
   order by 1, 2
" > "$OUT/external-foreign-keys.tsv"

echo
echo "==> things in schema.sql that CANNOT be applied to Neon as written"
FOUND=0
check() {
  local label="$1" pattern="$2"
  local n
  n=$(grep -Eci -- "$pattern" "$OUT/schema.sql" || true)
  if [ "${n:-0}" -gt 0 ]; then
    printf '  %-46s %s\n' "$label" "$n"
    FOUND=1
  fi
}
check "references to auth.*"            'auth\.(users|uid|role|jwt)'
check "grants to PostgREST roles"       '\b(anon|authenticated|service_role)\b'
check "pg_cron"                         '\bcron\.'
check "pg_net"                          '\bnet\.http|pg_net'
check "vault"                           '\bvault\.'
check "storage schema"                  '\bstorage\.'
check "realtime schema"                 '\brealtime\.'
check "supabase-owned extensions"       'create extension.*(pg_cron|pg_net|pg_graphql|supabase)'
check "leftover debate objects"         '\bdebate[_a-z]*\b'
check "webinar objects (verify rows!)"  '\bwebinar[_a-z]*\b'

if [ "$FOUND" -eq 0 ]; then
  echo "  none - which is surprising enough to double-check by hand"
fi

echo
echo "Wrote $OUT/"
echo "Next: docs/neon-migration-plan.md §5. Nothing has been applied anywhere."
