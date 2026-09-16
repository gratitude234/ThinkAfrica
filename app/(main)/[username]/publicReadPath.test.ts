import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The public profile page, rendered for a logged-out reader, must not depend
 * on Supabase PostgREST.
 *
 * This is a structural proof rather than a behavioural one, and deliberately
 * so: the property is "no module on this path issues a PostgREST call", which
 * is a fact about the code and can be checked without a database. A runtime
 * check would only prove it for whichever profiles happened to be sampled.
 *
 * It is not a claim that the page survives a database outage. Everything here
 * still reads the same production database; what has moved is the gateway in
 * front of it, and gateway failures are the ones that have been happening.
 *
 * The companion behavioural proof is `lib/db/profilePage.neon.test.ts`. The
 * Intellectual Record loader and its repository, which this used to cover as
 * well, were removed in the publishing reset, Phase 2G.
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

function tableCalls(source: string): string[] {
  return [...source.matchAll(/\.from\("([a-z_]+)"\)/g)].map((match) => match[1]);
}

function rpcCalls(source: string): string[] {
  return [...source.matchAll(/\.rpc\("([a-z_0-9]+)"/g)].map((match) => match[1]);
}

const viewSource = withoutComments(read("lib/profileViewData.ts"));
const pageSource = withoutComments(read("app/(main)/[username]/page.tsx"));

describe("the public profile page", () => {
  it("issues no PostgREST table call from lib/profileViewData.ts or the route", () => {
    expect(tableCalls(viewSource)).toEqual([]);
    expect(tableCalls(pageSource)).toEqual([]);
  });

  it("issues no PostgREST RPC from the loader or the route", () => {
    expect(rpcCalls(viewSource)).toEqual([]);
    expect(rpcCalls(pageSource)).toEqual([]);
  });

  it("routes every profile read through the adapter", () => {
    expect(viewSource).toMatch(/from "@\/lib\/db/);
  });

  it("keeps the identity lookup behind lib/db, not on the request client", () => {
    // loadProfileIdentity is what 404s a nonexistent profile. If it regressed
    // to a direct query the page would still work and the migration claim
    // would be false.
    expect(viewSource).toMatch(/getDatabase\(\)\.profiles\.findIdentityByUsername/);
  });

  it("has one migration switch for the profile page", () => {
    const adapter = withoutComments(read("lib/db/readAdapter.ts"));
    const gated = [
      ...adapter.matchAll(/isReadDomainMigrated\("([a-z-]+)"\)/g),
    ].map((match) => match[1]);

    expect(gated.filter((domain) => domain === "profile-page")).toHaveLength(1);
  });

  it("leaves the profile domain unmigrated by default", () => {
    // READ_MIGRATED_DOMAINS is unset in production. A default that turned this
    // on would move a live read on deploy rather than on a decision.
    expect(process.env.READ_MIGRATED_DOMAINS ?? "").not.toContain("profile-page");
  });
});

describe("the reads that remain on the request client", () => {
  it("no longer include message eligibility, because messaging was removed", () => {
    expect(viewSource).not.toMatch(/getMessageEligibility|messagingEligibility/);
    expect(viewSource).not.toMatch(/\bmessaging\b/);
  });
});
