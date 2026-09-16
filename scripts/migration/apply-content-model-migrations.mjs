/**
 * Applies the three Phase 2I content-model migrations, in order, as one
 * transaction.
 *
 *   node scripts/migration/apply-content-model-migrations.mjs --dry-run
 *   node scripts/migration/apply-content-model-migrations.mjs --apply
 *
 *   20260915000005_normalize_post_classification.sql
 *   20260915000006_canonical_post_classification.sql
 *   20260915000007_retire_review_publication_locks.sql
 *
 * They go together: 000006 refuses to run until 000005 has normalized the rows,
 * and 000007 refuses to run until 000006 has changed the contract. Sending them
 * as one transaction means the database is never left between two of them.
 *
 * There is no local migration runner, so the reviewed files are sent over the
 * direct connection with a lock timeout. 000005 and 000006 each take a brief
 * exclusive lock on posts; the timeout keeps a busy table from queueing traffic
 * behind them.
 *
 * Both modes verify inside the transaction, before it ends:
 *
 *   - the classification is canonical: no research, no policy_brief, no genre;
 *   - Posts stay Posts and Articles absorb exactly the legacy Research rows;
 *   - every other column of every row is untouched, by hash, including
 *     updated_at, and 000006 and 000007 change no row at all;
 *   - the status histogram is identical, so nothing was published, withdrawn or
 *     unpublished by a normalization;
 *   - notifications, badges, publication events, sources and edit drafts are
 *     unchanged, so no trigger fired a side effect;
 *   - the contract is in force and the retired vocabulary is unreachable;
 *   - and six writes, simulated inside savepoints that are always rolled back,
 *     behave the way the new application needs them to: an Article and a Post
 *     insert with no `type` at all, a legacy `type` write is mapped, and
 *     research, an untitled Article and a genre are refused or nulled.
 *
 * `--dry-run` then rolls back. `--apply` commits only if every check passed, and
 * rolls back otherwise. The simulations are rolled back in both modes.
 *
 * Nothing printed identifies a member or a post: counts, hashes, constraint
 * names and pass or fail.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";

import { loadEnv, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const FILES = [
  "20260915000005_normalize_post_classification.sql",
  "20260915000006_canonical_post_classification.sql",
  "20260915000007_retire_review_publication_locks.sql",
];

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

/**
 * Two hashes, for two different questions.
 *
 * `row_hash` excludes the three columns this work is allowed to change, so it
 * answers "did anything else about any row move". `full_hash` includes them, so
 * it answers "did this file change any row at all" for the two files that must
 * not change one.
 *
 * Taken as four small statements rather than one wide select: seventeen scalar
 * subqueries in a single statement, two of them serialising every post body,
 * exceeded the role's statement timeout against production. Split, each one is
 * cheap, and a timeout names the thing that was slow.
 */
/**
 * Times one snapshot query, so a statement timeout names the statement that
 * was slow rather than a line number.
 */
async function timed(label, run) {
  const started = Date.now();
  const [row] = await run();
  const elapsed = Date.now() - started;
  if (elapsed > 1000) console.log(`    snapshot ${label}: ${elapsed}ms`);
  return row;
}

async function snapshot(tx, full = true) {
  const classification = await timed("classification", () => tx`
    select
      (count(*))::int as posts,
      (count(*) filter (where content_kind = 'post'))::int as kind_post,
      (count(*) filter (where content_kind = 'article'))::int as kind_article,
      (count(*) filter (where content_kind = 'research'))::int as kind_research,
      (count(*) filter (where content_kind is null))::int as kind_null,
      (count(*) filter (where type = 'blog'))::int as type_blog,
      (count(*) filter (where type = 'essay'))::int as type_essay,
      (count(*) filter (where type = 'policy_brief'))::int as type_policy_brief,
      (count(*) filter (where type = 'research'))::int as type_research,
      (count(*) filter (where article_format is not null))::int as with_genre
      from public.posts`);

  // Everything below scans a whole table. Against production those measured
  // 3s, 50s and 104s, so taking them after every file rather than only where
  // they prove something was most of this transaction's runtime, and most of
  // the time it held its locks. A cheap snapshot is the counts alone.
  const statuses = full
    ? await timed("statuses", () => tx`
    select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) as statuses
      from (select status, count(*) as n from public.posts group by status) as s`)
    : { statuses: null };

  // to_jsonb() is computed once and both hashes read it, so this is one pass
  // over the table rather than two serialisations of every post body.
  const hashes = full
    ? await timed("hashes", () => tx`
    select
      coalesce(md5(string_agg(
        md5((j - 'type' - 'content_kind' - 'article_format')::text), '' order by id)), '') as row_hash,
      coalesce(md5(string_agg(md5(j::text), '' order by id)), '') as full_hash
      from (select p.id as id, to_jsonb(p) as j from public.posts as p) as serialised`)
    : { row_hash: null, full_hash: null };

  const side = full
    ? await timed("side tables", () => tx`
    select
      (select count(*) from public.notifications)::int as notifications,
      (select count(*) from public.user_badges)::int as user_badges,
      (select count(*) from public.publication_events)::int as publication_events,
      (select count(*) from public.post_references)::int as post_references,
      (select count(*) from public.post_edit_drafts)::int as post_edit_drafts`)
    : {};

  return { ...classification, ...statuses, ...hashes, ...side };
}

/** Side tables no migration here may touch. */
const SIDE_TABLES = [
  "notifications",
  "user_badges",
  "publication_events",
  "post_references",
  "post_edit_drafts",
];

const ROLLBACK = "simulation rollback";

/** Runs `write` in a savepoint that is always rolled back, expecting it to succeed. */
async function accepted(tx, label, write) {
  const outcome = { label, accepted: false, row: null, error: null };
  await tx
    .savepoint(async (sp) => {
      outcome.row = await write(sp);
      outcome.accepted = true;
      throw new Error(ROLLBACK);
    })
    .catch((error) => {
      if (error instanceof Error && error.message === ROLLBACK) return;
      outcome.error = error?.code ?? "error";
    });
  return outcome;
}

/** Runs `write` in a savepoint that is always rolled back, expecting a refusal. */
async function refused(tx, label, write) {
  const outcome = { label, refused: false, constraint: null };
  await tx
    .savepoint(async (sp) => {
      await write(sp);
      throw new Error("ACCEPTED");
    })
    .catch((error) => {
      if (error instanceof Error && error.message === "ACCEPTED") return;
      outcome.refused = true;
      outcome.constraint = error?.constraint_name ?? error?.code ?? "refused";
    });
  return outcome;
}

/**
 * The six writes the new application depends on, as the database will see them.
 *
 * Every one inserts a draft owned by an existing member, reads the row back,
 * and rolls it back. The author id is never printed. The slugs are
 * scratch values that never reach a commit.
 */
async function simulateWrites(tx) {
  const [author] = await tx`select id from public.profiles limit 1`;
  if (!author) return { ran: false, reason: "no profile to author a simulated draft with" };

  const stamp = `phase2i-sim-${Date.now()}`;
  const draft = (extra) => ({
    author_id: author.id,
    status: "draft",
    content: "<p>simulated</p>",
    excerpt: "simulated",
    ...extra,
  });

  const insert = (sp, values) => sp`
    insert into public.posts ${sp(values)}
    returning type, content_kind, article_format, title is not null as titled`;

  const results = [];

  // 1. An Article, written the way the Phase 2I application writes one: a
  //    title and a content_kind, and no `type` at all.
  results.push(
    await accepted(tx, "article insert with no type", async (sp) => {
      const [row] = await insert(
        sp,
        draft({ slug: `${stamp}-article`, title: "A simulated Article", content_kind: "article" })
      );
      return row;
    })
  );

  // 2. A Post: no title, no type.
  results.push(
    await accepted(tx, "post insert with no type or title", async (sp) => {
      const [row] = await insert(sp, draft({ slug: `${stamp}-post`, content_kind: "post" }));
      return row;
    })
  );

  // 3. A legacy client that still sends only `type` is mapped, not refused.
  results.push(
    await accepted(tx, "legacy type=policy_brief insert is mapped to an Article", async (sp) => {
      const [row] = await insert(
        sp,
        draft({ slug: `${stamp}-legacy`, title: "A simulated legacy brief", type: "policy_brief" })
      );
      return row;
    })
  );

  // 4. Genre cannot be reintroduced, even when asked for explicitly.
  results.push(
    await accepted(tx, "article_format is nulled on write", async (sp) => {
      const [row] = await insert(
        sp,
        draft({
          slug: `${stamp}-genre`,
          title: "A simulated genre attempt",
          content_kind: "article",
          article_format: "policy_brief",
        })
      );
      return row;
    })
  );

  // 5. Research is not a kind any more.
  results.push(
    await refused(tx, "content_kind=research is refused", async (sp) => {
      await insert(
        sp,
        draft({ slug: `${stamp}-research`, title: "A simulated research paper", content_kind: "research" })
      );
    })
  );

  // 6. An Article still requires a title. That rule is the product.
  results.push(
    await refused(tx, "untitled article is refused", async (sp) => {
      await insert(sp, draft({ slug: `${stamp}-untitled`, content_kind: "article" }));
    })
  );

  return { ran: true, results };
}

/** Aggregates for the report. No content, no ids. */
const measurements = (tx) => tx`
  select
    (select count(*) from public.posts where in_response_to is not null)::int as responses,
    (select count(*) from public.posts where in_response_to is not null and status = 'draft')::int as response_drafts,
    (select count(*) from public.posts where citation_id is not null)::int as with_citation,
    (select count(*) from public.posts where published_version_id is not null)::int as with_version,
    (select count(*) from public.posts where status = 'pending')::int as pending,
    (select count(*) from public.notifications where type = 'post_approved')::int as post_approved,
    (select count(*) from public.notifications where type = 'post_approved' and message is null)::int as post_approved_null_message,
    (select count(*) from pg_catalog.pg_attribute
      where attrelid = 'public.posts'::regclass and attname = 'editorial_updated_at' and not attisdropped)::int as editorial_updated_at_column`;

let outcome = "unknown";
const resolved = await resolveSupabaseUrl(postgres);
console.log(`\nConnected via ${resolved.via}`);
console.log(`Mode: ${mode}\n`);

/**
 * Supavisor's session-mode pool for this tenant refuses a connection often
 * enough to fail a run that has nothing wrong with it: a checkout timeout, a
 * connection failure, or an authentication handshake that does not finish
 * inside the window.
 *
 * Every one of those happens before or instead of a commit, so the transaction
 * cannot have been half-applied and retrying is as safe under --apply as under
 * --dry-run. A failure that is not connection-class is never retried: a
 * verification that failed is a result, not a flake.
 */
const MAX_ATTEMPTS = 4;
const TRANSIENT_CODES = new Set(["08000", "08001", "08003", "08006", "57P01"]);

function isTransientConnectionFailure(error) {
  const message = String(error?.message ?? "");
  if (error?.code === "XX000") {
    return /ECHECKOUTTIMEOUT|check out connection/i.test(message);
  }
  if (TRANSIENT_CODES.has(error?.code)) return true;
  return /authentication did not complete|Failed to connect to database/i.test(message);
}

async function run(sql) {
  await sql
    .begin(async (tx) => {
      await tx.unsafe("set local lock_timeout = '5s'");
      // The verification reads are heavier than the migrations themselves, and
      // the role's own statement timeout is short. lock_timeout is what keeps a
      // busy table from queueing traffic behind this, and it stays at 5s.
      await tx.unsafe("set local statement_timeout = '120s'");
      // Printed rather than assumed: a pooler that ignores SET LOCAL would
      // otherwise look like a query that is genuinely too slow.
      const [limits] = await tx`
        select current_setting('statement_timeout') as statement_timeout,
               current_setting('lock_timeout') as lock_timeout`;
      console.log(`Timeouts in force: statement ${limits.statement_timeout}, lock ${limits.lock_timeout}\n`);

      const failures = [];
      const before = await snapshot(tx);
      console.log("Before:");
      console.log(`  posts ${before.posts}  kind post/article/research/null ${before.kind_post}/${before.kind_article}/${before.kind_research}/${before.kind_null}`);
      console.log(`  type blog/essay/policy_brief/research ${before.type_blog}/${before.type_essay}/${before.type_policy_brief}/${before.type_research}  with genre ${before.with_genre}`);
      console.log(`  statuses ${JSON.stringify(before.statuses)}`);

      const measuredBefore = (await measurements(tx))[0];
      console.log(`  residue ${JSON.stringify(measuredBefore)}`);

      const stages = {};
      for (const file of FILES) {
        const started = Date.now();
        await tx.unsafe(statements(file));
        // Full after the normalization, whose effect on every other column has
        // to be proved by hash, and full after the last file. Cheap after the
        // contract change: it and the lock retirement contain no DML at all,
        // and are proved together below.
        stages[file] = await snapshot(tx, file !== FILES[1]);
        console.log(`  ${mode === "apply" ? "applied" : "would apply"} ${file}  ${Date.now() - started}ms`);
      }

      const after5 = stages[FILES[0]];
      const after = stages[FILES[2]];

      console.log("After:");
      console.log(`  posts ${after.posts}  kind post/article/research/null ${after.kind_post}/${after.kind_article}/${after.kind_research}/${after.kind_null}`);
      console.log(`  type blog/essay/policy_brief/research ${after.type_blog}/${after.type_essay}/${after.type_policy_brief}/${after.type_research}  with genre ${after.with_genre}`);
      console.log(`  statuses ${JSON.stringify(after.statuses)}`);

      // The normalization: only the classification moved, and it moved exactly
      // where the mapping says.
      if (after.posts !== before.posts) failures.push(`post count changed: ${before.posts} to ${after.posts}`);
      if (after.kind_post !== before.kind_post) failures.push(`Post count changed: ${before.kind_post} to ${after.kind_post}`);
      if (after.kind_article !== before.kind_article + before.kind_research) {
        failures.push(`Article count is ${after.kind_article}, expected ${before.kind_article + before.kind_research}`);
      }
      if (after.kind_research !== 0 || after.type_research !== 0) failures.push("research survived the normalization");
      if (after.type_policy_brief !== 0) failures.push("a policy_brief type survived the normalization");
      if (after.with_genre !== 0) failures.push("an article_format survived the normalization");
      if (after.kind_null !== 0) failures.push("a null content_kind survived the normalization");
      if (after.row_hash !== before.row_hash) {
        failures.push("a column other than type, content_kind or article_format changed, or a row was added or removed");
      }
      if (JSON.stringify(after.statuses) !== JSON.stringify(before.statuses)) {
        failures.push(`a status moved: ${JSON.stringify(before.statuses)} to ${JSON.stringify(after.statuses)}`);
      }

      // The contract change and the lock retirement must change no row at all.
      // Proved together against the state the normalization left: neither file
      // contains a single DML statement, and separating them would cost another
      // whole-table hash to distinguish two files that cannot differ.
      if (after.full_hash !== after5.full_hash) {
        failures.push("20260915000006 or 20260915000007 changed a row");
      }

      for (const table of SIDE_TABLES) {
        if (after[table] !== before[table]) {
          failures.push(`${table} changed: ${before[table]} to ${after[table]}`);
        }
      }

      // The contract is in force.
      const constraints = await tx`
        select c.conname, pg_catalog.pg_get_constraintdef(c.oid) as definition
          from pg_catalog.pg_constraint as c
         where c.conrelid = 'public.posts'::regclass
           and c.contype = 'c'
           and c.conname in (
             'posts_content_kind_check', 'posts_type_check', 'posts_article_format_check',
             'posts_legacy_type_content_kind_check', 'posts_title_required_unless_post_check'
           )
         order by 1`;
      console.log("Contract:");
      for (const row of constraints) console.log(`  ${row.conname}  ${row.definition}`);
      if (constraints.length !== 5) failures.push(`${constraints.length} of 5 classification constraints present`);
      for (const row of constraints) {
        if (/research|policy_brief/.test(row.definition)) {
          failures.push(`${row.conname} still admits a review-era value`);
        }
      }

      const [notNull] = await tx`
        select attnotnull as not_null from pg_catalog.pg_attribute
         where attrelid = 'public.posts'::regclass and attname = 'content_kind'`;
      if (notNull?.not_null !== true) failures.push("posts.content_kind is still nullable");

      // The locks are gone from the three functions, by definition rather than
      // by intention.
      const [functions] = await tx`
        select
          position('research' in pg_catalog.pg_get_functiondef('public.guard_locked_post_write()'::regprocedure)) as guard_research,
          position('citation_id' in pg_catalog.pg_get_functiondef('public.guard_locked_post_write()'::regprocedure)) as guard_citation,
          position('research' in pg_catalog.pg_get_functiondef('public.is_post_editable(uuid)'::regprocedure)) as editable_research,
          position('editorial_updated_at' in pg_catalog.pg_get_functiondef('public.apply_post_edit_draft(uuid)'::regprocedure)) as apply_editorial_column,
          position('Reviewed publications are locked' in pg_catalog.pg_get_functiondef('public.apply_post_edit_draft(uuid)'::regprocedure)) as apply_lock`;
      if (functions.guard_research > 0) failures.push("guard_locked_post_write still names research");
      if (functions.guard_citation === 0) failures.push("guard_locked_post_write lost the citation_id rule");
      if (functions.editable_research > 0) failures.push("is_post_editable still names research");
      if (functions.apply_editorial_column > 0) failures.push("apply_post_edit_draft still writes editorial_updated_at");
      if (functions.apply_lock > 0) failures.push("apply_post_edit_draft still refuses reviewed publications");

      // Six writes, as the new application will make them.
      const simulation = await simulateWrites(tx);
      console.log("Write simulation (rolled back):");
      if (!simulation.ran) {
        failures.push(simulation.reason);
      } else {
        for (const result of simulation.results) console.log(`  ${JSON.stringify(result)}`);
        const [article, post, legacy, genre, research, untitled] = simulation.results;
        if (!article.accepted || article.row?.type !== "essay" || article.row?.content_kind !== "article") {
          failures.push("an Article written without a type did not come back as an essay-typed Article");
        }
        if (!post.accepted || post.row?.type !== "blog" || post.row?.content_kind !== "post") {
          failures.push("a Post written without a type did not come back as a blog-typed Post");
        }
        if (!legacy.accepted || legacy.row?.type !== "essay" || legacy.row?.content_kind !== "article") {
          failures.push("a legacy policy_brief write was not mapped to an Article");
        }
        if (!genre.accepted || genre.row?.article_format !== null) {
          failures.push("an article_format survived a write");
        }
        if (!research.refused) failures.push("content_kind=research was accepted");
        if (!untitled.refused) failures.push("an untitled Article was accepted");
      }

      const afterSimulation = await snapshot(tx);
      if (afterSimulation.full_hash !== after.full_hash) failures.push("the write simulation left a trace");
      for (const table of SIDE_TABLES) {
        if (afterSimulation[table] !== after[table]) failures.push(`the write simulation left a trace in ${table}`);
      }

      const measuredAfter = (await measurements(tx))[0];
      console.log(`Residue after: ${JSON.stringify(measuredAfter)}`);

      if (failures.length > 0) {
        outcome = "failed";
        throw new Error(`verification failed: ${failures.join("; ")}`);
      }

      console.log(
        "  verified: classification canonical, no other column moved, statuses held, side tables untouched, contract in force, locks retired, writes behave"
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
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  const sql = postgres(resolved.url, {
    max: 1,
    prepare: false,
    connect_timeout: 20,
    fetch_types: false,
    onnotice: (notice) => console.log(`  notice: ${notice.message}`),
  });

  try {
    await run(sql);
    break;
  } catch (error) {
    if (attempt < MAX_ATTEMPTS && isTransientConnectionFailure(error)) {
      console.log(
        `  connection failed (${error?.code ?? "?"}). Retrying, attempt ${attempt + 1} of ${MAX_ATTEMPTS}.`
      );
      await new Promise((wait) => setTimeout(wait, 2000 * attempt));
      continue;
    }
    throw error;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

console.log(
  outcome === "dry-run clean"
    ? "\nDry-run clean. Nothing was committed.\n"
    : outcome === "applied"
      ? "\nApplied and committed.\n"
      : `\nOutcome: ${outcome}\n`
);
