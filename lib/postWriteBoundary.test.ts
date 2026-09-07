import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The boundary: an authenticated write to `posts` goes through
 * lib/postMutations.ts, or it does not happen.
 *
 * This is the same kind of guard as lib/browserWriteBoundary.test.ts and it
 * exists for the same reason. `guard_locked_post_write()` used to be the thing
 * that caught a mutation nobody had thought about, and on a direct PostgreSQL
 * connection it catches nothing: its bypass condition (`current_user IS
 * DISTINCT FROM 'authenticated'`) is always true off Supabase, so it returns
 * before evaluating a single check. It does not even fail closed, the way an
 * RLS policy does.
 *
 * So the domain is now the only thing standing there, and a new
 * `.from("posts").update(...)` in a server action would step around it
 * silently. This makes that a failing test instead of a review comment.
 *
 * Reads are untouched. The rule is about mutations.
 */

const ROOTS = ["app", "lib", "components"];

/**
 * Files permitted to mutate `posts` directly.
 *
 * Each entry needs a reason, and "it was already there" is not one. The list
 * should shrink, never grow: a new file here means a new place the rules can
 * be forgotten.
 */
const ALLOWED: Record<string, string> = {
  "lib/postMutations.ts":
    "The domain itself. Every statement below the policy lives here.",
  "lib/postDeletion.ts":
    "The batch delete. Its decision is checkDelete(); what it adds is the " +
    "partition of many ids into deletable, refused and missing, which the " +
    "policy has no opinion about because it decides one post at a time.",
};

/**
 * Sites not yet migrated, with what each one is.
 *
 * Separate from ALLOWED on purpose: these are not approved, they are
 * outstanding. The test pins the exact set so the number cannot drift upward
 * without somebody noticing, and each line is a unit of remaining work.
 */
const OUTSTANDING: Record<string, string> = {
  "app/(write)/write/actions.ts":
    "Three inserts (new drafts) and the slug rename. createPost() exists for " +
    "the inserts; the rename is a draft-only slug write.",
  "app/(main)/submit/research/actions.ts":
    "Two inserts and the draft-save update on the research form.",
  "app/(main)/admin/review/actions.ts":
    "The unfeature sweep, which clears `featured` across every row rather " +
    "than addressing one post, so it has no single row to authorize against.",
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") out.push(...sourceFiles(full));
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.test\.(ts|tsx)$/.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

/** `.from("posts")` followed by a write, across line breaks and chained
 *  filters, which is how the real call sites are formatted. */
const POSTS_MUTATION =
  /\.from\("posts"\)[\s\S]{0,160}?\.(update|insert|upsert|delete)\(/g;

/**
 * Comments are not call sites.
 *
 * Several modules describe the pattern they replaced, in prose, using the
 * exact syntax this test looks for. Counting those would make the boundary
 * report a violation for documenting a fix, which teaches the next reader to
 * delete the explanation rather than keep it.
 *
 * Line comments and block comments are blanked rather than removed, so the
 * line numbers in a real finding still point at the right place.
 */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, prefix) =>
      prefix + " ".repeat(match.length - prefix.length)
    );
}

function findMutationSites(): Array<{ file: string; line: number; op: string }> {
  const found: Array<{ file: string; line: number; op: string }> = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const text = withoutComments(readFileSync(file, "utf8"));
      const rel = relative(process.cwd(), file).split(sep).join("/");
      POSTS_MUTATION.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = POSTS_MUTATION.exec(text))) {
        found.push({
          file: rel,
          line: text.slice(0, match.index).split("\n").length,
          op: match[1],
        });
      }
    }
  }
  return found;
}

describe("the post write boundary", () => {
  const sites = findMutationSites();

  it("has no direct post mutation outside the domain or the outstanding list", () => {
    const unexpected = sites.filter(
      (site) => !(site.file in ALLOWED) && !(site.file in OUTSTANDING)
    );

    expect(
      unexpected.map((site) => `${site.file}:${site.line} (${site.op})`),
      "A new direct write to `posts`. Route it through lib/postMutations.ts, " +
        "or add it to OUTSTANDING with what it is and why it has not moved."
    ).toEqual([]);
  });

  it("keeps the outstanding list from growing", () => {
    // Every file that still writes directly is named above. A file dropping
    // off this list is progress and the list should be trimmed; a file
    // appearing on it is the thing this test exists to prevent.
    const stillDirect = new Set(
      sites.map((site) => site.file).filter((file) => !(file in ALLOWED))
    );

    expect([...stillDirect].sort()).toEqual(Object.keys(OUTSTANDING).sort());
  });

  it("names a reason for every exemption", () => {
    for (const [file, reason] of Object.entries({ ...ALLOWED, ...OUTSTANDING })) {
      expect(reason.length, `${file} needs a real reason`).toBeGreaterThan(30);
    }
  });

  it("routes every lifecycle RPC through the domain's authorization", () => {
    // withdraw_post_submission() keeps its statement in the database because
    // it also retires the assigned reviewers in one transaction. The decision
    // still has to happen here first, or the only thing guarding it is that
    // function's own auth.uid() filter, which returns NULL off Supabase.
    const withdrawCallers = sourceFiles("app").filter((file) =>
      readFileSync(file, "utf8").includes('rpc("withdraw_post_submission"')
    );

    expect(withdrawCallers.length).toBeGreaterThan(0);

    for (const file of withdrawCallers) {
      const text = readFileSync(file, "utf8");
      expect(
        text,
        `${file} calls withdraw_post_submission without authorizing first`
      ).toContain("authorizeTransition");
    }
  });
});

describe("the domain is the only thing that decides", () => {
  it("keeps the rules in one module", () => {
    // A second copy of "only drafts can be deleted" or "research cannot be
    // self-published" is a second copy that can drift. The policy module is
    // where those sentences live.
    const policyPhrases = [
      "Research and policy briefs can only be published",
      "Only drafts can be deleted directly",
      "citation_id can only be assigned",
    ];

    for (const phrase of policyPhrases) {
      const holders = ROOTS.flatMap(sourceFiles)
        .filter((file) => readFileSync(file, "utf8").includes(phrase))
        .map((file) => relative(process.cwd(), file).split(sep).join("/"));

      expect(holders, `"${phrase}" should be stated once`).toEqual([
        "lib/postPolicy.ts",
      ]);
    }
  });

  it("exposes no general post update", () => {
    const domain = readFileSync("lib/postMutations.ts", "utf8");
    // A general patch API is how a content edit and a publication become the
    // same statement, which is the shape the classification freeze exists to
    // catch.
    expect(domain).not.toMatch(/export async function updatePost\(/);
    for (const named of [
      "updatePostContent",
      "updateDraftComposition",
      "publishOwnDraft",
      "submitPostForReview",
      "resubmitRevision",
      "withdrawSubmission",
      "editorialDecision",
      "removePost",
      "restorePost",
      "deleteDraftPost",
      "createPost",
    ]) {
      expect(domain, `${named} should exist`).toContain(
        `export async function ${named}(`
      );
    }
  });
});
