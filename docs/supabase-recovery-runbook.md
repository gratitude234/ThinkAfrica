# The sequence to run when Supabase comes back

Everything that could be prepared offline has been. What remains is seven
steps, in order, and **none of them enables anything**. The last step is a
report and a decision that a person makes.

Nothing here touches Production configuration, DNS, storage or auth.
`READ_MIGRATED_DOMAINS` stays unset throughout.

---

## Step 0 — is it actually back?

```bash
node scripts/migration/supabase-health.mjs
```

Two halves, and they have been failing independently. PostgREST answers over
HTTPS; Postgres answers through Supavisor. Every parity comparison needs both,
so either being down means every domain is BLOCKED.

Exit `0` means go. Exit `2` means wait.

**State at the time of writing:** PostgREST is `ANSWERING (HTTP 401)` in under
a second, which is a real change from the 90–307 second timeouts and gateway
error pages seen earlier in this work. Supavisor is still refusing with
`EAUTHQUERY: connection to database not available`. So one half has come back
and one has not.

---

## Step 1 — apply the identity migrations

In this order. Each is a single transaction with a lock timeout.

```
supabase/migrations/20260909000001_parameterize_identity_rpcs.sql
supabase/migrations/20260910000001_private_profile_explicit_user.sql
supabase/migrations/20260910000002_drop_superseded_public_identity_overloads.sql
```

The first two are additive. The third is destructive by design and is a no-op
on production: every statement is `IF EXISTS`, and production has none of the
signatures it names. It exists because **the Neon scratch database has the
earlier, insecure draft applied**, and so would any environment that ran it.

Read `docs/read-migration-rpc-blockers.md` first if the reason is not fresh.

---

## Step 2 — verify the catalogue and the grants

Refresh the catalogue, because it is a snapshot and the whole project treats it
as the source of truth rather than `supabase/migrations/`:

```bash
node scripts/migration/measure-supabase.mjs
```

Then check four things. The queries are written out in the VERIFICATION section
of `20260910000002`.

1. No `public` function named `assert_identity_claim`, and no explicit-id
   overload of the six in `public`.
2. All six zero-argument wrappers still present, plus
   `get_my_profile_private()`. Dropping one of these would be an outage.
3. Every implementation present in `private`.
4. `authenticated` and `anon` have neither `EXECUTE` on any implementation nor
   `USAGE` on `private`.

The fourth is the security model. The other three are the compatibility
promise.

---

## Step 3 — identity RPC parity

```bash
DATABASE_URL="<neon scratch>" npx vitest run \
  supabase/migrations/identityRpcSecurity.neon.test.ts
```

This already passes against the scratch database and should keep passing after
the migrations are applied there for real rather than inside a rolled-back
transaction.

For production, the comparison that matters is the same projection through both
paths for the same member: the zero-argument wrapper as that member, and the
private implementation with their id. The test does exactly this and compares
column for column. Nothing from the projection is printed; it contains a signup
address.

---

## Step 4 — all live same-database parity

```bash
node scripts/migration/parity-all.mjs
```

Nine domains, one run, a verdict each. It probes both halves first and refuses
to compare anything if either is down.

Individually, if one needs re-running:

```bash
node scripts/migration/postpage-parity.mjs
node scripts/migration/feed-parity.mjs
node scripts/migration/profile-parity.mjs
node scripts/migration/search-parity.mjs
node scripts/migration/comments-parity.mjs
node scripts/migration/viewerstate-parity.mjs
node scripts/migration/viewerdomains-parity.mjs
```

---

## Step 5 — read the verdicts properly

`PASS` means every comparison in that harness agreed.

`PASS (partial)` applies to the three viewer-scoped domains and is **not** a
full pass. Dashboard, bookmarks and notifications read through an authenticated
session, and a harness cannot mint one: a user JWT needs the project's JWT
secret, and the service-role key is not it. Those harnesses compare the reads
whose own `WHERE` clause expresses the policy and report the rest `BLOCKED` by
name. The census printed at the start says how many production rows the
blocked comparisons could differ on.

`FAIL` means investigate before anything else. A difference is a difference in
the query, because both sides read the same rows at the same instant.

Two known differences that are **not** bugs, both recorded in
`docs/dashboard-known-semantics.md`:

- **`reviewed_at` is FIXED.** The migrated read differs from production before
  the fix, deliberately. Both transports now run the corrected select.
- **The bookmark stat is NOT fixed.** Both transports must agree exactly. If a
  service-role comparison shows more rows on the PostgREST side, that is the
  harness lacking a session, not the code.

---

## Step 6 — report, and stop

Record per domain: `PASS`, `PASS (partial)`, `FAIL` or `BLOCKED`.

**Do not set `READ_MIGRATED_DOMAINS`.** Green parity is evidence for a
decision, not the decision. Activation is a separate, deliberate step taken by
a person who has read the verdicts, and it happens one domain at a time.

---

## What this sequence does not do

Not in scope, and not to be started as a consequence of parity passing:

- the final Neon sync
- maintenance mode
- switching Production reads or writes
- the Better Auth Production cutover
- R2
- Cloudflare
- DNS

## Still open after this sequence

- **Eleven client components read the database from the browser.** Listed under
  `BROWSER_READ` by `node scripts/migration/read-registry.mjs`. RLS makes them
  safe today and has no successor. Cutover-blocking, and unaffected by parity.
- **`get_my_profile_private` has no parameterised caller yet.** The migration
  creates the implementation; wiring the repositories to it is a separate
  change, gated on Step 2 verifying.

## Why a parity domain sometimes reports BLOCKED

`parity-all.mjs` occasionally records a domain, usually `post-page`, as BLOCKED
with a transport failure. Measured 2026-09-11, this is a fault on the machine
running the harness, not on Supabase.

Requests to PostgREST were issued in batches at increasing parallelism:

| Parallelism | Succeeded | Failed |
|---|---|---|
| 1 | 4 | 0 |
| 2 | 8 | 0 |
| 5 | 18 | 2 |
| 10 | 39 | 1 |
| 20 | 79 | 1 |

The failures are `ERR_SSL_TLSV1_ALERT_DECRYPT_ERROR`,
`ERR_SSL_SSL/TLS_ALERT_ILLEGAL_PARAMETER` and `UND_ERR_SOCKET`. Those are TLS
record and handshake failures, and some connections fail while others opened at
the same instant succeed, which is not a shape a server produces: TLS
termination at Supabase would fail consistently or not at all. It is the
signature of something on this side decrypting and re-encrypting the
connection, which is what endpoint security software and corporate proxies do.

Two further observations point the same way. The system resolver is a stub at
`127.0.0.1` that refuses direct DNS queries while Cloudflare and Google answer
the same names instantly, and the one `getaddrinfo ENOTFOUND` seen during a
parity run is consistent with that stub. A sequential burst of thirty requests
had no failures at all, median latency 210ms.

What this means in practice:

- It does **not** affect production. Vercel reaching Supabase does not traverse
  this machine's TLS stack.
- It does **not** invalidate a PASS. A domain that passed, passed.
- It **does** mean a BLOCKED verdict should be re-run rather than investigated,
  and that is why BLOCKED exits 2 and is reported separately from FAIL.
- `post-page` is affected most because it issues the most requests, so it has
  the most chances to hit a failure. Which of its reads fails changes every run.
