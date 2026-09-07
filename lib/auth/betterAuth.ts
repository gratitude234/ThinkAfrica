import "server-only";

import { betterAuth } from "better-auth";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

/**
 * Better Auth, for the migration rehearsal. Not wired to anything yet.
 *
 * Production authentication is Supabase Auth and stays that way: nothing in
 * the application calls this, `resolveAuthAdapter()` answers `supabase` unless
 * `AUTH_ADAPTER` says otherwise, and the connection string this reads is the
 * Neon scratch database.
 *
 * ## What is configured, and why so little
 *
 * `scripts/migration/auth-inventory.mjs` read production before any of this
 * was written, and the answer was narrower than Supabase's feature list
 * suggests:
 *
 *     263 users, 263 profiles, one provider: email
 *     0 phone, 0 anonymous, 0 super_admin, 0 banned, 0 soft-deleted, 0 invited
 *     0 MFA factors, 0 MFA challenges
 *     263 bcrypt passwords, every one a $2a$ hash
 *
 * So: no admin plugin, no anonymous plugin, no phoneNumber plugin, no SSO. The
 * migration guide is right that a missing plugin silently drops data, and the
 * inventory is how you know which ones are missing rather than unnecessary.
 * Adding a plugin for a feature with zero rows behind it is surface for
 * nothing.
 *
 * `userMetadata` and `appMetadata` are kept because every one of the 263 users
 * has both, and because the guide is explicit that they are where Supabase put
 * things the application may still read. The keys actually in use are
 * `full_name`, `email_verified`, `email`, `phone_verified`, `sub` and
 * `university`; of those only `full_name` and `university` are application
 * data, and both are already columns on `profiles`. They are carried anyway,
 * because discarding metadata during a migration is not reversible and keeping
 * it costs a jsonb column.
 */

/** Which auth implementation the application uses. Unset means Supabase, which
 *  is what production is. Anything unrecognised throws rather than silently
 *  falling back, for the same reason `DATABASE_ADAPTER` does: a typo during a
 *  cutover must not be indistinguishable from a decision. */
export type AuthAdapterName = "supabase" | "better-auth";

export function resolveAuthAdapter(
  raw: string | undefined = process.env.AUTH_ADAPTER
): AuthAdapterName {
  const value = (raw ?? "").trim();
  if (value === "" || value === "supabase") return "supabase";
  if (value === "better-auth") return "better-auth";
  throw new Error(
    `AUTH_ADAPTER must be "supabase" or "better-auth". Received "${raw}".`
  );
}

/**
 * The rehearsal connection.
 *
 * Refuses anything that is not Neon. This module must never be able to open a
 * pool against production, and the check is here rather than in a caller
 * because a caller can be added later without reading this comment.
 */
function rehearsalConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required for the Better Auth rehearsal.");
  }
  if (!new URL(url).hostname.endsWith(".neon.tech")) {
    throw new Error(
      "REFUSED: the Better Auth rehearsal only runs against Neon scratch."
    );
  }
  return url;
}

let pool: Pool | null = null;

function rehearsalPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: rehearsalConnectionString(), max: 5 });
  }
  return pool;
}

/**
 * bcrypt, not scrypt.
 *
 * Better Auth hashes with scrypt by default. Every existing password is a
 * Supabase bcrypt `$2a$` hash, and the whole point of preserving them is that
 * nobody has to reset a password to keep their account. So both halves are
 * overridden: `verify` reads the migrated hashes, and `hash` keeps new
 * passwords in the same format so there is one scheme in the table rather than
 * two.
 *
 * `bcryptjs` rather than `bcrypt`: the guide names the native package, but this
 * application builds for a serverless runtime where a native addon is a
 * liability, and bcryptjs is the same algorithm with no build step. It emits
 * `$2b$` and verifies `$2a$`, `$2b$` and `$2y$` alike, which is what matters
 * here; the two prefixes differ only for passwords of 255 bytes or more.
 */
const BCRYPT_COST = 10;

export const passwordConfig = {
  hash: async (password: string) => bcrypt.hash(password, BCRYPT_COST),
  verify: async ({ hash, password }: { hash: string; password: string }) =>
    bcrypt.compare(password, hash),
};

export function createRehearsalAuth() {
  return betterAuth({
    database: rehearsalPool(),
    emailAndPassword: {
      enabled: true,
      // Not disabled, but nothing sends mail in the rehearsal: no transport is
      // configured, so a verification or reset would fail loudly rather than
      // quietly reaching a real member.
      requireEmailVerification: false,
      password: passwordConfig,
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
}

export type RehearsalAuth = ReturnType<typeof createRehearsalAuth>;
