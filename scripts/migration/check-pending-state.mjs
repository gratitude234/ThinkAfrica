/**
 * Which of the five `supabase/pending/` release candidates are actually live?
 *
 * Phase 2 recorded all five as unapplied, on the strength of their file
 * headers and the absence of a promoted migration. The live catalogue says
 * otherwise, which is exactly why the brief insists the catalogue is the
 * source of truth. This script checks each candidate against the objects it
 * would create, so the answer is evidence rather than inference.
 *
 * READ-ONLY.
 *
 *   node scripts/migration/check-pending-state.mjs
 */
import postgres from "postgres";
import { loadEnv, redact, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const { url, via } = await resolveSupabaseUrl(postgres);
console.log(`Supabase reached via: ${via}\n`);

const sql = postgres(url, {
  max: 1,
  prepare: false,
  connect_timeout: 15,
  connection: { statement_timeout: 30_000 },
  onnotice: () => {},
});

/** Each candidate, and the objects that prove whether it ran. */
const CANDIDATES = [
  {
    file: "author_subscriptions_publication_delivery_v1.sql",
    tables: ["author_subscriptions", "publication_events", "publication_deliveries"],
    functions: ["claim_publication_events", "capture_first_publication_event"],
  },
  {
    file: "author_subscriptions_ux_v2.sql",
    tables: ["author_subscription_events"],
    functions: ["set_author_relationship_v2", "list_my_author_subscriptions"],
  },
  {
    file: "topic_subscriptions_v1.sql",
    tables: ["topic_subscriptions"],
    functions: ["set_topic_subscription", "normalize_topic_key"],
  },
  {
    file: "ai_topic_suggestions_v1.sql",
    tables: ["ai_topic_suggestion_quotas"],
    functions: ["claim_ai_topic_suggestion_quota"],
    columns: [["posts", "research_keywords"]],
  },
  {
    file: "profile_private_projection_contract.sql",
    tables: [],
    functions: [],
    // Its whole effect is a grant change: table-level SELECT on profiles is
    // revoked and replaced with a column allowlist.
    check: async () => {
      const [row] = await sql`
        select count(*)::int as table_level
          from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'profiles'
           and privilege_type = 'SELECT' and grantee in ('anon', 'authenticated')`;
      const columns = await sql`
        select count(*)::int as column_level
          from information_schema.column_privileges
         where table_schema = 'public' and table_name = 'profiles'
           and privilege_type = 'SELECT' and grantee in ('anon', 'authenticated')`;
      return {
        detail: `table-level SELECT grants: ${row.table_level}, column-level: ${columns[0].column_level}`,
        applied: row.table_level === 0 && columns[0].column_level > 0,
      };
    },
  },
];

const results = [];

for (const candidate of CANDIDATES) {
  const present = [];
  const absent = [];

  for (const table of candidate.tables ?? []) {
    const [row] = await sql`
      select count(*)::int as n from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = ${table} and c.relkind = 'r'`;
    (row.n > 0 ? present : absent).push(`table ${table}`);
  }

  for (const fn of candidate.functions ?? []) {
    const [row] = await sql`
      select count(*)::int as n from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = ${fn}`;
    (row.n > 0 ? present : absent).push(`function ${fn}`);
  }

  for (const [table, column] of candidate.columns ?? []) {
    const [row] = await sql`
      select count(*)::int as n from information_schema.columns
      where table_schema = 'public' and table_name = ${table} and column_name = ${column}`;
    (row.n > 0 ? present : absent).push(`column ${table}.${column}`);
  }

  let verdict;
  let detail = "";
  if (candidate.check) {
    const custom = await candidate.check();
    verdict = custom.applied ? "APPLIED" : "NOT APPLIED";
    detail = custom.detail;
  } else if (absent.length === 0) {
    verdict = "APPLIED";
  } else if (present.length === 0) {
    verdict = "NOT APPLIED";
  } else {
    verdict = "PARTIAL";
  }

  results.push({ file: candidate.file, verdict, present, absent, detail });
}

for (const result of results) {
  console.log(`${result.verdict.padEnd(12)} ${result.file}`);
  if (result.detail) console.log(`             ${result.detail}`);
  for (const item of result.present) console.log(`             present: ${item}`);
  for (const item of result.absent) console.log(`             ABSENT:  ${item}`);
  console.log();
}

// Objects the repository does not account for at all. A dump carries them
// whether or not anyone remembers why they exist.
console.log("--- live tables with no CREATE TABLE in supabase/migrations ---");
const unaccounted = await sql`
  select c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relname in ('content_reports', 'post_views', 'webinars',
                       'webinar_attendees', 'webinar_questions')
   order by 1`;
for (const row of unaccounted) console.log(`  public.${row.name}`);

console.log("\n--- Debate-era functions surviving the table drop ---");
const debate = await sql`
  select p.proname as name
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname like '%debate%' or p.proname like '%_v1_5'
          or p.proname like '%cross_examination%' or p.proname like '%motion_vote%'
          or p.proname like '%question_upvote%')
   order by 1`;
for (const row of debate) console.log(`  public.${row.name}()`);

await sql.end({ timeout: 5 });
process.exitCode = 0;
void redact;
