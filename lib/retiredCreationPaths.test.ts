import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The creation paths the publishing reset removed stay removed.
 *
 * Phase 2B took out co-authoring, Responses as publications, campus prompt
 * publishing and draft share links. Their data is still in the database and
 * reading it is allowed: existing co-authored and response publications keep
 * rendering. What must not come back is a way to create more, because each of
 * these used to be one small call away from a component that still exists.
 */

const ROOTS = ["app", "components", "lib"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Comments describe removed behaviour on purpose; only code counts. Blanked
 *  rather than removed, the same way lib/postWriteBoundary.test.ts does it. */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, prefix) => prefix + " ".repeat(match.length - prefix.length));
}

const sources = ROOTS.flatMap(sourceFiles).map((file) => ({
  file: relative(process.cwd(), file).split(sep).join("/"),
  code: withoutComments(readFileSync(file, "utf8")),
}));

function filesMatching(pattern: RegExp) {
  return sources.filter(({ code }) => pattern.test(code)).map(({ file }) => file);
}

const WRITE_ACTIONS = "app/(write)/write/actions.ts";
const POST_AUTHORS_WRITE =
  /\.from\("post_authors"\)((?:(?!\.from\()[\s\S]){0,200}?)\.(insert|update|upsert|delete)\(/g;

describe("retired creation paths", () => {
  it("never links into the composer as a Response", () => {
    expect(filesMatching(/[?&](inResponseTo|response_to)=/)).toEqual([]);
  });

  it("never links into the composer with a campus prompt", () => {
    expect(filesMatching(/\/write\?prompt=/)).toEqual([]);
  });

  it("records no campus prompt submission and reads or mints no draft share link", () => {
    expect(filesMatching(/\.from\("campus_prompt_submissions"\)/)).toEqual([]);
    expect(filesMatching(/\.from\("post_draft_shares"\)/)).toEqual([]);
  });

  it("writes no response or co-author notification", () => {
    expect(
      filesMatching(/type:\s*"(response_post|co_author_invite|co_author_accepted|co_author_declined)"/)
    ).toEqual([]);
  });

  it("writes post_authors only to credit a writer on their own draft", () => {
    const writers = sources
      .filter(({ code }) => new RegExp(POST_AUTHORS_WRITE.source).test(code))
      .map(({ file }) => file);
    expect(writers).toEqual([WRITE_ACTIONS]);

    const actions = sources.find(({ file }) => file === WRITE_ACTIONS)!.code;
    const operations = [...actions.matchAll(POST_AUTHORS_WRITE)].map((match) => match[2]);
    // One insert-only upsert of the writer's own row. Nothing that invites,
    // removes or reorders a co-author.
    expect(operations).toEqual(["upsert"]);
    expect(actions).toContain("ignoreDuplicates: true");
  });

  it("never gives a publication a parent", () => {
    const actions = sources.find(({ file }) => file === WRITE_ACTIONS)!.code;
    expect(actions).not.toMatch(/in_response_to\s*:/);
  });
});
