# Rollback, per layer

Every switch in this migration is an environment variable with a safe default,
and none of them needs a deploy to change behaviour beyond a redeploy of the
same commit. No rollback below requires editing code.

That is the good news, and it is not evenly distributed. Reads roll back
cleanly. Writes do not. The difference is the most important thing on this
page.

## The three switches

| Variable | Unset means | Migrated value | Governs |
|---|---|---|---|
| `READ_MIGRATED_DOMAINS` | every read uses PostgREST | comma list of domains | reads, per domain |
| `WRITE_DATABASE_ADAPTER` | writes go to Supabase | `postgres` | every write |
| `AUTH_ADAPTER` | Supabase Auth | `better-auth` | sessions and identity |
| `DATABASE_URL` | adapter cannot start | a connection string | which PostgreSQL the first two reach |

All three reject an unrecognised value by throwing at resolution rather than
falling back. A typo during a cutover is therefore a loud failure and not a
silent decision to stay put, which is the property that makes the rest of this
document trustworthy.

`DATABASE_URL` is not a feature flag but belongs in the table, because it
decides *which* database the migrated paths reach. Reads and writes share it.

## Reads: clean rollback, per domain

Remove the domain from `READ_MIGRATED_DOMAINS` and redeploy. That read returns
to PostgREST immediately.

Nothing else has to change, because a read has no effect to undo. The migrated
and unmigrated paths return the same shapes from the same database, which is
what the parity harnesses exist to prove, so a caller cannot tell which one
served it.

The list is per domain deliberately. Rolling back `search` does not disturb
`feed`, so a failure is contained to the domain that caused it. Set the
variable to the domains that should remain on, not to the one being removed.

**Rollback time:** one redeploy. **Data consequence:** none.

## Writes: rollback is only clean before the first write

Setting `WRITE_DATABASE_ADAPTER` back to `supabase` restores the previous write
path in one redeploy. The mechanism is as clean as the read switch.

The data is not. Every write that landed in Neon while the switch was on exists
only in Neon. Flipping back to Supabase does not move it, and Supabase has no
record of it. From the product's point of view those posts, comments and
bookmarks disappear.

So write rollback has two different costs depending on when it happens:

- **Before any write has landed**, during the freeze, immediately after the
  switch: free. Flip it back.
- **After writes have landed**: the flip is still one redeploy, but the
  divergence has to be reconciled by copying the new Neon rows back to
  Supabase, and nothing in this repository does that. Every minute of traffic
  makes it larger.

This is why the sequence puts the write switch inside the freeze, verifies it
against real rows, and only then unfreezes. The window where rollback is free
is the window where nobody is writing.

There is no version of this that makes a late write rollback cheap. Plan to
roll forward instead: fix the fault with writes still on Neon.

## Auth: clean rollback while both systems hold the same users

Set `AUTH_ADAPTER` back to unset and redeploy. `app/api/auth/[...all]/route.ts`
answers 404 unless the adapter is `better-auth`, so the Better Auth surface
disappears rather than lingering half-enabled.

Rollback is clean because the migration copies identities rather than moving
them: Supabase `auth.users` is left intact and untouched, the same UUIDs and
the same bcrypt hashes exist on both sides, and a member who can sign in to one
can sign in to the other.

Two consequences follow, and both are acceptable rather than free:

- **Sessions do not survive the switch, in either direction.** Better Auth
  cookies mean nothing to Supabase Auth and the reverse. Everyone signs in
  again. This was accepted as Session Cutover Option A.
- **Accounts created or changed after the cutover exist only in Better Auth.**
  Rolling back leaves those members unable to sign in until their rows are
  copied back. The same shape of problem as the write rollback, at a much
  smaller scale, and it starts the moment the first person registers.

Supabase auth data must stay readable until this rollback is retired. Do not
delete `auth.users` during decommission planning.

## Which rollback to reach for

| Symptom | Action |
|---|---|
| One domain returns wrong or missing data | remove that domain from `READ_MIGRATED_DOMAINS` |
| Several domains wrong | clear `READ_MIGRATED_DOMAINS` entirely |
| Reads fine, writes failing, freeze still on | set `WRITE_DATABASE_ADAPTER=supabase` |
| Reads fine, writes failing, traffic flowing | roll forward; late write rollback loses data |
| Sign-in broken for migrated members | unset `AUTH_ADAPTER` |
| Connection errors across everything | check `DATABASE_URL` before touching a flag |

## What rollback cannot fix

`DATABASE_URL` pointing at a database the parity harnesses never compared. The
harnesses compared the repositories against Supabase's own Postgres; pointing
the same code at Neon is a different claim, covered by
`node scripts/migration/neon-verify.mjs` and not by parity. Both have to be
green for the same target before a read cutover means anything.
