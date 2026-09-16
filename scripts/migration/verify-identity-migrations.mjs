/**
 * Verifies the identity migrations against the live database.
 *
 *   node scripts/migration/verify-identity-migrations.mjs
 *
 * Six checks, each of which is a thing that would be silent if it were wrong:
 *
 *   1. Every implementation exists, in `private`.
 *   2. Every implementation is SECURITY DEFINER with an empty search_path.
 *      A definer with a mutable schema on its path is the classic escalation
 *      route.
 *   3. No implementation is executable by anon or authenticated, and neither
 *      role holds USAGE on the schema. These are the two independent
 *      mechanisms keeping a browser out.
 *   4. Every public wrapper still exists with its original signature. Losing
 *      one is an outage.
 *   5. Every wrapper derives the actor from auth.uid() and takes no user id,
 *      read from the live definition rather than from the migration file.
 *   6. No PUBLIC explicit-id overload survives.
 *
 * Read-only. Prints no user data.
 */
import postgres from "postgres";

import { loadEnv, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const IMPLEMENTATIONS = [
  ["assert_identity_claim", "p_user_id uuid"],
  ["get_my_onboarding_state_impl", "p_user_id uuid"],
  ["save_onboarding_path_impl", "p_user_id uuid, p_current_path text"],
  [
    "save_onboarding_preferences_impl",
    "p_user_id uuid, p_current_path text, p_work_category text",
  ],
  ["save_onboarding_topics_impl", "p_user_id uuid, p_interests text[]"],
  [
    "set_notification_preference_impl",
    "p_user_id uuid, p_key text, p_enabled boolean",
  ],
  ["toggle_comment_vote_impl", "p_user_id uuid, p_comment_id uuid"],
  ["get_my_profile_private_impl", "p_user_id uuid"],
];

const WRAPPERS = [
  ["get_my_onboarding_state", ""],
  ["save_onboarding_path", "p_current_path text"],
  ["save_onboarding_preferences", "p_current_path text, p_work_category text"],
  ["save_onboarding_topics", "p_interests text[]"],
  ["set_notification_preference", "p_key text, p_enabled boolean"],
  ["toggle_comment_vote", "p_comment_id uuid"],
  ["get_my_profile_private", ""],
];

const resolved = await resolveSupabaseUrl(postgres);
const sql = postgres(resolved.url, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  fetch_types: false,
  onnotice: () => {},
});

const failures = [];
const pass = (label) => console.log(`  PASS  ${label}`);
const fail = (label, detail) => {
  console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`);
  failures.push(label);
};

console.log(`\nVerifying via ${resolved.via}\n`);

const rows = await sql`
  select n.nspname as schema,
         p.proname as name,
         pg_get_function_identity_arguments(p.oid) as args,
         p.prosecdef as definer,
         coalesce(array_to_string(p.proconfig, ','), '') as config,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
         has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec,
         pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
`;

const find = (schema, name, args) =>
  rows.find(
    (row) => row.schema === schema && row.name === name && row.args === args
  );

// ── 1 and 2 ────────────────────────────────────────────────────────────────
console.log("1. implementations exist in private, definer, empty search_path");
for (const [name, args] of IMPLEMENTATIONS) {
  const row = find("private", name, args);
  if (!row) {
    fail(`private.${name}(${args})`, "missing");
    continue;
  }
  // assert_identity_claim is intentionally INVOKER: it reads auth.uid() and
  // must see the caller's claim, not the owner's.
  const wantDefiner = name !== "assert_identity_claim";
  if (row.definer !== wantDefiner) {
    fail(`private.${name}`, `definer=${row.definer}, expected ${wantDefiner}`);
  } else if (!/search_path=""/.test(row.config)) {
    fail(`private.${name}`, `search_path=[${row.config}]`);
  } else {
    pass(`private.${name}`);
  }
}

// ── 3 ──────────────────────────────────────────────────────────────────────
console.log("\n2. implementations unreachable by anon and authenticated");
for (const [name, args] of IMPLEMENTATIONS) {
  const row = find("private", name, args);
  if (!row) continue;
  if (row.auth_exec || row.anon_exec) {
    fail(
      `private.${name}`,
      `authenticated=${row.auth_exec} anon=${row.anon_exec}`
    );
  } else {
    pass(`private.${name} not executable by anon or authenticated`);
  }
}

const [usage] = await sql`
  select has_schema_privilege('authenticated','private','USAGE') as auth_usage,
         has_schema_privilege('anon','private','USAGE') as anon_usage
`;
if (usage.auth_usage || usage.anon_usage) {
  fail("private schema USAGE", `authenticated=${usage.auth_usage} anon=${usage.anon_usage}`);
} else {
  pass("private schema USAGE denied to anon and authenticated");
}

// ── 4 and 5 ────────────────────────────────────────────────────────────────
console.log("\n3. public wrappers intact, derive auth.uid(), take no user id");
for (const [name, args] of WRAPPERS) {
  const row = find("public", name, args);
  if (!row) {
    fail(`public.${name}(${args})`, "missing -- this would be an outage");
    continue;
  }
  if (/p_user_id/.test(row.args)) {
    fail(`public.${name}`, "takes a user id");
  } else if (!/auth\.uid\(\)/.test(row.definition)) {
    fail(`public.${name}`, "does not derive auth.uid()");
  } else if (!row.definer) {
    fail(`public.${name}`, "not SECURITY DEFINER, cannot reach private");
  } else if (!row.auth_exec) {
    fail(`public.${name}`, "not executable by authenticated");
  } else {
    pass(`public.${name} derives auth.uid(), authenticated=true anon=${row.anon_exec}`);
  }
}

// ── 6 ──────────────────────────────────────────────────────────────────────
// Scoped to the functions these migrations govern. A public explicit-id
// overload of one of *these* names would mean the rework did not take.
console.log("\n4. no public explicit-id overload of a migrated function survives");
const governed = new Set(WRAPPERS.map(([name]) => name));
const leaked = rows.filter(
  (row) =>
    row.schema === "public" &&
    governed.has(row.name) &&
    /^p_user_id uuid/.test(row.args)
);
if (leaked.length) {
  for (const row of leaked) {
    fail(`public.${row.name}(${row.args})`, "public explicit-id overload");
  }
} else {
  pass("none");
}

// ── a standing finding, reported rather than failed ────────────────────────
//
// Other public functions take a p_user_id, are SECURITY DEFINER, and are
// granted to authenticated. That is the impersonation shape these migrations
// removed for the seven above, and it predates them: all of these appear in
// the pre-migration catalogue. They are reported here so the fact does not go
// missing, and not failed, because fixing them is a separate reviewed change
// rather than something this verification should imply has been done.
console.log("\n5. pre-existing public explicit-id definers (informational)");
const preexisting = rows.filter(
  (row) =>
    row.schema === "public" &&
    !governed.has(row.name) &&
    /^p_user_id uuid/.test(row.args) &&
    row.definer &&
    row.auth_exec
);
if (preexisting.length === 0) {
  console.log("  none");
} else {
  for (const row of preexisting) {
    console.log(
      `  NOTE  public.${row.name}(${row.args})  definer, granted to authenticated`
    );
  }
  console.log(
    "  See docs/read-migration-rpc-blockers.md. Not introduced by these " +
      "migrations and not fixed by them."
  );
}

const guard = find("public", "assert_identity_claim", "p_user_id uuid");
if (guard) fail("public.assert_identity_claim", "should have been dropped");
else pass("public.assert_identity_claim absent");

// ── verdict ────────────────────────────────────────────────────────────────
await sql.end({ timeout: 5 });

console.log("");
if (failures.length) {
  console.log(`${failures.length} CHECK(S) FAILED:\n  ${failures.join("\n  ")}\n`);
  process.exit(1);
}
console.log("All identity migration checks passed.\n");
