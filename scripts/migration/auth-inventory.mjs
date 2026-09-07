/**
 * READ-ONLY inventory of production Supabase Auth.
 *
 *   node scripts/migration/auth-inventory.mjs
 *
 * Answers the questions the Better Auth migration guide makes you answer
 * before you configure anything: which providers are genuinely in use, whether
 * phone or anonymous or admin or MFA features are used at all, and how much of
 * `raw_user_meta_data` the application actually depends on.
 *
 * The point is to install the smallest set of plugins that is correct. The
 * guide is explicit that a missing plugin silently drops data (a user with
 * `banned_until` set disappears without the admin plugin), and equally that
 * configuring a plugin for a feature nobody uses is surface for nothing.
 *
 * Prints counts and category names only. No email address, no password hash,
 * no token, no user id ever reaches stdout.
 */
import postgres from "postgres";

import { loadEnv, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const { url, via } = await resolveSupabaseUrl(postgres);

const sql = postgres(url, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  onnotice: () => {},
});

function row(label, value) {
  console.log(`  ${String(label).padEnd(46)} ${value}`);
}

try {
  console.log(`\nReading production Supabase Auth via ${via}. READ ONLY.\n`);

  const [counts] = await sql`
    select
      (select count(*) from auth.users) as users,
      (select count(*) from auth.identities) as identities,
      (select count(*) from public.profiles) as profiles
  `;

  console.log("Counts");
  row("auth.users", counts.users);
  row("auth.identities", counts.identities);
  row("public.profiles", counts.profiles);

  console.log("\nIdentity providers in use");
  const providers = await sql`
    select provider, count(*)::int as count
    from auth.identities
    group by provider
    order by count desc
  `;
  for (const provider of providers) row(provider.provider, provider.count);
  if (providers.length === 0) row("(none)", 0);

  console.log("\nFeatures, and whether they are actually used");
  const [features] = await sql`
    select
      count(*) filter (where encrypted_password is not null and encrypted_password <> '') as with_password,
      count(*) filter (where email is null or email = '') as without_email,
      count(*) filter (where email_confirmed_at is not null) as email_confirmed,
      count(*) filter (where phone is not null and phone <> '') as with_phone,
      count(*) filter (where phone_confirmed_at is not null) as phone_confirmed,
      count(*) filter (where is_anonymous) as anonymous,
      count(*) filter (where is_super_admin) as super_admin,
      count(*) filter (where banned_until is not null) as banned,
      count(*) filter (where deleted_at is not null) as soft_deleted,
      count(*) filter (where invited_at is not null) as invited,
      count(*) filter (where raw_user_meta_data is not null
                         and raw_user_meta_data <> '{}'::jsonb) as with_user_metadata,
      count(*) filter (where raw_app_meta_data is not null
                         and raw_app_meta_data <> '{}'::jsonb) as with_app_metadata
    from auth.users
  `;
  for (const [label, value] of Object.entries(features)) row(label, value);

  console.log("\nMFA");
  const mfa = await sql`
    select
      (select count(*) from auth.mfa_factors) as factors,
      (select count(*) from auth.mfa_challenges) as challenges
  `.catch(() => [{ factors: "table absent", challenges: "table absent" }]);
  row("auth.mfa_factors", mfa[0].factors);
  row("auth.mfa_challenges", mfa[0].challenges);

  console.log("\nuser metadata keys in use (names only, no values)");
  const keys = await sql`
    select key, count(*)::int as count
    from auth.users, lateral jsonb_object_keys(coalesce(raw_user_meta_data, '{}'::jsonb)) as key
    group by key
    order by count desc
    limit 30
  `;
  for (const entry of keys) row(entry.key, entry.count);
  if (keys.length === 0) row("(none)", 0);

  console.log("\napp metadata keys in use (names only, no values)");
  const appKeys = await sql`
    select key, count(*)::int as count
    from auth.users, lateral jsonb_object_keys(coalesce(raw_app_meta_data, '{}'::jsonb)) as key
    group by key
    order by count desc
    limit 30
  `;
  for (const entry of appKeys) row(entry.key, entry.count);

  console.log("\nPassword hash shape (prefix only; no hash is printed)");
  const shapes = await sql`
    select substring(encrypted_password from 1 for 4) as prefix, count(*)::int as count
    from auth.users
    where encrypted_password is not null and encrypted_password <> ''
    group by prefix
    order by count desc
  `;
  for (const shape of shapes) row(shape.prefix, shape.count);

  console.log("\nIdentity contract: does every profile have an auth user?");
  const [contract] = await sql`
    select
      (select count(*) from public.profiles p
        where not exists (select 1 from auth.users u where u.id = p.id)) as orphan_profiles,
      (select count(*) from auth.users u
        where not exists (select 1 from public.profiles p where p.id = u.id)) as users_without_profile
  `;
  row("profiles with no auth.users row", contract.orphan_profiles);
  row("auth.users with no profile row", contract.users_without_profile);

  console.log("");
} finally {
  await sql.end({ timeout: 5 });
}
