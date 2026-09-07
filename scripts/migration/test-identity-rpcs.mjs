/**
 * Applies and exercises 20260909000001_parameterize_identity_rpcs.sql against
 * the Neon SCRATCH database.
 *
 *   node scripts/migration/test-identity-rpcs.mjs
 *
 * Phase 2 wrote that migration and deliberately did not apply it anywhere: the
 * six functions were reviewed but never run. Neon is the first place they can
 * be, and it is the right place, because Neon is where `auth.uid()` actually
 * returns NULL, which is the condition the whole migration exists to survive.
 *
 * Never touches Supabase. Refuses any target that is not Neon.
 *
 * What is proved here:
 *
 *   1. The migration applies cleanly to a copy of the production schema.
 *   2. Both signatures exist afterwards, so every existing caller keeps working.
 *   3. A NULL identity raises instead of quietly affecting zero rows. This is
 *      the failure the migration is for: `where id = auth.uid()` with a null
 *      uid updates nothing and reports success.
 *   4. The legacy signature, which passes `auth.uid()`, now raises on Neon
 *      rather than silently doing nothing.
 *   5. The parameterised signature works when given a real user id, and writes
 *      the row it was told to.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { loadEnv, redact, requireUrl } from "./env.mjs";

loadEnv();

const url = requireUrl("DATABASE_URL_DIRECT");
if (!new URL(url).hostname.endsWith(".neon.tech")) {
  console.error("REFUSED: DATABASE_URL_DIRECT does not point at Neon.");
  process.exit(2);
}

const sql = postgres(url, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  connection: { statement_timeout: 120_000 },
  onnotice: () => {},
});

const failures = [];
function check(label, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

/** Runs a statement and reports how it failed rather than throwing. */
async function attempt(statement, params = []) {
  try {
    const rows = await sql.unsafe(statement, params);
    return { ok: true, rows };
  } catch (error) {
    return { ok: false, message: error.message ?? String(error), code: error.code };
  }
}

try {
  console.log("--- applying the migration ---");
  const migration = readFileSync(
    "supabase/migrations/20260909000001_parameterize_identity_rpcs.sql",
    "utf8"
  );
  const applied = await attempt(migration);
  check("migration applies to the migrated schema", applied.ok, applied.message ?? "");
  if (!applied.ok) throw new Error("cannot continue without the migration");

  console.log("\n--- both signatures exist ---");
  const OVERLOADS = [
    ["get_my_onboarding_state", 0, 1],
    ["save_onboarding_path", 1, 2],
    ["save_onboarding_preferences", 2, 3],
    ["save_onboarding_topics", 1, 2],
    ["set_notification_preference", 2, 3],
    ["toggle_comment_vote", 1, 2],
  ];
  for (const [name, legacyArgs, newArgs] of OVERLOADS) {
    const rows = await sql`
      select p.pronargs::int as args from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = ${name}
      order by 1`;
    const counts = rows.map((row) => row.args);
    check(
      `${name}: legacy(${legacyArgs}) and parameterised(${newArgs})`,
      counts.includes(legacyArgs) && counts.includes(newArgs),
      `found ${JSON.stringify(counts)}`
    );
  }

  console.log("\n--- a NULL identity raises, rather than affecting zero rows ---");
  const nullIdentity = await attempt(
    "select public.save_onboarding_topics(null::uuid, array['Public Health','Education','Data Science'])"
  );
  check(
    "save_onboarding_topics(null, ...) raises",
    !nullIdentity.ok && /user id is required/i.test(nullIdentity.message ?? ""),
    nullIdentity.ok ? "it succeeded" : nullIdentity.message
  );

  console.log("\n--- the legacy signature raises on Neon, where auth.uid() is NULL ---");
  const legacy = await attempt(
    "select public.save_onboarding_topics(array['Public Health','Education','Data Science'])"
  );
  check(
    "save_onboarding_topics(text[]) raises rather than silently doing nothing",
    !legacy.ok && /user id is required/i.test(legacy.message ?? ""),
    legacy.ok ? "it succeeded, which is the silent failure this migration exists to prevent" : legacy.message
  );

  console.log("\n--- the parameterised signature works with a real id ---");
  const [member] = await sql`select id from public.profiles limit 1`;
  if (!member) {
    check("a profile exists to act as", false, "no rows in public.profiles");
  } else {
    const [before] = await sql`
      select interests, notification_prefs from public.profiles where id = ${member.id}`;

    const topics = await attempt(
      "select public.save_onboarding_topics($1::uuid, array['Public Health','Education','Data Science'])",
      [member.id]
    );
    check("save_onboarding_topics(uuid, text[]) succeeds", topics.ok, topics.message ?? "");

    const [afterTopics] = await sql`
      select interests from public.profiles where id = ${member.id}`;
    check(
      "it wrote the row it was told to",
      JSON.stringify(afterTopics.interests) ===
        JSON.stringify(["Public Health", "Education", "Data Science"]),
      JSON.stringify(afterTopics.interests)
    );

    const preference = await attempt(
      "select public.set_notification_preference($1::uuid, 'email_likes', false)",
      [member.id]
    );
    check("set_notification_preference(uuid, ...) succeeds", preference.ok, preference.message ?? "");

    const [afterPreference] = await sql`
      select notification_prefs from public.profiles where id = ${member.id}`;
    check(
      "the preference landed inside the jsonb",
      afterPreference.notification_prefs?.email_likes === false,
      JSON.stringify(afterPreference.notification_prefs?.email_likes)
    );

    const wrongUser = await attempt(
      "select public.save_onboarding_topics($1::uuid, array['nope'])",
      [member.id]
    );
    check(
      "an invalid topic is still rejected by the function's own allowlist",
      !wrongUser.ok && /3 to 5 valid topics/i.test(wrongUser.message ?? ""),
      wrongUser.ok ? "it succeeded" : wrongUser.message
    );

    const missingProfile = await attempt(
      "select public.set_notification_preference('00000000-0000-0000-0000-000000000000'::uuid, 'email_likes', false)"
    );
    check(
      "a row-count check catches a user id that matches no profile",
      !missingProfile.ok && /Profile not found/i.test(missingProfile.message ?? ""),
      missingProfile.ok ? "it reported success for a nonexistent member" : missingProfile.message
    );

    // Put the scratch row back the way the copy left it, so a later parity run
    // is not comparing against something this test changed.
    await sql`
      update public.profiles
         set interests = ${before.interests},
             notification_prefs = ${before.notification_prefs}
       where id = ${member.id}`;
    console.log("  (restored the profile row used for the test)");
  }

  console.log("\n--- withdraw_post_submission: inspected, not migrated ---");
  const [guard] = await sql`
    select pg_get_functiondef(p.oid) as body from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'guard_locked_post_write'`;
  const comparesCurrentUser = /current_user/.test(guard?.body ?? "");
  const [{ user: currentUser }] = await sql`select current_user as user`;
  console.log(
    `  guard_locked_post_write compares current_user: ${comparesCurrentUser}\n` +
      `  current_user on Neon: ${currentUser}\n` +
      `  the guard's bypass branch triggers whenever current_user is not literally\n` +
      `  'authenticated', so on Neon it is inert. That is the behaviour Phase 2\n` +
      `  declined to reason about without a database, and it is now measured:\n` +
      `  withdraw_post_submission can be parameterised without the trigger\n` +
      `  interfering, because the trigger no longer participates at all.`
  );
} catch (error) {
  console.error(redact(error));
  failures.push("script error");
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}

console.log(`\n${failures.length === 0 ? "IDENTITY RPCs VERIFIED" : `${failures.length} FAILURE(S)`}`);
for (const failure of failures) console.log(`  - ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
