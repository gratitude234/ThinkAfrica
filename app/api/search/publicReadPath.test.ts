import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Search, on the server, must not depend on Supabase PostgREST, and must not
 * take the searching viewer's identity from the request.
 *
 * Structural rather than behavioural: the property is a fact about the code,
 * so it holds for every query rather than for whichever ones a runtime check
 * sampled. The behavioural proof is `lib/db/search.neon.test.ts`.
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

const dataSource = withoutComments(read("lib/searchData.ts"));
const routeSource = withoutComments(read("app/api/search/route.ts"));
const topicsSource = withoutComments(read("app/api/topics/route.ts"));

describe("the search loaders", () => {
  it("issue no PostgREST table call", () => {
    expect([...dataSource.matchAll(/\.from\("([a-z_]+)"\)/g)]).toEqual([]);
  });

  it("issue no PostgREST RPC", () => {
    expect([...dataSource.matchAll(/\.rpc\("([a-z_0-9]+)"/g)]).toEqual([]);
  });

  it("build no PostgREST filter grammar outside the Supabase backend", () => {
    // orIlikeFilter is the PostgREST encoding and belongs to that transport
    // only. Its presence here would mean the direct path was reproducing a
    // grammar instead of the intent behind it.
    expect(dataSource).not.toMatch(/orIlikeFilter\(\[/);
  });

  it("route every query through the adapter", () => {
    expect(dataSource).toMatch(/searchRepository\(supabase\)/);
  });
});

describe("the searching viewer", () => {
  it("is resolved from the session, not from the request parameters", () => {
    expect(routeSource).toMatch(/getCurrentUser\(\)/);

    // The identity must not be readable from anything the caller controls.
    // A viewer id taken from a query string is a viewer id a caller can forge,
    // and the profiles visibility rule is what would be forged past.
    expect(routeSource).not.toMatch(/params\.get\("(viewer|user|user_id|as)"/);
  });

  it("is threaded into every search entry point", () => {
    for (const entry of [
      "searchOverlayPosts",
      "searchPosts",
      "searchPeople",
    ]) {
      const at = dataSource.indexOf(`export async function ${entry}(`);
      expect(at).toBeGreaterThan(-1);
      const signature = dataSource.slice(at, dataSource.indexOf(")", at));
      expect(signature).toMatch(/SearchViewer|viewerId/);
    }
  });

  it("reaches the repository as an explicit argument, never as ambient state", () => {
    const repository = withoutComments(read("lib/db/search.ts"));

    // auth.uid() returns null off Supabase, so a rule written in terms of it
    // does not fail after the migration: it silently matches nothing and
    // reports success.
    expect(repository).not.toMatch(/auth\.uid\(\)/);
    expect(repository).not.toMatch(/auth\.role\(\)/);
    expect(repository).not.toMatch(/current_user/);
  });
});

describe("the topics route", () => {
  it("issues no PostgREST call of its own", () => {
    expect([...topicsSource.matchAll(/\.from\("([a-z_]+)"\)/g)]).toEqual([]);
  });
});

describe("the profiles visibility rule", () => {
  it("is defined once and used by the search repository", () => {
    const repository = withoutComments(read("lib/db/search.ts"));
    const shared = withoutComments(read("lib/db/profileVisibility.ts"));

    expect(repository).toMatch(/profileVisibleSql\(/);
    expect(repository).toMatch(/visibleProfileJoin\(/);

    // The two spellings of the rule differ in a way that matters: as a WHERE
    // clause it removes the row, as a JOIN condition it removes only the
    // author. Both live in one module so they cannot drift apart.
    expect(shared).toMatch(/export function profileVisibleSql/);
    expect(shared).toMatch(/export function visibleProfileJoin/);
    expect(shared).toMatch(/members_only/);
    expect(shared).toMatch(/suspended_at is null/);
  });

  it("leaves the search domain unmigrated by default", () => {
    expect(process.env.READ_MIGRATED_DOMAINS ?? "").not.toContain("search");
  });
});
