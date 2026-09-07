/**
 * Exercises Better Auth against Neon scratch: signup, login, session, logout,
 * and the two failure cases that matter.
 *
 *   node scripts/migration/better-auth-rehearsal.mjs
 *
 * Neon scratch only. Every account it creates is synthetic, uses a reserved
 * `.invalid` domain so no address can ever be real, and is deleted at the end
 * whether the run passes or fails.
 *
 * ## The one thing this cannot do, and what it does instead
 *
 * Proving that a *migrated* member can log in needs that member's plaintext
 * password, which nobody has and nobody should. So the hash path is proven
 * structurally and then behaviourally, without any real credential:
 *
 *   1. A password is chosen here and hashed with bcrypt at Supabase's cost,
 *      producing a `$2a$` hash of exactly the shape the 263 migrated rows
 *      have.
 *   2. That hash is written into a synthetic user's credential account by the
 *      same statement the migration uses.
 *   3. Better Auth is asked to sign that user in.
 *
 * If step 3 succeeds, Better Auth verifies Supabase-shaped bcrypt hashes it
 * did not create, which is exactly the claim the migration depends on. The
 * remaining gap is whether the 263 real hashes are the hashes Supabase
 * actually stored, and the migration script already proves that by comparing
 * fingerprints on both sides.
 */
import bcrypt from "bcryptjs";
import postgres from "postgres";

import { loadEnv, requireUrl } from "./env.mjs";

loadEnv();

const neonUrl = requireUrl("DATABASE_URL");
if (!new URL(neonUrl).hostname.endsWith(".neon.tech")) {
  console.error("REFUSED: DATABASE_URL does not point at Neon.");
  process.exit(2);
}

process.env.BETTER_AUTH_SECRET ??= "rehearsal-only-secret-not-used-in-production";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

const { betterAuth } = await import("better-auth");
const { Pool } = await import("pg");

const pool = new Pool({ connectionString: neonUrl, max: 3 });

const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    password: {
      hash: async (password) => bcrypt.hash(password, 10),
      verify: async ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },
  user: {
    additionalFields: {
      userMetadata: { type: "json", required: false, input: false },
      appMetadata: { type: "json", required: false, input: false },
      invitedAt: { type: "date", required: false, input: false },
      lastSignInAt: { type: "date", required: false, input: false },
    },
  },
});

const sql = postgres(neonUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  onnotice: () => {},
});

// `.invalid` is reserved by RFC 2606 and can never be delivered to.
const STAMP = Date.now().toString(36);
const NEW_EMAIL = `rehearsal-new-${STAMP}@indegenius.invalid`;
const MIGRATED_EMAIL = `rehearsal-migrated-${STAMP}@indegenius.invalid`;
const PASSWORD = `rehearsal-${STAMP}-Aa1!`;
const MIGRATED_ID = `00000000-0000-4000-8000-${STAMP.padStart(12, "0").slice(-12)}`;

const results = [];
function check(label, passed, detail = "") {
  results.push({ label, passed });
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
}

try {
  console.log("\nBetter Auth rehearsal against Neon scratch.\n");

  // ── 1. Signup ────────────────────────────────────────────────────
  const signUp = await auth.api.signUpEmail({
    body: { email: NEW_EMAIL, password: PASSWORD, name: "Rehearsal Account" },
    asResponse: true,
  });
  check("signup creates a Better Auth user", signUp.status === 200, `HTTP ${signUp.status}`);

  const [created] = await sql`
    select "id", "emailVerified" from "user" where "email" = ${NEW_EMAIL}
  `;
  check("the new user row exists", Boolean(created));

  const [newAccount] = await sql`
    select "providerId", "password" is not null as has_password
    from "account" where "userId" = ${created?.id ?? ""}
  `;
  check(
    "signup stored a credential account with a password",
    newAccount?.providerId === "credential" && newAccount?.has_password === true
  );

  const [newHash] = await sql`
    select substring("password" from 1 for 4) as prefix
    from "account" where "userId" = ${created?.id ?? ""}
  `;
  check(
    "new passwords are bcrypt, not scrypt",
    String(newHash?.prefix ?? "").startsWith("$2"),
    `prefix ${newHash?.prefix}`
  );

  // ── 2. Login ─────────────────────────────────────────────────────
  const signIn = await auth.api.signInEmail({
    body: { email: NEW_EMAIL, password: PASSWORD },
    asResponse: true,
  });
  check("login succeeds for a Better Auth account", signIn.status === 200, `HTTP ${signIn.status}`);

  const cookie = signIn.headers.get("set-cookie");
  check("login sets a session cookie", Boolean(cookie));

  const [sessionRow] = await sql`
    select count(*)::int as count from "session" where "userId" = ${created?.id ?? ""}
  `;
  check("a session row was created", (sessionRow?.count ?? 0) > 0);

  // ── 3. Session lookup ────────────────────────────────────────────
  const session = await auth.api.getSession({
    headers: new Headers({ cookie: cookie ?? "" }),
  });
  check("the session resolves to the right user", session?.user?.email === NEW_EMAIL);

  // ── 4. Invalid password ──────────────────────────────────────────
  const wrong = await auth.api
    .signInEmail({
      body: { email: NEW_EMAIL, password: "not-the-password" },
      asResponse: true,
    })
    .catch((error) => ({ status: error?.statusCode ?? 401 }));
  check("an invalid password is refused", wrong.status !== 200, `HTTP ${wrong.status}`);

  // ── 5. Duplicate email ───────────────────────────────────────────
  const duplicate = await auth.api
    .signUpEmail({
      body: { email: NEW_EMAIL, password: PASSWORD, name: "Duplicate" },
      asResponse: true,
    })
    .catch((error) => ({ status: error?.statusCode ?? 422 }));
  check("a duplicate email is refused", duplicate.status !== 200, `HTTP ${duplicate.status}`);

  // ── 6. A Supabase-shaped bcrypt hash, verified by Better Auth ────
  // Written by the same statement the migration uses, with a $2a$ hash of the
  // shape all 263 migrated rows carry.
  const supabaseShaped = (await bcrypt.hash(PASSWORD, 10)).replace(/^\$2b\$/, "$2a$");
  check("the synthetic hash is Supabase-shaped", supabaseShaped.startsWith("$2a$"));

  await sql`
    insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
    values (${MIGRATED_ID}, ${"Migrated Rehearsal"}, ${MIGRATED_EMAIL}, ${true}, now(), now())
    on conflict ("id") do nothing
  `;
  await sql`
    insert into "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
    values (${`credential:${MIGRATED_ID}`}, ${MIGRATED_ID}, ${"credential"}, ${MIGRATED_ID},
            ${supabaseShaped}, now(), now())
    on conflict ("id") do update set "password" = excluded."password"
  `;

  const migratedLogin = await auth.api
    .signInEmail({
      body: { email: MIGRATED_EMAIL, password: PASSWORD },
      asResponse: true,
    })
    .catch((error) => ({ status: error?.statusCode ?? 500 }));
  check(
    "Better Auth verifies a Supabase-shaped $2a$ hash it did not create",
    migratedLogin.status === 200,
    `HTTP ${migratedLogin.status}`
  );

  const migratedWrong = await auth.api
    .signInEmail({
      body: { email: MIGRATED_EMAIL, password: "still-not-the-password" },
      asResponse: true,
    })
    .catch((error) => ({ status: error?.statusCode ?? 401 }));
  check("and refuses the wrong password against that hash", migratedWrong.status !== 200);

  // ── 7. Logout ────────────────────────────────────────────────────
  const signOut = await auth.api.signOut({
    headers: new Headers({ cookie: cookie ?? "" }),
    asResponse: true,
  });
  check("logout succeeds", signOut.status === 200, `HTTP ${signOut.status}`);

  const after = await auth.api.getSession({
    headers: new Headers({ cookie: cookie ?? "" }),
  });
  check("the session no longer resolves after logout", !after?.user);
} finally {
  // Always, pass or fail. A rehearsal that leaves accounts behind makes the
  // next verification run lie about its counts.
  const removed = await sql`
    delete from "user" where "email" like ${"rehearsal-%@indegenius.invalid"} returning "id"
  `;
  console.log(`\n  cleaned up ${removed.length} synthetic account(s)`);

  const [remaining] = await sql`select count(*)::int as count from "user"`;
  console.log(`  Better Auth users remaining: ${remaining.count} (expected 263)`);

  await sql.end({ timeout: 5 });
  await pool.end();
}

const failed = results.filter((entry) => !entry.passed);
console.log(
  `\n${failed.length === 0 ? "REHEARSAL PASSED" : `${failed.length} CHECK(S) FAILED`}\n`
);
process.exit(failed.length === 0 ? 0 : 1);
