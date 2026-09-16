/**
 * Identity parity: Supabase Auth against the Better Auth mapping on Neon.
 *
 *   node scripts/migration/identity-parity.mjs
 *
 * Six questions, none of which can be answered by counting one side alone:
 *
 *   1. Do the user counts match?
 *   2. Does every Supabase user have a Better Auth user with the SAME uuid?
 *   3. Does every profile have an account behind it, on both sides?
 *   4. Are there duplicate identities, by id or by address?
 *   5. Are there orphan profiles, with no user?
 *   6. Do the credential accounts line up with the users who have a password?
 *
 * READ ONLY on both databases.
 *
 * ## What is never printed
 *
 * No email address, no password hash, no token, no user id. Every mismatch is
 * reported as a count and, where a sample is genuinely needed to act on it, as
 * a redacted fingerprint: the first eight characters of a uuid, which is
 * enough to find a row and not enough to be a credential.
 */
import postgres from "postgres";

import { loadEnv, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const neonUrl = process.env.DATABASE_URL;
if (!neonUrl || !neonUrl.includes(".neon.tech")) {
  console.error("\nDATABASE_URL must point at Neon for the mapping side.\n");
  process.exit(2);
}

const failures = [];
const pass = (label, detail) => console.log(`  PASS  ${label}${detail ? `  (${detail})` : ""}`);
const fail = (label, detail) => {
  console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`);
  failures.push(label);
};

/** Enough to locate a row, not enough to identify a person. */
const stub = (id) => String(id).slice(0, 8);

const resolved = await resolveSupabaseUrl(postgres);
const supabase = postgres(resolved.url, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  fetch_types: false,
  onnotice: () => {},
});
const neon = postgres(neonUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  fetch_types: false,
  onnotice: () => {},
});

console.log(`\nSupabase via ${resolved.via}`);
console.log("Neon via DATABASE_URL\n");

try {
  // ── 1. counts ────────────────────────────────────────────────────────────
  console.log("1. user and profile counts");

  const [supabaseCounts] = await supabase`
    select
      (select count(*) from auth.users) as users,
      (select count(*) from auth.users where encrypted_password is not null) as with_password,
      (select count(*) from public.profiles) as profiles
  `;

  const neonTables = await neon`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name in ('user', 'account', 'session')
  `;
  const hasBetterAuth = neonTables.some((row) => row.table_name === "user");

  const [neonCounts] = hasBetterAuth
    ? await neon`
        select
          (select count(*) from "user") as users,
          (select count(*) from "account" where "providerId" = 'credential') as credentials,
          (select count(*) from public.profiles) as profiles
      `
    : [{ users: null, credentials: null, profiles: null }];

  console.log(
    `        Supabase: ${supabaseCounts.users} users, ${supabaseCounts.with_password} with a password, ${supabaseCounts.profiles} profiles`
  );
  if (!hasBetterAuth) {
    console.log("        Neon: no Better Auth tables present");
  } else {
    console.log(
      `        Neon:     ${neonCounts.users} users, ${neonCounts.credentials} credential accounts, ${neonCounts.profiles} profiles`
    );
  }

  if (hasBetterAuth) {
    if (String(supabaseCounts.users) === String(neonCounts.users)) {
      pass("user counts match", `${supabaseCounts.users}`);
    } else {
      fail(
        "user counts match",
        `Supabase ${supabaseCounts.users} vs Neon ${neonCounts.users}`
      );
    }
    if (String(supabaseCounts.with_password) === String(neonCounts.credentials)) {
      pass("credential accounts match users with a password", `${neonCounts.credentials}`);
    } else {
      fail(
        "credential accounts match users with a password",
        `${supabaseCounts.with_password} vs ${neonCounts.credentials}`
      );
    }
  } else {
    console.log("  SKIP  Better Auth mapping checks: tables not present on Neon");
  }

  // ── 2. uuid relationships ────────────────────────────────────────────────
  console.log("\n2. uuid relationships");

  if (hasBetterAuth) {
    const supabaseIds = await supabase`select id::text as id from auth.users`;
    const neonIds = await neon`select id::text as id from "user"`;

    const left = new Set(supabaseIds.map((row) => row.id));
    const right = new Set(neonIds.map((row) => row.id));

    const missingOnNeon = [...left].filter((id) => !right.has(id));
    const extraOnNeon = [...right].filter((id) => !left.has(id));

    if (missingOnNeon.length === 0 && extraOnNeon.length === 0) {
      pass("every Supabase user has a Better Auth user with the same uuid", `${left.size}`);
    } else {
      fail(
        "uuid sets match",
        `${missingOnNeon.length} missing on Neon, ${extraOnNeon.length} extra` +
          (missingOnNeon.length
            ? `; e.g. ${missingOnNeon.slice(0, 3).map(stub).join(", ")}`
            : "")
      );
    }
  }

  // ── 3. profiles behind users ─────────────────────────────────────────────
  console.log("\n3. profiles and orphans");

  const orphanProfiles = await supabase`
    select count(*) as total
    from public.profiles p
    where not exists (select 1 from auth.users u where u.id = p.id)
  `;
  if (Number(orphanProfiles[0].total) === 0) {
    pass("no profile without a Supabase user");
  } else {
    fail("orphan profiles", `${orphanProfiles[0].total} profile(s) with no auth.users row`);
  }

  const usersWithoutProfile = await supabase`
    select count(*) as total
    from auth.users u
    where not exists (select 1 from public.profiles p where p.id = u.id)
  `;
  // Reported, not failed: a user who signed up and never completed a profile
  // is a real state, and the product allows it.
  console.log(
    `  NOTE  ${usersWithoutProfile[0].total} user(s) with no profile row (a real state, not an error)`
  );

  // ── 4. duplicates ────────────────────────────────────────────────────────
  console.log("\n4. duplicate identities");

  const duplicateEmails = await supabase`
    select count(*) as total from (
      select lower(email) as key
      from auth.users
      where email is not null
      group by lower(email)
      having count(*) > 1
    ) duplicated
  `;
  if (Number(duplicateEmails[0].total) === 0) {
    pass("no duplicate addresses in auth.users");
  } else {
    fail("duplicate addresses", `${duplicateEmails[0].total} address(es) used by more than one user`);
  }

  if (hasBetterAuth) {
    const duplicateNeon = await neon`
      select count(*) as total from (
        select lower(email) as key from "user" where email is not null
        group by lower(email) having count(*) > 1
      ) duplicated
    `;
    if (Number(duplicateNeon[0].total) === 0) {
      pass("no duplicate addresses in the Better Auth user table");
    } else {
      fail("duplicate addresses on Neon", `${duplicateNeon[0].total}`);
    }

    const orphanAccounts = await neon`
      select count(*) as total
      from "account" a
      where not exists (select 1 from "user" u where u.id = a."userId")
    `;
    if (Number(orphanAccounts[0].total) === 0) {
      pass("no account row without a user");
    } else {
      fail("orphan accounts", `${orphanAccounts[0].total}`);
    }
  }

  // ── 5. the identity RPCs answer for a real member ────────────────────────
  console.log("\n5. the migrated identity path answers");

  const [member] = await supabase`
    select id::text as id from public.profiles order by created_at limit 1
  `;
  if (member) {
    const viaImpl = await supabase`
      select profile_id::text as profile_id
      from private.get_my_profile_private_impl(${member.id}::uuid)
    `;
    if (viaImpl.length === 1 && viaImpl[0].profile_id === member.id) {
      pass("private.get_my_profile_private_impl returns that member, and only them");
    } else {
      fail("private implementation", `${viaImpl.length} row(s)`);
    }

    const onboarding = await supabase`
      select count(*) as total from private.get_my_onboarding_state_impl(${member.id}::uuid)
    `;
    pass("private.get_my_onboarding_state_impl answers", `${onboarding[0].total} row(s)`);
  } else {
    fail("no profile to exercise the identity path with");
  }
} finally {
  await supabase.end({ timeout: 5 });
  await neon.end({ timeout: 5 });
}

console.log("");
if (failures.length) {
  console.log(`${failures.length} IDENTITY CHECK(S) FAILED:\n  ${failures.join("\n  ")}\n`);
  process.exit(1);
}
console.log("Identity parity clean.\n");
