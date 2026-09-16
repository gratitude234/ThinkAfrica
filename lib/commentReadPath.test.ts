import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The comment thread must not depend on Supabase PostgREST, and must carry the
 * two policies PostgREST was applying from the session.
 *
 * Structural rather than behavioural: the property is a fact about the code.
 * The behavioural proof, including moderated comments built as fixtures, is
 * `lib/db/comments.neon.test.ts`.
 */

function read(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}

function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, prefix) =>
      prefix + " ".repeat(match.length - prefix.length)
    );
}

const threadSource = withoutComments(read("lib/commentThread.ts"));
const repositorySource = withoutComments(read("lib/db/comments.ts"));
const ruleSource = withoutComments(read("lib/db/commentVisibility.ts"));
const feedSource = withoutComments(read("lib/db/feed.ts"));

describe("the comment thread loader", () => {
  it("issues no PostgREST table call", () => {
    expect([...threadSource.matchAll(/\.from\("([a-z_]+)"\)/g)]).toEqual([]);
  });

  it("routes every read through the adapter", () => {
    expect(threadSource).toMatch(/commentsRepository\(/);
  });

  it("keeps blocking in TypeScript, where the viewer's block list lives", () => {
    // Deliberate: the block list belongs to viewer state, and moving it into
    // SQL would also change the page-size arithmetic, which counts rows before
    // blocking.
    expect(threadSource).toMatch(/getBlockedUserIds\(viewerId\)/);
  });
});

describe("the moderation rule", () => {
  it("is written out rather than left to a policy that will not be there", () => {
    expect(ruleSource).toMatch(/hidden_at is null/);
    expect(ruleSource).toMatch(/role = 'admin'/);
  });

  it("does not depend on anything Supabase supplies at request time", () => {
    // auth.uid() returns null off Supabase, so a rule written in terms of it
    // does not fail after the migration: it silently hides nothing, or
    // everything.
    for (const source of [ruleSource, repositorySource]) {
      expect(source).not.toMatch(/auth\.uid\(\)/);
      expect(source).not.toMatch(/auth\.role\(\)/);
      expect(source).not.toMatch(/is_admin\(\)/);
    }
  });

  it("derives admin from the database, not from a caller-supplied flag", () => {
    // A flag is something a call site can get wrong, and the place it would
    // show is a moderated comment on a public page.
    expect(repositorySource).not.toMatch(/isAdmin/);
    expect(ruleSource).toMatch(/exists \(/);
  });

  it("has one definition, used by both the thread and the feed's count", () => {
    expect(repositorySource).toMatch(/commentVisibleSql\(/);
    expect(feedSource).toMatch(/commentVisibleSql\(/);

    // The feed used to inline its own copy. Two copies of a moderation rule
    // is one copy too many: they drift, and the drift is invisible.
    expect(feedSource).not.toMatch(/is_admin\(\), inlined/);
  });
});

describe("the author projection", () => {
  it("hides an invisible commenter's name without removing the comment", () => {
    expect(repositorySource).toMatch(/visibleProfileJoin\(/);

    // On the join, not in the where clause. In the where clause a suspended
    // commenter would delete their comments from the thread, changing its
    // shape and its count.
    const joinAt = repositorySource.indexOf("visibleProfileJoin(");
    const whereAt = repositorySource.indexOf("where c.post_id");
    expect(joinAt).toBeLessThan(whereAt);
  });
});

describe("the migration switch", () => {
  it("leaves the comments domain unmigrated by default", () => {
    expect(process.env.READ_MIGRATED_DOMAINS ?? "").not.toContain("comments");
  });
});
