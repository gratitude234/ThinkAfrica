# Migration audit scripts

One-off tooling for the Neon migration. Not part of the app build, not
imported by anything, not run in CI. They read the repository and write JSON
next to themselves.

```bash
node scripts/audit/dbAudit.mjs     # -> db-audit.json   every database call site
node scripts/audit/rlsAudit.mjs    # -> rls-audit.json  every live RLS policy
node scripts/audit/fnAudit.mjs     # -> fn-audit.json   every database function
node scripts/audit/report.mjs loc  # human-readable slices: loc | browser | writes | service | summary
```

The findings are written up in
[docs/database-access-inventory.md](../../docs/database-access-inventory.md).

## What these are worth

Static analysis over source text. A floor, not a ceiling, and the two limits
matter enough to repeat here:

- **A name held in a variable is invisible.** Every `.from()` in this
  repository names its table as a literal, which is why this works at all.
  `admin.storage.from(BUCKET)` is the exception, and storage sites are
  therefore recorded with an unresolved target rather than dropped.
- **`supabase/` is the migration history, not the database.** The files are
  cumulative and idempotent, so `rlsAudit.mjs` and `fnAudit.mjs` replay them in
  order, applying `DROP POLICY` and `DROP TABLE` as they go, and keep the last
  definition. That reconstruction is good enough to plan against and not good
  enough to migrate against. Before any schema moves, read the real lists off
  the database with
  [scripts/migration/dump-supabase-schema.sh](../migration/dump-supabase-schema.sh).

The JSON files are committed so a reviewer can diff the inventory when the code
changes, rather than having to trust a number in a document.
