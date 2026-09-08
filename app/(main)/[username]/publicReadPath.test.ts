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
 * The companion behavioural proofs are `lib/db/profilePage.neon.test.ts` and
 * `lib/db/profileRecord.neon.test.ts`.
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
const recordSource = withoutComments(read("lib/profileRecordData.ts"));

describe("the public profile page", () => {
  it("issues no PostgREST table call from lib/profileViewData.ts", () => {
    expect(tableCalls(viewSource)).toEqual([]);
  });

  it("issues no PostgREST table call from lib/profileRecordData.ts", () => {
    expect(tableCalls(recordSource)).toEqual([]);
  });

  it("issues no PostgREST RPC from either loader", () => {
    // The record summary's v2-then-v1 fallback moved into the repository,
    // which reproduces it on both backends. A `.rpc(` reappearing here means
    // it came back to the caller and stopped being portable.
    expect(rpcCalls(viewSource)).toEqual([]);
    expect(rpcCalls(recordSource)).toEqual([]);
  });

  it("routes every profile read through the adapter", () => {
    for (const source of [viewSource, recordSource]) {
      expect(source).toMatch(/from "@\/lib\/db/);
    }
  });

  it("keeps the identity lookup behind lib/db, not on the request client", () => {
    // loadProfileIdentity moved first and is what 404s a nonexistent profile.
    // If it regressed to a direct query the page would still work and the
    // migration claim would be false.
    expect(viewSource).toMatch(/getDatabase\(\)\.profiles\.findIdentityByUsername/);
  });

  it("shares one migration switch between the header and the record", () => {
    const adapter = withoutComments(read("lib/db/readAdapter.ts"));

    // Both repositories answer to `profile-page`. Two switches would let one
    // profile be served half from PostgREST and half from PostgreSQL, which
    // is the state this migration is arranged to avoid.
    const gated = [
      ...adapter.matchAll(/isReadDomainMigrated\("([a-z-]+)"\)/g),
    ].map((match) => match[1]);

    expect(gated.filter((domain) => domain === "profile-page")).toHaveLength(2);
  });

  it("leaves the profile domain unmigrated by default", () => {
    // READ_MIGRATED_DOMAINS is unset in production. A default that turned this
    // on would move a live read on deploy rather than on a decision.
    expect(process.env.READ_MIGRATED_DOMAINS ?? "").not.toContain("profile-page");
  });
});

describe("the reads that remain on the request client", () => {
  it("are the authenticated ones, and are reached only by a signed-in stranger", () => {
    // getMessageEligibility is the one PostgREST caller left in the profile
    // path. It answers "can this viewer message this member", which a
    // logged-out reader never asks, so it is not on the public path.
    expect(viewSource).toMatch(/getMessageEligibility\(supabase/);

    const guarded = viewSource.slice(
      viewSource.indexOf("const [counts, relationship, messaging]")
    );
    const call = guarded.indexOf("getMessageEligibility(supabase");
    const guard = guarded.lastIndexOf("isStranger", call);

    expect(guard).toBeGreaterThan(-1);
    expect(call - guard).toBeLessThan(120);
  });
});
