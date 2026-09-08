# Preview cutover and rollback

The migration preview runs a different stack from production, selected entirely
by branch-scoped environment variables. Nothing in the code decides; three
variables do, and each one can be reverted on its own.

## What the preview runs

| Variable | Preview (`migration/neon-preview`) | Production |
|---|---|---|
| `DATABASE_ADAPTER` | `postgres` — reads from Neon | unset → Supabase |
| `WRITE_DATABASE_ADAPTER` | `postgres` — writes to Neon | unset → Supabase |
| `AUTH_ADAPTER` | `better-auth` | unset → Supabase Auth |
| `DATABASE_URL` | Neon scratch, pooled | absent |
| `BETTER_AUTH_SECRET` | preview only | absent |
| `BETTER_AUTH_URL` | the branch alias | absent |

All six are scoped to `Preview` **and** the branch. No other preview branch
sees them, and Production has none of them.

## Why reads and writes have separate switches

They carry different risk. A read served from the wrong database shows stale
content and is fixed by switching back. A write sent to the wrong database is a
row that exists in one place and not the other, and switching back does not
repair it: the row stays where it landed.

So `WRITE_DATABASE_ADAPTER` exists separately from `DATABASE_ADAPTER`, and the
preview spent a whole sprint reading from Neon while still writing to Supabase
before writes moved at all. That ordering is the rollback boundary: writes can
be reverted without touching reads.

## Rollback, per layer

Each is one command and a redeploy. None touches Production, and none requires
a code change.

**Writes back to Supabase** (the one to reach for first):

```
vercel env rm WRITE_DATABASE_ADAPTER preview migration/neon-preview --yes \
  --scope gratitude-builds1
```

Unset means Supabase, so removing the variable is the rollback. Rows already
written to Neon stay there; they are scratch data and nothing in production
refers to them.

**Auth back to Supabase:**

```
vercel env rm AUTH_ADAPTER preview migration/neon-preview --yes \
  --scope gratitude-builds1
```

`/api/auth/*` and `/preview-auth` return to answering 404, and the preview uses
the same Supabase Auth production does. Better Auth sessions on Neon become
inert; nobody has to be signed out, because those sessions only ever existed on
the preview.

**Reads back to Supabase:**

```
vercel env rm DATABASE_ADAPTER preview migration/neon-preview --yes \
  --scope gratitude-builds1
```

**All three at once**, which is the whole preview reverted to production's
stack on the same branch:

```
for v in WRITE_DATABASE_ADAPTER AUTH_ADAPTER DATABASE_ADAPTER; do
  vercel env rm "$v" preview migration/neon-preview --yes --scope gratitude-builds1
done
```

Then redeploy the branch so the change takes effect:

```
vercel redeploy <latest preview url> --scope gratitude-builds1
```

A variable change does not affect a deployment that is already built. Vercel
snapshots the environment at build time, so the currently-live preview keeps
whatever it was built with until it is rebuilt.

## What rollback does not do

- It does not touch Production. Production has none of these variables, so
  removing them changes nothing there.
- It does not delete anything from Neon. The scratch database keeps whatever
  the rehearsal wrote; it is scratch.
- It does not touch Supabase Auth. The 263 users, their sessions and their
  passwords are untouched by everything in this sprint: the migration read
  Supabase and wrote only to Neon.

## The session decision, recorded

At the eventual production cutover, Supabase sessions are **not** migrated.
Better Auth cannot read a Supabase session token and there is nothing to
translate, so everyone signs in once more with the password they already have.
No password is reset. Dual-auth was considered and rejected: running two
session validators against two databases, with every request deciding which is
authoritative, is the highest-risk shape in the migration, and the manual
alternative for 263 people is a single login.
