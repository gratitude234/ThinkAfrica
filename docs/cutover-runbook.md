# The cutover, as a sequence of commands

Every remaining step of the Supabase to Neon and Better Auth migration, in
order, with the check that decides whether to continue. Each step is reversible
by the rollback in `docs/cutover-rollback.md` unless it says otherwise.

Production is currently: reads and writes on Supabase PostgREST, auth on
Supabase Auth, deployed from `migration/neon-preview`, all migration flags
unset except `DATABASE_URL`, which points at the Supabase transaction-mode
pooler and is not yet read by anything.

**A note on `DATABASE_URL`.** It decides which PostgreSQL the migrated code
reaches, and reads and writes share it. Phase A moves the *transport* off
PostgREST while staying on the same Supabase database. Phase D moves the
*database* to Neon. Those are different cutovers and the evidence for one does
not transfer to the other.

---

## Step 0. Restore local database access

Supabase's connect dialog rotates the database password when it reveals a
connection string, so obtaining the pooler URL invalidated the copy in
`.env.local`. Every verification script below needs it.

In `.env.local`, set `SUPABASE_DB_URL` to the current connection string. Then:

```
node scripts/migration/supabase-health.mjs
```

Expect both halves to answer. Until they do, the drift check, the freeze check
and the final copy cannot run.

---

## Step 1. Search canary

```
npx vercel env add READ_BACKEND_HEADER production      # value: 1
npx vercel env add READ_MIGRATED_DOMAINS production    # value: search
npx vercel --prod
```

Check, against the production URL:

```
curl -sD - -o /dev/null "https://<production>/api/search?q=africa" | grep -iE "^HTTP|x-read-backend"
```

| Result | Meaning |
|---|---|
| `200` and `x-read-backend: postgres` | the canary is green, continue |
| `200` and `x-read-backend: supabase` | the flag did not take effect; the deploy did not pick it up |
| `503` and `x-read-backend: postgres` | the repository path is failing; read the function logs |

A 503 here with a `28P01` in the logs means `DATABASE_URL` carries the old
password. Re-add it with the current one rather than debugging search.

Also confirm results are not empty and that the page at `/search?q=africa`
renders them.

**Rollback:** remove `READ_MIGRATED_DOMAINS` and redeploy.

---

## Step 2. The remaining eight domains

Only when the canary is green.

```
npx vercel env rm READ_MIGRATED_DOMAINS production
npx vercel env add READ_MIGRATED_DOMAINS production
# value, one line:
# search,post-page,feed,comments,profile-page,viewer-state,dashboard,bookmarks,notifications
npx vercel --prod
```

Then walk the product signed in: home feed, a post with comments, a public
profile, search, dashboard, bookmarks, notifications. Watch the Vercel function
logs for errors while doing it.

**Rollback:** set the variable back to `search`, or remove it entirely. Reads
have no effect to undo, so this is free at any point.

At the end of this step: reads go through the repository layer to Supabase
PostgreSQL; writes and auth are untouched.

---

## Step 3. Freeze writes

```
npx vercel env add MIGRATION_WRITE_FREEZE production   # value: 1
npx vercel --prod
```

Verify, against production:

```
curl -s -o /dev/null -w "%{http_code}\n" "https://<production>/landing"
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://<production>/api/activation"
```

Expect `200` then `503`. Reading must still work and writing must not. Confirm
sign-in still works, which is deliberately exempt.

Then prove the freeze actually held:

```
node scripts/migration/freeze-check.mjs --window 120
```

Exit 0 means nothing moved in the window. It reports honestly that it can only
see inserts and deletes on the 35 tables without an update clock.

**Do not continue on a non-zero exit.** A leaked freeze is invisible in the
copy that follows.

---

## Step 4. Final copy to Neon

Writes must still be frozen.

```
node scripts/migration/reset-neon.mjs
node scripts/migration/copy-data.mjs
node scripts/migration/reset-sequences.mjs
node scripts/migration/verify-data.mjs
node scripts/migration/drift-check.mjs
```

`reset-sequences.mjs` is not optional. Sequences are not carried by any copy,
and a missed reset means the first insert after cutover collides with an
existing key.

Required from `drift-check.mjs`: zero drifted tables, zero rows absent, zero
rows extra, zero orphaned foreign keys.

Then confirm the repositories still agree with the database that will serve
them:

```
node scripts/migration/neon-verify.mjs
```

---

## Step 5. Move the database to Neon

```
npx vercel env rm DATABASE_URL production
npx vercel env add DATABASE_URL production             # value: the Neon pooled URL
npx vercel env add WRITE_DATABASE_ADAPTER production   # value: postgres
npx vercel --prod
```

Verify before unfreezing: the site reads correctly, and
`x-read-backend: postgres` still appears.

Then lift the freeze:

```
npx vercel env rm MIGRATION_WRITE_FREEZE production
npx vercel --prod
```

Now exercise real writes: create a draft, edit it, publish, comment, bookmark,
update a profile. After each, confirm the row exists in Neon and does **not**
exist in Supabase. Confirm a forbidden operation is still refused.

**Rollback is no longer free from here.** Reverting `WRITE_DATABASE_ADAPTER`
restores the old path in one redeploy, but rows written to Neon exist nowhere
else and nothing copies them back. Roll forward unless the failure is immediate
and nothing has been written.

---

## Step 6. Better Auth. Not a flag flip, and not yet buildable from here

**Setting `AUTH_ADAPTER=better-auth` in production today would change nothing,
silently.** That is the dangerous part: the site would keep working, on
Supabase Auth, while appearing to have cut over.

What exists is a rehearsal, and it says so in its own header: "Better Auth, for
the migration rehearsal. Not wired to anything yet." Three specifics:

- `lib/auth/viewer.ts` holds the only adapter branch, and nothing imports it.
- That branch calls `createRehearsalAuth`, which reads the Neon **scratch**
  database rather than production.
- `getCurrentUser()` in `lib/serverAuth.ts`, which is the real session gate,
  calls `supabase.auth.getUser()` unconditionally with no adapter branch.

The surface to move is 88 files and 111 auth calls: 97 `getUser`, 4
`verifyOtp`, 3 `getSession`, 2 `updateUser`, 2 `signOut`, and one each of
`signUp`, `signInWithPassword` and `exchangeCodeForSession`. Plus `proxy.ts`,
which builds a Supabase SSR client to refresh cookies and guard protected
routes.

So Step 6 is an implementation task, not a configuration step:

1. Give `betterAuth.ts` a production factory pointed at the production
   database, alongside the rehearsal one.
2. Branch `getCurrentUser()` on `resolveAuthAdapter()` so all 97 `getUser`
   callers move at once rather than individually.
3. Move the middleware's session refresh and route guarding behind the same
   branch.
4. Route sign-in, sign-up, sign-out, password reset and the code exchange to
   whichever adapter is active.
5. Only then run the final identity sync and flip the flag.

The identity sync itself is ready and can run whenever the database is stable:

```
node scripts/migration/auth-inventory.mjs
node scripts/migration/migrate-auth-to-better-auth.mjs
node scripts/migration/verify-identity-migrations.mjs
```

Expect user counts to match and UUIDs to be preserved. Nothing prints a hash.

Everyone is signed out by the eventual switch, in both directions. That was
accepted as Session Cutover Option A.

**Rollback, once it is wired:** remove `AUTH_ADAPTER` and redeploy. Supabase
`auth.users` is left intact by the migration, so both systems hold the same
identities. Accounts created after the switch exist only in Better Auth, so
that window is not free either.

---

## Step 7. Merge and deploy from main

Only when every gate above is green.

```
git checkout main
git merge --no-ff migration/neon-preview
git push origin main
```

The branch is a clean fast-forward of `main` with no divergence, so this
merges without conflict. Then set the Vercel production branch back to `main`
and deploy, so the CLI deployment stops being the production source.

---

## What must not happen

- No CDC. The freeze-and-recopy decision is recorded in
  `docs/neon-freshness-strategy.md` with the evidence.
- No deleting the Supabase project. Decommission-ready is the target, and
  `auth.users` has to stay readable while the auth rollback is live.
- No Cloudflare work.
