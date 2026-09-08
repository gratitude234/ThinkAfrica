import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The post route's query path, pinned.
 *
 * lib/postBySlug.test.ts proves the loader memoises. This file proves the route
 * actually goes through it: that neither `generateMetadata()` nor the page
 * component has grown its own `from("posts")` slug lookup or its own
 * `auth.getUser()` back, which is exactly how the duplicate got there the first
 * time. Rendering the real page in a test is not a practical alternative; it is
 * a 2,000-line server component tree with a dozen Suspense boundaries, and a
 * harness for it would prove less than reading what the file executes.
 */

const ROUTE = join(process.cwd(), "app", "(main)", "post", "[slug]");

/** Source with comment lines stripped, so an assertion is about what the file
 *  runs rather than what it explains. */
function executable(source: string) {
  return source
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
}

function readRoute(name: string) {
  return readFileSync(join(ROUTE, name), "utf8");
}

const page = readRoute("page.tsx");
const discussion = readRoute("DiscussionSection.tsx");
const commentsLoader = readRoute("CommentsLoader.tsx");
const conversation = readRoute("PostConversationView.tsx");
const loader = readFileSync(join(process.cwd(), "lib", "postBySlug.ts"), "utf8");
/** The query the loader used to hold moved behind lib/db so the post domain
 *  can be pointed at Neon without the route changing. It is still the query
 *  production runs, so it is still pinned; only its address changed. */
const supabasePosts = readFileSync(
  join(process.cwd(), "lib", "db", "supabase", "posts.ts"),
  "utf8"
);

const pageCode = executable(page);
const loaderCode = executable(loader);
const supabasePostsCode = executable(supabasePosts);
const commentsLoaderCode = executable(commentsLoader);

/** The body of one top-level declaration, up to the next one. */
function declaration(source: string, header: string) {
  const start = source.indexOf(header);
  expect(start, `${header} not found`).toBeGreaterThan(-1);
  const rest = source.slice(start + header.length);
  const next = rest.search(/\nexport (default )?async function |\nexport function /);
  return rest.slice(0, next === -1 ? rest.length : next);
}

describe("the core post lookup", () => {
  it("is issued from the shared loader, not from the route", () => {
    expect(pageCode).toContain('from "@/lib/postBySlug"');

    // The route still reads the posts table for other things: the response
    // count, related posts, previous and next, and the parent of a response.
    // None of them is a lookup by slug, which is the one this page duplicated.
    expect(pageCode).not.toMatch(/\.from\("posts"\)[\s\S]{0,600}?\.eq\("slug"/);
    expect(supabasePostsCode).toMatch(
      /\.from\("posts"\)[\s\S]{0,400}?\.eq\("slug", slug\)/
    );
  });

  it("reaches the provider through lib/db rather than naming one", () => {
    // The route asks the loader, the loader asks the boundary, and only the
    // boundary knows which database answered. That is the property that lets
    // one domain move to Neon while the rest stay on Supabase.
    expect(loaderCode).toContain('from "@/lib/db"');
    expect(loaderCode).toContain("getDatabase().posts.findBySlug(slug)");
    expect(loaderCode).not.toContain("supabase");
    expect(loaderCode).not.toContain('.from("posts")');
  });

  it("is the same call in generateMetadata and in the page component", () => {
    const metadata = declaration(pageCode, "export async function generateMetadata");
    const component = declaration(pageCode, "export default async function PostPage");

    expect(metadata).toContain("getPostBySlug(slug)");
    expect(component).toContain("getPostBySlug(slug)");
    expect(metadata).not.toContain('.from("posts")');
    expect(component).not.toContain('.eq("slug", slug)');
  });

  it("validates the viewer's session once, through the memoised accessor", () => {
    expect(pageCode).toContain('from "@/lib/serverAuth"');
    // Two direct auth round trips per request was the other half of the
    // duplicate, and the one that produced the Auth 504s.
    expect(pageCode).not.toContain("auth.getUser()");

    const metadata = declaration(pageCode, "export async function generateMetadata");
    const component = declaration(pageCode, "export default async function PostPage");
    expect(metadata).toContain("getCurrentUser()");
    expect(component).toContain("getCurrentUser()");
  });

  it("keeps viewer state out of the shared loader", () => {
    // Anything memoised for the whole render is shared by everything in it, so
    // per-viewer reads stay in getViewerData() where they belong.
    for (const table of ["likes", "bookmarks", "follows", "author_subscriptions"]) {
      expect(loaderCode).not.toContain(`.from("${table}")`);
      expect(supabasePostsCode).not.toContain(`.from("${table}")`);
    }
    expect(loaderCode).not.toContain("auth.getUser");
    expect(supabasePostsCode).not.toContain("auth.getUser");
    // Not a cross-request cache. unstable_cache and "use cache" would both
    // outlive the render and hand one reader's draft to the next.
    expect(loaderCode).toContain('import { cache } from "react"');
    expect(loaderCode).not.toContain("unstable_cache");
    expect(loaderCode).not.toContain('"use cache"');
  });
});

describe("the comment count", () => {
  it("is counted once for the page and handed down", () => {
    // getSecondaryData() already counts comments for the "Discussion · N"
    // heading. CommentsLoader used to count them again with the same post id.
    expect(commentsLoaderCode).not.toContain("countComments");
    expect(commentsLoaderCode).toContain("totalCount");
    expect(discussion).toContain("totalCount={commentCount}");

    // The count now arrives with the other three page counts rather than from
    // its own round trip, and the page must not go back for it a second time:
    // the point of the counts query is that four counts cost one statement.
    expect(pageCode).not.toContain("countComments(");
    expect((pageCode.match(/counts\.commentCount/g) ?? []).length).toBe(1);
  });
});

describe("secondary and viewer data", () => {
  it("is loaded once and awaited by every section that needs it", () => {
    // The section components take promises, not ids, so a dozen Suspense
    // boundaries share two loads rather than each starting its own.
    expect((pageCode.match(/const secondaryDataPromise = getSecondaryData\(/g) ?? []).length).toBe(1);
    expect((pageCode.match(/const viewerDataPromise = getViewerData\(\{/g) ?? []).length).toBe(1);
  });
});

describe("the Debate subsystem", () => {
  it("stays removed from the post route", () => {
    for (const source of [page, discussion, commentsLoader, conversation, loader]) {
      expect(source.toLowerCase()).not.toContain("debate");
    }
  });
});
