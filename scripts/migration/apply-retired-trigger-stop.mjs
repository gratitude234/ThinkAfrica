/**
 * Applies 20260915000004_stop_gamification_and_publication_capture_triggers.sql.
 *
 *   node scripts/migration/apply-retired-trigger-stop.mjs --dry-run
 *   node scripts/migration/apply-retired-trigger-stop.mjs --apply
 *
 * The same workflow as the scheduler scripts: there is no local migration
 * runner, so the reviewed file is sent over the direct connection inside one
 * transaction with a lock timeout. Dropping a trigger takes a brief exclusive
 * lock on its table, and the timeout keeps a busy table from queueing traffic
 * behind it.
 *
 * Both modes verify the result inside the transaction before it ends:
 *
 *   - none of the seven triggers is left, under any name;
 *   - every other trigger on likes, posts, profiles and post_reviews is exactly
 *     as it was;
 *   - all seven functions are still defined;
 *   - the point totals, badge rows and publication_events rows are unchanged;
 *   - a like and an unlike, simulated inside a savepoint that is always rolled
 *     back, leave the post author's point total where it was.
 *
 * `--dry-run` then rolls back. `--apply` commits only if every check passed,
 * and rolls back otherwise. The like simulation is rolled back in both modes.
 *
 * Nothing printed identifies a member or a post: only trigger names, counts
 * and pass or fail.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";

import { loadEnv, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const FILE = "20260915000004_stop_gamification_and_publication_capture_triggers.sql";
const TABLES = ["likes", "posts", "profiles", "post_reviews"];
const RETIRED = {
  on_like_points: "award_points_on_like",
  on_like_delete_points: "reverse_points_on_unlike",
  on_post_published_points: "award_points_on_publish",
  on_post_published_badges: "check_and_award_badges",
  on_points_updated: "check_points_badges",
  on_review_submitted_points: "award_points_on_review_submission",
  posts_capture_first_publication_event: "capture_first_publication_event",
};
const FUNCTIONS = Object.values(RETIRED);

const mode = process.argv.includes("--apply")
  ? "apply"
  : process.argv.includes("--dry-run")
    ? "dry-run"
    : null;

if (!mode) {
  console.error("\nPass --dry-run or --apply.\n");
  process.exit(2);
}

/** The migration, with its own transaction boundary removed so the caller owns it. */
function statements(file) {
  return readFileSync(resolve("supabase/migrations", file), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/^\s*begin;\s*$/im, "")
    .replace(/^\s*commit;\s*$/im, "");
}

const resolved = await resolveSupabaseUrl(postgres);
console.log(`\nConnected via ${resolved.via}`);
console.log(`Mode: ${mode}\n`);

const sql = postgres(resolved.url, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  fetch_types: false,
  onnotice: (notice) => console.log(`  notice: ${notice.message}`),
});

// postgres.js runs with fetch_types: false, so arrays are passed as JSON text.
const tablesJson = JSON.stringify(TABLES);
const functionsJson = JSON.stringify(FUNCTIONS);

const triggersQuery = (tx) => tx`
  select c.relname as table_name, t.tgname as trigger_name, p.proname as function_name,
         pg_catalog.pg_get_triggerdef(t.oid) as definition
    from pg_catalog.pg_trigger as t
    join pg_catalog.pg_class as c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    join pg_catalog.pg_proc as p on p.oid = t.tgfoid
   where n.nspname = 'public'
     and not t.tgisinternal
     and c.relname in (select pg_catalog.jsonb_array_elements_text(${tablesJson}::text::jsonb))
   order by 1, 2`;

const aggregatesQuery = (tx) => tx`
  select
    (select coalesce(pg_catalog.sum(points), 0)::bigint from public.profiles)::text as points_total,
    (select pg_catalog.count(*) from public.profiles where points > 0)::int as profiles_with_points,
    (select pg_catalog.count(*) from public.user_badges)::int as user_badges,
    (select pg_catalog.count(*) from public.badges)::int as badges,
    (select pg_catalog.count(*) from public.publication_events)::int as publication_events`;

/** A like and an unlike inside a savepoint that is always rolled back. */
async function simulateLike(tx) {
  const ROLLBACK = "simulation rollback";
  let result = { ran: false, unchangedAfterLike: false, unchangedAfterUnlike: false, reason: null };
  await tx
    .savepoint(async (sp) => {
      const [candidate] = await sp`
        select p.id as post_id, p.author_id, liker.id as liker_id
          from public.posts as p
          join lateral (
            select pr.id
              from public.profiles as pr
             where pr.id <> p.author_id
               and not exists (select 1 from public.likes as l where l.post_id = p.id and l.user_id = pr.id)
             limit 1
          ) as liker on true
         where p.status = 'published'
         order by p.published_at desc nulls last
         limit 1`;
      if (!candidate) {
        result.reason = "no published post and non-author member to simulate with";
        throw new Error(ROLLBACK);
      }
      const pointsOf = async () =>
        (await sp`select points::text as points from public.profiles where id = ${candidate.author_id}`)[0]?.points;
      const before = await pointsOf();
      await sp`insert into public.likes (post_id, user_id) values (${candidate.post_id}, ${candidate.liker_id})`;
      result.unchangedAfterLike = (await pointsOf()) === before;
      await sp`delete from public.likes where post_id = ${candidate.post_id} and user_id = ${candidate.liker_id}`;
      result.unchangedAfterUnlike = (await pointsOf()) === before;
      result.ran = true;
      throw new Error(ROLLBACK);
    })
    .catch((error) => {
      if (error instanceof Error && error.message === ROLLBACK) return;
      result.reason = `simulation failed: ${String(error?.code ?? "error")}`;
    });
  return result;
}

let outcome = "unknown";
try {
  await sql
    .begin(async (tx) => {
      await tx.unsafe("set local lock_timeout = '5s'");

      const before = await triggersQuery(tx);
      const presentRetired = before.filter((row) => row.trigger_name in RETIRED);
      console.log(`Retired triggers present: ${presentRetired.map((row) => `${row.table_name}.${row.trigger_name}`).join(", ") || "none"}`);
      console.log(`Other triggers on ${TABLES.join(", ")}: ${before.length - presentRetired.length}`);
      const aggregatesBefore = (await aggregatesQuery(tx))[0];
      console.log(`Before: ${JSON.stringify(aggregatesBefore)}`);

      const started = Date.now();
      await tx.unsafe(statements(FILE));
      console.log(`  ${mode === "apply" ? "applied" : "would apply"} ${FILE}  ${Date.now() - started}ms`);

      const after = await triggersQuery(tx);
      const failures = [];

      const stillRunning = await tx`
        select pg_catalog.count(*)::int as n
          from pg_catalog.pg_trigger as t
          join pg_catalog.pg_proc as p on p.oid = t.tgfoid
          join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
         where not t.tgisinternal
           and n.nspname = 'public'
           and p.proname in (select pg_catalog.jsonb_array_elements_text(${functionsJson}::text::jsonb))`;
      if (stillRunning[0].n !== 0) failures.push(`${stillRunning[0].n} trigger(s) still run a retired function`);

      const expected = before.filter((row) => !(row.trigger_name in RETIRED));
      if (JSON.stringify(expected) !== JSON.stringify(after)) {
        failures.push("another trigger on these tables changed");
      }

      const defined = await tx`
        select pg_catalog.count(distinct p.proname)::int as n
          from pg_catalog.pg_proc as p
          join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in (select pg_catalog.jsonb_array_elements_text(${functionsJson}::text::jsonb))`;
      if (defined[0].n !== FUNCTIONS.length) failures.push(`only ${defined[0].n} of ${FUNCTIONS.length} functions still defined`);

      const aggregatesAfter = (await aggregatesQuery(tx))[0];
      console.log(`After:  ${JSON.stringify(aggregatesAfter)}`);
      if (JSON.stringify(aggregatesBefore) !== JSON.stringify(aggregatesAfter)) {
        failures.push("a point total, badge or publication_events count changed");
      }

      const simulation = await simulateLike(tx);
      console.log(`  like simulation (rolled back): ${JSON.stringify(simulation)}`);
      if (!simulation.ran) failures.push(simulation.reason ?? "like simulation did not run");
      else if (!simulation.unchangedAfterLike || !simulation.unchangedAfterUnlike) {
        failures.push("a like or unlike still moved the author's points");
      }

      const aggregatesAfterSimulation = (await aggregatesQuery(tx))[0];
      if (JSON.stringify(aggregatesAfter) !== JSON.stringify(aggregatesAfterSimulation)) {
        failures.push("the like simulation left a trace");
      }

      if (failures.length > 0) {
        outcome = "failed";
        throw new Error(`verification failed: ${failures.join("; ")}`);
      }

      console.log(
        "  verified: seven triggers gone, other triggers unchanged, functions kept, totals and rows unchanged, likes award nothing"
      );
      if (mode === "dry-run") {
        outcome = "dry-run clean";
        throw new Error("rollback");
      }
      outcome = "applied";
    })
    .catch((error) => {
      if (error instanceof Error && error.message === "rollback") return;
      throw error;
    });

  console.log(
    outcome === "dry-run clean"
      ? "\nDry-run clean. Nothing was committed.\n"
      : outcome === "applied"
        ? "\nApplied and committed.\n"
        : `\nOutcome: ${outcome}\n`
  );
} finally {
  await sql.end({ timeout: 5 });
}
