import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { VISIBLE_POST_STATUSES } from "@/lib/db/types";

/**
 * The security condition attached to moving `getPostBySlug` behind lib/db.
 *
 * Today the lookup runs through PostgREST, so a stranger asking for someone's
 * draft is refused twice: once by the `posts` RLS policy, which returns no row
 * at all, and once by the route, which checks the status it got back. The
 * Postgres adapter connects as an application role and has only the second of
 * those. The route's own gate therefore stops being belt-and-braces and
 * becomes the entire authorization for unpublished work.
 *
 * So it gets pinned here rather than assumed. The list of statuses is read
 * from `VISIBLE_POST_STATUSES` instead of retyped, which means adding a status
 * to the lookup without also gating it in the route fails this test rather
 * than shipping a way to read strangers' unpublished posts.
 *
 * Reading the route as text is the practical option: `PostPage` is a
 * 2,000-line server component tree with a dozen Suspense boundaries, and a
 * render harness for it would prove less than reading what the file executes.
 * The same technique, and the same reasoning, as postQueryPath.test.ts.
 */

const route = readFileSync(
  join(process.cwd(), "app", "(main)", "post", "[slug]", "page.tsx"),
  "utf8"
);

/** Source with comment lines stripped, so an assertion is about what the file
 *  runs rather than what it explains. */
const executable = route
  .split(/\r?\n/)
  .filter((line) => {
    const trimmed = line.trim();
    return (
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("*") &&
      !trimmed.startsWith("/*") &&
      !trimmed.startsWith("{/*")
    );
  })
  .join("\n");

function declaration(header: string) {
  const start = executable.indexOf(header);
  expect(start, `${header} not found`).toBeGreaterThan(-1);
  const rest = executable.slice(start + header.length);
  const next = rest.search(/\nexport (default )?async function |\nexport function /);
  return rest.slice(0, next === -1 ? rest.length : next);
}

const metadata = declaration("export async function generateMetadata");
const component = declaration("export default async function PostPage");

const UNPUBLISHED = VISIBLE_POST_STATUSES.filter((s) => s !== "published");

describe("the post route's own authorization", () => {
  it("resolves unpublished statuses, which is why the gate has to exist", () => {
    // If this ever shrinks to published-only, the rest of this file is moot
    // and should be deleted rather than left as decoration.
    expect(UNPUBLISHED.length).toBeGreaterThan(0);
    expect(UNPUBLISHED).toEqual(["pending", "pending_revision", "draft"]);
  });

  it("names every unpublished status it is willing to resolve", () => {
    for (const status of UNPUBLISHED) {
      expect(component, `PostPage does not mention ${status}`).toContain(
        `post.status === "${status}"`
      );
      expect(metadata, `generateMetadata does not mention ${status}`).toContain(
        `post.status === "${status}"`
      );
    }
  });

  it("compares the viewer against the post's own author, not a role", () => {
    // Ownership is the check. A published-only assumption, or a role lookup,
    // would both let the wrong reader through once RLS is not underneath.
    expect(component).toContain("user?.id !== post.author_id");
    expect(metadata).toContain("user?.id !== post.author_id");
  });

  it("refuses rather than renders when the viewer fails the gate", () => {
    expect(component).toMatch(
      /post\.status === "draft" && user\?\.id !== post\.author_id\s*\)?\s*notFound\(\)/
    );
    // Reviewers and invited co-authors are the only other readers of an
    // in-review post, and the route earns that by querying for the assignment
    // before it renders.
    expect(component).toContain("!reviewAssignment && !coAuthorInvite) notFound()");
    expect(component).toMatch(/\.from\("post_reviews"\)/);
    expect(component).toMatch(/\.from\("post_authors"\)/);
  });

  it("keeps an unpublished title out of the page metadata", () => {
    // Metadata is emitted before the body and is read by crawlers, so its gate
    // is author-only and does not have the reviewer exception.
    expect(metadata).toContain('return { title: "Post not found - Indegenius" };');
  });

  it("never resolves a rejected post by slug at all", () => {
    expect(VISIBLE_POST_STATUSES).not.toContain("rejected");
  });
});
