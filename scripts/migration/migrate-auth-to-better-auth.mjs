/**
 * Migrates Supabase Auth users into Better Auth tables on Neon scratch.
 *
 *   node scripts/migration/migrate-auth-to-better-auth.mjs
 *   node scripts/migration/migrate-auth-to-better-auth.mjs --verify
 *
 * SOURCE: production Supabase, READ ONLY. Not one statement here writes to it.
 * TARGET: Neon scratch. Refuses any host that is not *.neon.tech.
 *
 * ## Where this departs from the official guide, and why
 *
 * The guide's script derives Better Auth `account` rows from
 * `auth.identities`. On this database that would silently drop five people.
 *
 *     auth.users       263
 *     auth.identities  258
 *
 * Every one of the 263 has an `encrypted_password`. The five without an
 * identity row are older accounts created before Supabase backfilled
 * identities for email signups, and deriving credential accounts from
 * identities would leave them in the `user` table with no way to log in: an
 * account that exists, accepts no password, and reports no error. So the
 * credential account is derived from `auth.users.encrypted_password`, and
 * identities are used only for what they uniquely carry, which here is
 * nothing, because the only provider in use is `email`.
 *
 * The other departures follow the inventory
 * (`scripts/migration/auth-inventory.mjs`):
 *
 *   - No admin, anonymous, phoneNumber or SSO plugin tables are written,
 *     because there are zero rows behind all four features.
 *   - `name` is NOT NULL in Better Auth's `user` table and has no equivalent
 *     in `auth.users`. It comes from `raw_user_meta_data.full_name`, then
 *     `profiles.full_name`, then the email local part. Never empty, because
 *     the column will not take empty.
 *
 * ## Idempotence
 *
 * Every write is an upsert keyed on the id Supabase already assigned, so a
 * rerun after a scratch reset, or after a partial failure, converges instead
 * of duplicating. Nothing generates an id.
 *
 * ## What is never printed
 *
 * Password hashes, email addresses and tokens. The output is counts and
 * category names. A hash in a terminal is a hash in a scrollback buffer.
 */
import postgres from "postgres";

import { loadEnv, requireUrl, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const VERIFY_ONLY = process.argv.includes("--verify");
const BATCH_SIZE = 500;

const neonUrl = requireUrl("DATABASE_URL");
if (!new URL(neonUrl).hostname.endsWith(".neon.tech")) {
  console.error("REFUSED: DATABASE_URL does not point at Neon.");
  process.exit(2);
}

const { url: supabaseUrl, via } = await resolveSupabaseUrl(postgres);

const source = postgres(supabaseUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  onnotice: () => {},
});
const target = postgres(neonUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  onnotice: () => {},
});

function row(label, value) {
  console.log(`  ${String(label).padEnd(46)} ${value}`);
}

/** Better Auth's `user.name` is NOT NULL and Supabase has no such column. */
function deriveName(user) {
  const fromMetadata = user.raw_user_meta_data?.full_name;
  if (typeof fromMetadata === "string" && fromMetadata.trim()) {
    return fromMetadata.trim();
  }
  if (typeof user.profile_full_name === "string" && user.profile_full_name.trim()) {
    return user.profile_full_name.trim();
  }
  const local = String(user.email ?? "").split("@")[0];
  return local || "Indegenius member";
}

try {
  console.log(`\nSource: production Supabase via ${via}. READ ONLY.`);
  console.log("Target: Neon scratch.\n");

  if (!VERIFY_ONLY) {
    let migratedUsers = 0;
    let migratedAccounts = 0;
    let skippedNoPassword = 0;
    let cursor = "00000000-0000-0000-0000-000000000000";

    for (;;) {
      // Ordered by id so the cursor is stable and a rerun resumes rather than
      // restarts. Joined to profiles for the name fallback; that join is a
      // read of a table this migration never writes.
      const batch = await source`
        select
          u.id,
          u.email,
          u.encrypted_password,
          u.email_confirmed_at,
          u.raw_user_meta_data,
          u.raw_app_meta_data,
          u.invited_at,
          u.last_sign_in_at,
          u.created_at,
          u.updated_at,
          p.full_name as profile_full_name
        from auth.users as u
        left join public.profiles as p on p.id = u.id
        where u.id > ${cursor}::uuid
          and u.deleted_at is null
        order by u.id
        limit ${BATCH_SIZE}
      `;

      if (batch.length === 0) break;
      cursor = batch[batch.length - 1].id;

      for (const user of batch) {
        const id = String(user.id);
        const name = deriveName(user);
        const emailVerified = user.email_confirmed_at !== null;

        await target`
          insert into "user"
            ("id", "name", "email", "emailVerified", "image",
             "createdAt", "updatedAt",
             "userMetadata", "appMetadata", "invitedAt", "lastSignInAt")
          values (
            ${id}, ${name}, ${user.email}, ${emailVerified}, ${null},
            ${user.created_at ?? new Date()}, ${user.updated_at ?? new Date()},
            ${user.raw_user_meta_data ?? null},
            ${user.raw_app_meta_data ?? null},
            ${user.invited_at ?? null},
            ${user.last_sign_in_at ?? null}
          )
          on conflict ("id") do update set
            "name" = excluded."name",
            "email" = excluded."email",
            "emailVerified" = excluded."emailVerified",
            "updatedAt" = excluded."updatedAt",
            "userMetadata" = excluded."userMetadata",
            "appMetadata" = excluded."appMetadata",
            "invitedAt" = excluded."invitedAt",
            "lastSignInAt" = excluded."lastSignInAt"
        `;
        migratedUsers += 1;

        const hash = user.encrypted_password;
        if (!hash) {
          // Recorded rather than ignored. A user with no password cannot log
          // in with one, and creating an account row with a null password
          // would misrepresent that as a credential account.
          skippedNoPassword += 1;
          continue;
        }

        // The account id is derived from the user id rather than generated, so
        // a rerun updates the same row. `credential` is Better Auth's provider
        // id for email and password.
        await target`
          insert into "account"
            ("id", "accountId", "providerId", "userId", "password",
             "createdAt", "updatedAt")
          values (
            ${`credential:${id}`}, ${id}, ${"credential"}, ${id}, ${hash},
            ${user.created_at ?? new Date()}, ${user.updated_at ?? new Date()}
          )
          on conflict ("id") do update set
            "password" = excluded."password",
            "updatedAt" = excluded."updatedAt"
        `;
        migratedAccounts += 1;
      }

      console.log(`  ... ${migratedUsers} users so far`);
    }

    console.log("\nMigrated");
    row("users written", migratedUsers);
    row("credential accounts written", migratedAccounts);
    row("users with no password (no account row)", skippedNoPassword);
    console.log(
      "\nDeliberately not migrated: Supabase sessions (they are not Better Auth\n" +
        "sessions and the guide is explicit that the cutover invalidates them),\n" +
        "and the admin/anonymous/phone/SSO fields, which have zero rows behind\n" +
        "them in this database."
    );
  }

  // ── Verification ───────────────────────────────────────────────────
  console.log("\nVerification");

  const [sourceCounts] = await source`
    select
      (select count(*) from auth.users where deleted_at is null) as users,
      (select count(*) from public.profiles) as profiles,
      (select count(*) from auth.users
        where deleted_at is null
          and encrypted_password is not null and encrypted_password <> '') as with_password
  `;
  const [targetCounts] = await target`
    select
      (select count(*) from "user") as users,
      (select count(*) from "account" where "providerId" = 'credential') as credentials,
      (select count(*) from "account" where "password" is null) as null_passwords,
      (select count(*) from "session") as sessions
  `;

  row("Supabase auth.users", sourceCounts.users);
  row("Better Auth user", targetCounts.users);
  row("Supabase profiles", sourceCounts.profiles);
  row("Supabase users with a password", sourceCounts.with_password);
  row("Better Auth credential accounts", targetCounts.credentials);
  row("Better Auth accounts with a null password", targetCounts.null_passwords);
  row("Better Auth sessions (should be 0)", targetCounts.sessions);

  // UUID parity, computed by comparing the two id sets rather than by trusting
  // the counts. Equal counts with different ids would pass a count check.
  const sourceIds = await source`
    select id::text as id from auth.users where deleted_at is null order by id
  `;
  const targetIds = await target`select "id" from "user" order by "id"`;
  const sourceSet = new Set(sourceIds.map((entry) => entry.id));
  const targetSet = new Set(targetIds.map((entry) => entry.id));

  const missing = [...sourceSet].filter((id) => !targetSet.has(id));
  const extra = [...targetSet].filter((id) => !sourceSet.has(id));

  row("ids in Supabase but not Better Auth", missing.length);
  row("ids in Better Auth but not Supabase", extra.length);

  // The identity contract the whole application depends on.
  const profileIds = await source`select id::text as id from public.profiles`;
  const profileSet = new Set(profileIds.map((entry) => entry.id));
  const mismatched = [...targetSet].filter((id) => !profileSet.has(id));
  row("Better Auth users with no matching profile", mismatched.length);

  const [dupes] = await target`
    select
      (select count(*) from (
        select lower("email") as e from "user" group by 1 having count(*) > 1
      ) as d) as duplicate_emails,
      (select count(*) from (
        select "userId" from "account" where "providerId" = 'credential'
        group by 1 having count(*) > 1
      ) as d) as duplicate_credentials,
      (select count(*) from "account" a
        where not exists (select 1 from "user" u where u."id" = a."userId")) as orphan_accounts
  `;
  row("duplicate emails", dupes.duplicate_emails);
  row("duplicate credential accounts per user", dupes.duplicate_credentials);
  row("orphan account rows", dupes.orphan_accounts);

  // Hash integrity, structurally. No hash is printed or compared by value.
  const [hashes] = await target`
    select
      count(*) filter (where "password" like '$2%') as bcrypt_shaped,
      count(*) filter (where length("password") = 60) as correct_length,
      count(*) as total
    from "account" where "providerId" = 'credential'
  `;
  row("credential hashes with a bcrypt prefix", `${hashes.bcrypt_shaped}/${hashes.total}`);
  row("credential hashes 60 characters long", `${hashes.correct_length}/${hashes.total}`);

  // The one comparison that proves nothing was transformed: the same hash on
  // both sides, compared in SQL, counted rather than shown.
  const supabaseHashes = await source`
    select id::text as id, md5(encrypted_password) as fingerprint
    from auth.users
    where deleted_at is null and encrypted_password is not null and encrypted_password <> ''
  `;
  const targetHashes = await target`
    select "userId" as id, md5("password") as fingerprint
    from "account" where "providerId" = 'credential' and "password" is not null
  `;
  const targetByUser = new Map(targetHashes.map((entry) => [entry.id, entry.fingerprint]));
  let identical = 0;
  let differing = 0;
  for (const entry of supabaseHashes) {
    const there = targetByUser.get(entry.id);
    if (there === undefined) continue;
    if (there === entry.fingerprint) identical += 1;
    else differing += 1;
  }
  row("hashes identical to Supabase", identical);
  row("hashes that differ (must be 0)", differing);

  const ok =
    missing.length === 0 &&
    extra.length === 0 &&
    mismatched.length === 0 &&
    Number(dupes.duplicate_emails) === 0 &&
    Number(dupes.duplicate_credentials) === 0 &&
    Number(dupes.orphan_accounts) === 0 &&
    differing === 0 &&
    Number(hashes.bcrypt_shaped) === Number(hashes.total);

  console.log(`\n${ok ? "AUTH MIGRATION VERIFIED" : "VERIFICATION FAILED"}\n`);
  process.exitCode = ok ? 0 : 1;
} finally {
  await source.end({ timeout: 5 });
  await target.end({ timeout: 5 });
}
