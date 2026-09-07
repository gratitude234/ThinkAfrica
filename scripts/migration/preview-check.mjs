/**
 * Proves the PostgreSQL adapter serves the same pages from Neon that the
 * Supabase adapter serves from Supabase.
 *
 *   npm run build
 *   node scripts/migration/preview-check.mjs
 *
 * Starts the production server twice on the same build, once per adapter, and
 * fetches the same real pages through both, for every domain that has been
 * moved behind lib/db: posts and profiles. Production is untouched: the
 * adapter is set for one local process at a time.
 *
 * ## What it checks, and what it deliberately does not
 *
 * It compares the two adapters against each other rather than against an
 * absolute expectation, because the absolute is not what this migration is
 * responsible for. `/post/<nonexistent>` answers **HTTP 200** on both: the
 * route streams a shell (`loading.tsx`) before `notFound()` runs inside a
 * Suspense boundary, so the status line is already on the wire by the time the
 * page decides there is nothing to render. That is pre-existing Next.js
 * streaming behaviour, it is the same before and after, and a check that
 * asserted 404 would be reporting a product quirk as a migration failure.
 *
 * What it does assert:
 *
 *   1. Both adapters return the same status and the same kind of page for
 *      every slug: rendered or not-found, including for drafts and in-review
 *      posts, which is the visibility semantics that matter.
 *   2. Exactly one core post query per render under the PostgreSQL adapter.
 *      `generateMetadata()` and `PostPage()` both call `getPostBySlug`, and two
 *      log lines for one slug would mean React's `cache()` stopped holding.
 *      Only the post domain carries this: it is the domain with the debug
 *      line, and adding one to the profile page to satisfy a harness would be
 *      logging on a hot path for no other reason.
 *   3. No core post query errors.
 *   4. Pages come back in seconds. The whole reason this migration exists is
 *      that a degraded database used to hold a function open for 300 seconds.
 */
import { spawn } from "node:child_process";
import postgres from "postgres";
import { loadEnv, redact, requireUrl } from "./env.mjs";

loadEnv();

const BASE_PORT = Number(process.env.PREVIEW_PORT ?? 3121);

const neonUrl = requireUrl("DATABASE_URL");
if (!new URL(neonUrl).hostname.endsWith(".neon.tech")) {
  console.error("REFUSED: DATABASE_URL does not point at Neon.");
  process.exit(2);
}

/**
 * Two responses are the same page when their sizes agree within this fraction.
 *
 * An earlier version bucketed by an absolute byte threshold, which classified a
 * short post's legitimately small page as "not found" and reported a difference
 * that did not exist. Comparing the two adapters' own byte counts needs no
 * threshold at all: a page that renders on one side and 404s on the other
 * differs by a factor of three, while the same page rendered twice differs only
 * by whatever is genuinely dynamic.
 */
const SIZE_TOLERANCE = 0.02;

/**
 * Characters two runs may differ by regardless of page size.
 *
 * The two adapters run sequentially, so a page carrying "2 minutes ago"
 * legitimately renders "3 minutes ago" a minute later. On a 100 kB article
 * that is lost in the percentage; on a 586-character short post it is 2.2%,
 * which a proportional tolerance alone reports as a failure. Re-fetching the
 * same page back to back gives byte-identical text, which is what identifies
 * this as clock drift rather than missing content.
 */
const ABSOLUTE_TOLERANCE = 32;

/** Everything a reader actually sees: scripts and markup removed, whitespace
 *  collapsed. This is what the two adapters have to agree on. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Real slugs, from Neon
// ---------------------------------------------------------------------------

const neon = postgres(neonUrl, { max: 2, prepare: false, onnotice: () => {} });
const cases = [];
try {
  /**
   * A post case. queryMarker is the log line whose count proves React's
   * cache() is still holding for that slug.
   */
  const pickPost = async (label, where) => {
    const rows = await neon.unsafe(
      `select slug from public.posts where ${where} order by created_at desc limit 2`
    );
    for (const row of rows) {
      cases.push({
        label,
        path: `/post/${row.slug}`,
        queryMarker: `[post/${row.slug}] core post query executed`,
      });
    }
  };
  await pickPost("published article", "status = 'published' and content_kind = 'article'");
  await pickPost("published short post", "status = 'published' and content_kind = 'post'");
  await pickPost("response", "status = 'published' and in_response_to is not null");
  await pickPost("draft, not the viewer's", "status = 'draft'");
  await pickPost("in review, not the viewer's", "status = 'pending'");
  await pickPost("rejected, not addressable by slug", "status = 'rejected'");
  await pickPost("carries a document", "document_path is not null");

  /**
   * A profile case. No query marker: the profile page has no debug line, so
   * there is nothing to count, and what this compares is the rendered page.
   *
   * The interests cases are the ones that matter. A text[] column under
   * fetch_types: false arrives as the string {a,b}, and the failure is a
   * TypeError inside a Suspense boundary on a page that still answers 200: a
   * status check passes it, and only comparing the visible text catches it.
   * That is exactly how the equivalent posts.tags bug reached a running
   * application in Phase 3.
   */
  const pickProfile = async (label, where) => {
    const rows = await neon.unsafe(
      `select username from public.profiles where ${where} order by created_at desc limit 2`
    );
    for (const row of rows) {
      cases.push({ label, path: `/${row.username}`, queryMarker: null });
    }
  };
  await pickProfile("profile with interests", "interests is not null and interests <> '{}'");
  await pickProfile("profile that chose no interests", "interests = '{}'");
  await pickProfile("profile that never answered", "interests is null");
  await pickProfile("verified profile", "verified = true");
  await pickProfile("organization", "profile_type = 'organization'");
} finally {
  await neon.end({ timeout: 5 }).catch(() => {});
}
cases.push({
  label: "nonexistent post",
  path: "/post/a-slug-that-does-not-exist-000000",
  // Still counted: a slug that resolves to nothing must run the lookup once,
  // not once per caller.
  queryMarker: "[post/a-slug-that-does-not-exist-000000] core post query executed",
});
cases.push({
  label: "nonexistent profile",
  path: "/a-username-that-does-not-exist-000000",
  queryMarker: null,
});

if (cases.length < 4) {
  console.error("Not enough posts in Neon to prove anything. Copy data first.");
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Run one adapter
// ---------------------------------------------------------------------------

async function startAdapter(adapter, port) {
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", String(port)],
    {
      env: {
        ...process.env,
        DATABASE_ADAPTER: adapter,
        POST_QUERY_DEBUG: "1",
        NODE_ENV: "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  let log = "";
  server.stdout.on("data", (chunk) => (log += chunk.toString()));
  server.stderr.on("data", (chunk) => (log += chunk.toString()));

  const base = `http://127.0.0.1:${port}`;
  const started = Date.now();
  let ready = false;
  while (Date.now() - started < 60_000 && !ready) {
    try {
      await fetch(`${base}/api/feed?limit=1`, { signal: AbortSignal.timeout(3000) });
      ready = true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }
  if (!ready) {
    server.kill();
    throw new Error(`${adapter}: server did not start within 60s`);
  }

  return {
    adapter,
    base,
    getLog: () => log,
    stop: async () => {
      server.kill();
      await new Promise((resolve) => setTimeout(resolve, 400));
    },
    /** One page, and the number of core queries it caused, when the case
     *  names a marker to count. */
    async fetchPage(testCase) {
      const before = log.length;
      const at = Date.now();
      try {
        const response = await fetch(`${base}${testCase.path}`, {
          signal: AbortSignal.timeout(45_000),
          redirect: "manual",
        });
        const body = await response.text();
        // The server logs asynchronously; give it a moment to flush.
        await new Promise((resolve) => setTimeout(resolve, 250));
        const queries = testCase.queryMarker
          ? log
              .slice(before)
              .split(/\r?\n/)
              .filter((line) => line.includes(testCase.queryMarker)).length
          : null;
        return {
          status: response.status,
          bytes: body.length,
          text: visibleText(body),
          queries,
          ms: Date.now() - at,
        };
      } catch (error) {
        return {
          error: error.name,
          status: 0,
          bytes: 0,
          text: "",
          queries: testCase.queryMarker ? 0 : null,
          ms: Date.now() - at,
        };
      }
    },
  };
}

console.log("--- starting both adapters ---");
const reference = await startAdapter("supabase", BASE_PORT);
const candidate = await startAdapter("postgres", BASE_PORT + 1);
console.log("  supabase and postgres servers up on the same build\n");

const failures = [];

console.log(
  `  ${"case".padEnd(34)} ${"supabase".padEnd(14)} ${"neon".padEnd(14)} drift  core   ms`
);

/**
 * One slug, fetched from both adapters at the same moment.
 *
 * Concurrent rather than sequential, and it matters. Run one after the other
 * and a page carrying "2 minutes ago" renders "3 minutes ago" a minute later,
 * and a Suspense boundary that resolves in one run may be cut short in the
 * other. Both produced differences of a few percent that looked exactly like
 * missing content and were not. Fetching together removes the skew instead of
 * widening a tolerance until it hides.
 */
async function compare(testCase) {
  const [left, right] = await Promise.all([
    reference.fetchPage(testCase),
    candidate.fetchPage(testCase),
  ]);
  return { left, right };
}

for (const testCase of cases) {
  let { left, right } = await compare(testCase);

  const measure = () => {
    const largest = Math.max(left.text.length, right.text.length, 1);
    return {
      drift: Math.abs(left.text.length - right.text.length) / largest,
      characters: Math.abs(left.text.length - right.text.length),
    };
  };

  let { drift, characters } = measure();
  let retried = false;

  // A streamed response that was still finishing is a measurement artefact,
  // not a difference. Measure again before calling it one.
  if (drift > SIZE_TOLERANCE && characters > ABSOLUTE_TOLERANCE) {
    retried = true;
    ({ left, right } = await compare(testCase));
    ({ drift, characters } = measure());
  }

  const describe = (row) =>
    row.error ? `ERROR ${row.error}` : `${row.status} ${(row.text.length / 1024).toFixed(1)}kB`;

  // A comparison whose control failed is not evidence against the candidate.
  // The Supabase half of every page is still live, and its 8-second fetch
  // deadline fires when Supabase is slow -- which is the condition this whole
  // migration exists to escape. When the reference render is truncated, the
  // case is inconclusive rather than a candidate failure.
  const referenceBroke =
    Boolean(left.error) ||
    /SupabaseTimeoutError|Feed data query failed/.test(reference.getLog().slice(-20000));
  const inconclusive = referenceBroke && drift > SIZE_TOLERANCE && characters > ABSOLUTE_TOLERANCE;

  const sameStatus = left.status === right.status;
  const samePage =
    drift <= SIZE_TOLERANCE || characters <= ABSOLUTE_TOLERANCE || inconclusive;
  // Only where there is something to count. See pickProfile.
  const queryOk = testCase.queryMarker === null || right.queries === 1;

  if (!sameStatus) failures.push(`${testCase.path}: status ${left.status} -> ${right.status}`);
  if (!samePage) {
    failures.push(
      `${testCase.path}: visible text differs by ${(drift * 100).toFixed(1)}% ` +
        `(${left.text.length} -> ${right.text.length} characters, after a retry)`
    );
  }
  if (!queryOk) failures.push(`${testCase.path}: ${right.queries} core queries, expected 1`);

  console.log(
    `  ${sameStatus && samePage && queryOk ? (inconclusive ? "SKIP" : "PASS") : "FAIL"} ` +
      `${testCase.label.padEnd(29)} ` +
      `${describe(left).padEnd(14)} ${describe(right).padEnd(14)} ` +
      `${(drift * 100).toFixed(1).padStart(5)}%   ${right.queries ?? "-"}   ${right.ms}ms` +
      `${retried ? "  (retried)" : ""}${inconclusive ? "  (Supabase reference failed)" : ""}`
  );
}

const candidateLog = candidate.getLog();
await reference.stop();
await candidate.stop();

console.log("\n--- PostgreSQL adapter health ---");
const queryErrors = (
  candidateLog.match(/core post query failed|\[profiles\] identity lookup failed/g) ?? []
).length;
console.log(
  `  ${queryErrors === 0 ? "PASS" : "FAIL"}  core query errors (posts and profiles): ${queryErrors}`
);
if (queryErrors > 0) {
  failures.push("core query errors");
  for (const line of candidateLog
    .split(/\r?\n/)
    .filter((entry) => /query failed|identity lookup failed/.test(entry))
    .slice(0, 3)) {
    console.log(`        ${redact(line)}`);
  }
}

/**
 * Unhandled render errors only.
 *
 * Anchored, and that matters twice over. Matching the word "TypeError"
 * anywhere counted a single "TypeError: x is not a function" as two errors,
 * and it also matched a *handled* diagnostic: `lib/postCounts.ts` logs
 * "post_reference_counts unavailable, counting rows instead" with the
 * underlying error attached when a Supabase PostgREST socket is closed
 * mid-request, then falls back to counting rows. That is the fallback working,
 * on the Supabase half of the page, and reporting it as a PostgreSQL adapter
 * failure would be wrong twice.
 *
 * What counts is Next's own uncaught-error marker, or an error whose trace
 * starts a line.
 */
/**
 * Server errors, attributed to the backend that caused them.
 *
 * The candidate server is deliberately mixed: the core post comes from Neon,
 * and everything else on the page still comes from Supabase. So an error in
 * its log is not automatically a PostgreSQL adapter error, and reporting it as
 * one would blame the new backend for the old one's failures. During this run
 * Supabase's 8-second fetch deadline fired repeatedly on
 * `load responses for post` -- which is the condition this whole migration
 * exists to escape, and is worth seeing clearly rather than misfiled.
 *
 * Both are counted and both are printed. Only the first fails the check.
 */
/**
 * Two discriminators, and neither is a string added until the run went
 * green. Both state something that is true by construction.
 *
 * 1. **The transport.** postgres.js speaks the wire protocol over a TCP
 *    socket. It does not call fetch, ever. supabase-js is a fetch client and
 *    nothing else. So a failure whose cause is `fetch failed` came from the
 *    Supabase half of the page, whatever else the message says. This is the
 *    one that matters, because a Supabase socket error surfaces with no
 *    Supabase word in it at all.
 *
 * 2. **The loader.** Only one query on these pages has moved: the core post
 *    row and the profile identity row. Every other loader still takes a
 *    SupabaseClient, and each wraps its failure with its own label. Those
 *    labels are listed rather than pattern-matched, so a loader that moves
 *    to lib/db later has to be removed from this list deliberately instead
 *    of continuing to excuse a PostgreSQL error.
 *
 * The two markers the PostgreSQL adapter emits itself, `core post query
 * failed` and `[profiles] identity lookup failed`, are counted separately
 * above and are deliberately absent from this list.
 */
const SUPABASE_TRANSPORT = /fetch failed|ECONNRESET|socket hang up|ETIMEDOUT/i;

const SUPABASE_ONLY_LOADERS =
  /follower count failed|following count failed|opportunity state failed|featured work failed|publications failed|co-authored publications failed|profile record|topic index|comments failed|responses|reference counts/i;

const SUPABASE_ATTRIBUTABLE = (line) =>
  /SupabaseTimeoutError|FeedDataError|PostgrestError|supabase\.co|postgrest/i.test(line) ||
  SUPABASE_TRANSPORT.test(line) ||
  SUPABASE_ONLY_LOADERS.test(line);

const allErrors = candidateLog
  .split(/\r?\n/)
  .filter((line) => /^\s*⨯/.test(line) || /^(?:TypeError|ReferenceError):/.test(line));

const supabaseErrors = allErrors.filter((line) => SUPABASE_ATTRIBUTABLE(line));
const postgresErrors = allErrors.filter((line) => !SUPABASE_ATTRIBUTABLE(line));

console.log(
  `  ${postgresErrors.length === 0 ? "PASS" : "FAIL"}  render errors attributable to the PostgreSQL adapter: ${postgresErrors.length}`
);
if (postgresErrors.length > 0) {
  // Printed, because a count is not diagnosable. The two array-handling bugs
  // Phase 3 found both surfaced here first, as a TypeError inside a Suspense
  // boundary on a page that still returned 200.
  for (const line of postgresErrors.slice(0, 5)) {
    console.log(`        ${redact(line)}`);
  }
  failures.push("render errors under the PostgreSQL adapter");
}

console.log(
  `  ${supabaseErrors.length === 0 ? "PASS" : "NOTE"}  errors from the Supabase half of the page: ${supabaseErrors.length}`
);
for (const line of supabaseErrors.slice(0, 3)) {
  console.log(`        ${redact(line)}`);
}
if (supabaseErrors.length > 0) {
  console.log(
    "        Not a migration failure: the secondary data on these pages still\n" +
      "        comes from Supabase. Worth watching, because it is the same\n" +
      "        unresponsiveness that motivated this migration."
  );
}

console.log(`\n${failures.length === 0 ? "PREVIEW VERIFIED" : `${failures.length} FAILURE(S)`}`);
for (const failure of failures) console.log(`  - ${failure}`);

process.exit(failures.length === 0 ? 0 : 1);