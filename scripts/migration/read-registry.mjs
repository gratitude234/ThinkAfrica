/**
 * Every remaining direct PostgREST read in the product, classified.
 *
 *   node scripts/migration/read-registry.mjs
 *
 * The point is that there is no allowlist. Each file is placed in a category
 * by a rule, and anything a rule does not cover is reported as UNCLASSIFIED
 * rather than being quietly excluded. A registry that cannot say why a read is
 * still there is not a registry.
 *
 * Writes are counted separately and are not blockers: every write goes to
 * Supabase unconditionally this phase, which is the boundary rather than an
 * unfinished migration.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();

const CATEGORIES = {
  BROWSER_READ: [],
  MIGRATED_AND_PARITY_READY: [],
  MIGRATED_PARITY_PENDING: [],
  RPC_BLOCKED: [],
  DEFERRED_ADMIN: [],
  NON_CRITICAL: [],
  DEAD: [],
  AUTH_STORAGE: [],
  WRITE_PATH: [],
  UNCLASSIFIED: [],
};

/**
 * Files whose reads are gated on docs/read-migration-rpc-blockers.md: they
 * call an RPC that derives the actor from auth.uid() and has no parameterised
 * form applied in production.
 */
const RPC_BLOCKED = new Set([
  "lib/activation.ts",
  "lib/discoverData.ts",
  "lib/profileCommandCenterData.ts",
  "lib/retention.ts",
  "app/(main)/page.tsx",
  "app/(main)/settings/page.tsx",
  "app/(main)/subscriptions/page.tsx",
]);

/** Normal product, reachable, not yet migrated, not blocked by anything. */
const NON_CRITICAL = new Set([
  "lib/collaboration.ts",
  "lib/postEngagementServer.ts",
  "lib/suggestedPeople.ts",
  "lib/publicationDistribution.ts",
  "lib/push.ts",
  "app/(main)/leaderboard/page.tsx",
  "app/(main)/campus/page.tsx",
  "app/(main)/opportunities/page.tsx",
  "app/(main)/fellowships/page.tsx",
  "app/(main)/fellowships/[id]/page.tsx",
  "app/(main)/edit/[slug]/page.tsx",
  "app/(write)/write/page.tsx",
  "app/(main)/messages/[id]/page.tsx",
  "app/(main)/publication/[citationId]/page.tsx",
  "app/(main)/topics/[tag]/page.tsx",
  "app/(main)/discover/page.tsx",
  "app/(main)/responses/page.tsx",
  "app/(main)/onboarding/page.tsx",
  "app/sitemap.ts",
  "lib/profileRecord.ts",
  "lib/reviewWorkflow.ts",
  "lib/notificationRead.ts",
  "lib/activationServer.ts",
  "lib/opportunityMatch.ts",
  "lib/postQuality.ts",
  // Normal product pages and helpers, reachable, none on a migrated journey.
  "lib/responsePost.ts",
  "lib/citationResolution.ts",
  "lib/citationId.ts",
  "lib/postCounts.ts",
  "lib/readerSignals.ts",
  "lib/messaging.ts",
  "lib/pushClient.ts",
  "app/(main)/topics/page.tsx",
  "app/(main)/policy/page.tsx",
  "app/(main)/partners/page.tsx",
  "app/(main)/alumni/page.tsx",
  "app/(main)/talent/page.tsx",
  "app/(main)/me/page.tsx",
  "app/(main)/layout.tsx",
  "app/(main)/[username]/followers/page.tsx",
  "app/(main)/[username]/following/page.tsx",
  "app/(main)/[username]/record/page.tsx",
  "app/(main)/post/[slug]/page.tsx",
  "app/(main)/post/[slug]/PostConversationView.tsx",
  "app/(marketing)/landing/landingData.ts",
  // Ambassadors is behind FEATURE_FLAGS.ambassadors, which is false, but the
  // route is still reachable: lib/featureFlags.ts says a route stays reachable
  // unless it reads its own flag. Not dead, so not filed as dead.
  "app/(main)/ambassadors/page.tsx",
  "app/(main)/ambassadors/apply/page.tsx",
  "app/(main)/ambassadors/dashboard/page.tsx",
  "app/(main)/messages/page.tsx",
  "app/(main)/messages/layout.tsx",
  "lib/dailyBrief.ts",
  // Behind NEXT_PUBLIC_CREDIBILITY_GRAPH_ENABLED, which is unset, but the
  // module is still imported and reachable, so it is not filed as dead.
  "lib/credibilityGraphData.ts",
  // Unlisted share links. Public but token-gated, and not on a migrated
  // journey.
  "app/draft/[token]/page.tsx",
  "app/r/p/[token]/route.ts",
]);

/** Server-side, but not a product read: moderation, deletion, mail, access. */
const OPERATIONAL = new Set([
  "app/(main)/stats/page.tsx",
  "lib/adminAccess.ts",
  "lib/postDeletion.ts",
  "lib/suspension.ts",
  "lib/email.ts",
]);

/** Feature-flagged off, so unreachable in the product as shipped. */
function isDead(file) {
  return (
    file.includes("/research/") ||
    file.includes("/submit/research") ||
    file.includes("researchDocument") ||
    file.includes("/debate")
  );
}

function isAdmin(file) {
  return (
    file.includes("/admin/") ||
    file.includes("broadcast") ||
    file.includes("/api/cron/") ||
    file.includes("/api/webhooks/") ||
    file.includes("moderation") ||
    file.includes("/review/") ||
    file.includes("reviewQueue")
  );
}

function isAuthOrStorage(file) {
  return (
    file.includes("/auth/") ||
    file.includes("supabase/admin") ||
    file.includes("supabase/server") ||
    file.includes("supabase/client") ||
    file.includes("storage") ||
    file.includes("upload")
  );
}

/** A server action or route handler whose reads exist to authorize a write. */
function isWritePath(file) {
  return (
    /actions\.ts$/.test(file) ||
    file.includes("Actions.ts") ||
    file.includes("Mutations.ts") ||
    file.includes("/api/") ||
    file.includes("proxy.ts")
  );
}

/** Domains already behind lib/db, with a live parity harness written. */
const MIGRATED = new Map([
  ["lib/postBySlug.ts", "post-page"],
  ["lib/feedData.ts", "feed"],
  ["lib/profileViewData.ts", "profile-page"],
  ["lib/profileRecordData.ts", "profile-page"],
  ["lib/searchData.ts", "search"],
  ["lib/commentThread.ts", "comments"],
  ["lib/blocking.ts", "viewer-state"],
  ["lib/messagingEligibility.ts", "viewer-state"],
  ["lib/notificationData.ts", "notifications"],
  ["app/(main)/dashboard/page.tsx", "dashboard"],
  ["app/(main)/bookmarks/page.tsx", "bookmarks"],
]);

function walk(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) files.push(full);
  }
  return files;
}

function withoutComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const files = [
  ...walk(join(ROOT, "lib")),
  ...walk(join(ROOT, "app")),
  ...walk(join(ROOT, "components")),
];

for (const absolute of files) {
  const file = relative(ROOT, absolute).split(sep).join("/");
  if (file.startsWith("lib/db/")) continue; // the boundary itself

  const original = readFileSync(absolute, "utf8");
  const source = withoutComments(original);

  // supabase.storage.from("bucket") is the storage API, not the database.
  // Counting it made the avatar uploader look like a browser read for as long
  // as this script has existed, which is exactly the sort of false positive
  // that gets a registry ignored. lib/browserDatabaseBoundary.test.ts draws
  // the same distinction, and the two must agree.
  const countCalls = (pattern) => {
    let total = 0;
    for (const match of source.matchAll(pattern)) {
      const before = source.slice(Math.max(0, match.index - 60), match.index);
      if (/storage[\s\S]{0,10}$/.test(before)) continue;
      total += 1;
    }
    return total;
  };

  const reads = countCalls(/\.from\("[a-z_]+"\)/g);
  const rpcs = countCalls(/\.rpc\("[a-z_0-9]+"/g);
  if (reads + rpcs === 0) continue;

  // By rule, not by list: any client component that reads the database is
  // cutover-blocking, and a new one must be caught the day it is written.
  const isClient = /^\s*["']use client["']/.test(original);
  const entry = { file, reads, rpcs };

  if (isClient) {
    CATEGORIES.BROWSER_READ.push(entry);
  } else if (MIGRATED.has(file)) {
    // Named as migrated but still holding a call: that is a regression, and it
    // must be loud rather than absorbed into a category.
    CATEGORIES.UNCLASSIFIED.push({
      ...entry,
      why: `listed as migrated (${MIGRATED.get(file)}) but still reads directly`,
    });
  } else if (isDead(file)) CATEGORIES.DEAD.push(entry);
  else if (isAdmin(file)) CATEGORIES.DEFERRED_ADMIN.push(entry);
  else if (isAuthOrStorage(file)) CATEGORIES.AUTH_STORAGE.push(entry);
  else if (RPC_BLOCKED.has(file)) CATEGORIES.RPC_BLOCKED.push(entry);
  else if (isWritePath(file)) CATEGORIES.WRITE_PATH.push(entry);
  else if (NON_CRITICAL.has(file)) CATEGORIES.NON_CRITICAL.push(entry);
  else if (OPERATIONAL.has(file)) CATEGORIES.DEFERRED_ADMIN.push(entry);
  else CATEGORIES.UNCLASSIFIED.push({ ...entry, why: "no rule covers this file" });
}

// Migrated files are listed from the map, having been proven to hold no calls.
for (const [file, domain] of MIGRATED) {
  if (CATEGORIES.UNCLASSIFIED.some((row) => row.file === file)) continue;
  CATEGORIES.MIGRATED_PARITY_PENDING.push({ file, reads: 0, rpcs: 0, domain });
}

const LABELS = {
  BROWSER_READ:
    "CUTOVER-BLOCKING: a client component reading the database directly. " +
    "RLS makes this safe today and has no successor, because after the " +
    "migration there is no key a browser can hold",
  MIGRATED_AND_PARITY_READY: "behind lib/db, live parity PASSED",
  MIGRATED_PARITY_PENDING: "behind lib/db, live parity not yet run",
  RPC_BLOCKED: "gated on docs/read-migration-rpc-blockers.md",
  DEFERRED_ADMIN: "admin and editorial, deferred past cutover",
  NON_CRITICAL: "normal product, reachable, not cutover-blocking",
  DEAD: "feature-flagged off, unreachable as shipped",
  AUTH_STORAGE: "auth or storage, out of scope for read migration",
  WRITE_PATH: "reads inside a write path; writes stay on Supabase",
  UNCLASSIFIED: "NO REASON RECORDED. Classify or migrate.",
};

console.log("\n================ MIGRATED READ REGISTRY ================\n");

let total = 0;
for (const [name, rows] of Object.entries(CATEGORIES)) {
  const calls = rows.reduce((sum, row) => sum + row.reads + row.rpcs, 0);
  total += calls;
  console.log(`${name}  (${rows.length} files, ${calls} calls)`);
  console.log(`  ${LABELS[name]}`);
  for (const row of rows.sort((a, b) => b.reads + b.rpcs - (a.reads + a.rpcs))) {
    const detail = row.why ? `  <- ${row.why}` : row.domain ? `  [${row.domain}]` : "";
    console.log(`    ${String(row.reads + row.rpcs).padStart(3)}  ${row.file}${detail}`);
  }
  console.log("");
}

console.log(`Total direct calls outside lib/db: ${total}\n`);

if (CATEGORIES.UNCLASSIFIED.length > 0) {
  console.error(
    `${CATEGORIES.UNCLASSIFIED.length} file(s) have no recorded reason. ` +
      `Every remaining read must have one.\n`
  );
  process.exit(1);
}
