import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The published post page, rendered for a logged-out reader, must not depend
 * on Supabase PostgREST.
 *
 * This is a structural proof rather than a behavioural one, and deliberately
 * so: the property is "no module on this path issues a PostgREST call", which
 * is a fact about the code and can be checked without a database. A runtime
 * check would only prove it for whichever posts happened to be sampled.
 *
 * It is not a claim that the page survives a database outage. Everything here
 * still reads the same production database; what has moved is the gateway in
 * front of it, and gateway failures are the ones that have been happening.
 */

function read(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}

/** Comments describe the pattern that was replaced, in prose, using the exact
 *  syntax this scan looks for. Counting those would report a violation for
 *  documenting a fix. */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, prefix) =>
      prefix + " ".repeat(match.length - prefix.length)
    );
}

/** The span of one function, from its declaration to the next top-level one. */
function functionBody(source: string, declaration: string): string {
  const start = source.indexOf(declaration);
  if (start < 0) throw new Error(`not found: ${declaration}`);
  const rest = source.slice(start + declaration.length);
  const next = rest.search(/\n(?:export )?(?:async )?function /);
  return next < 0 ? rest : rest.slice(0, next);
}

const pageSource = withoutComments(read("app/(main)/post/[slug]/page.tsx"));
const feedSource = withoutComments(read("lib/feedData.ts"));

describe("the public published post page", () => {
  it("issues no PostgREST call from the page itself except the auth-only checks", () => {
    const calls = [...pageSource.matchAll(/\.from\("([a-z_]+)"\)/g)].map(
      (match) => match[1]
    );

    // The two that remain guard access to an *unpublished* post: is the viewer
    // an assigned reviewer, or an invited co-author. A logged-out reader on a
    // published post never reaches them.
    expect(calls.sort()).toEqual(["post_authors", "post_reviews"]);

    const guard = pageSource.slice(
      pageSource.indexOf('post.status === "pending"')
    );
    expect(guard).toContain('.from("post_reviews")');
    expect(guard).toContain('.from("post_authors")');
  });

  it("loads the post and its page data through the repositories", () => {
    expect(pageSource).toContain("postPageRepository(supabase)");
    expect(pageSource).toContain("getPostBySlug");
    // The counts, collections, related, neighbours and viewer state all come
    // from the repository now, so none of their tables is named here.
    for (const table of [
      "likes",
      "bookmarks",
      "comments",
      "post_references",
      "post_versions",
      "post_editor_decisions",
      "follows",
      "author_subscriptions",
    ]) {
      expect(pageSource, `${table} should not be queried from the page`).not.toContain(
        `.from("${table}")`
      );
    }
  });

  it("loads responses without PostgREST", () => {
    // fetchResponsePage -> fetchResponseCards -> repository. These two are the
    // whole of the post page's dependency on the feed module.
    for (const name of [
      "export async function fetchResponsePage(",
      "export async function fetchResponseCards(",
    ]) {
      const body = functionBody(feedSource, name);
      expect(body, `${name} should issue no PostgREST call`).not.toMatch(
        /\.from\("/
      );
    }
  });

  it("hydrates cards without PostgREST", () => {
    // enrichPosts is the shared hydration every card list goes through, and it
    // was nine round trips plus three follow-ups.
    const body = functionBody(feedSource, "async function enrichPosts(");
    expect(body).not.toMatch(/\.from\("/);
    expect(body).toContain("feedRepository(");
  });

  it("keeps the migration inert until a domain is named", () => {
    // Nothing above changes behaviour until READ_MIGRATED_DOMAINS says so, and
    // it is unset everywhere including production.
    const adapter = read("lib/db/readAdapter.ts");
    expect(adapter).toContain("READ_MIGRATED_DOMAINS");
    expect(adapter).toContain('if (value === "") return new Set();');
    // An unrecognised name throws rather than silently leaving a domain on
    // PostgREST, which would look exactly like the migration working.
    expect(adapter).toContain("contains an unknown domain");
  });
});
