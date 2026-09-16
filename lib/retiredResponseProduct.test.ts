import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Responses stay retired as a product concept.
 *
 * Phase 2B removed every way to create one. Phase 2C removed what was left of
 * the concept: the Responses list under a post, response counts in discussion
 * totals and ranking, the "Responding to" context and badge, the Responses feed
 * mode, the Explore and topic shelves, the profile category, and response
 * points. A post published as a response before then is an ordinary Post or
 * Article, and `posts.in_response_to` is historical data nothing reads for
 * presentation.
 *
 * Comments are stripped before matching, the same way
 * lib/postWriteBoundary.test.ts does it: the code that remains describes the
 * removal in prose, and that is not a regression.
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

function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, prefix) => prefix + " ".repeat(match.length - prefix.length));
}

const sources = ROOTS.flatMap(sourceFiles).map((file) => ({
  file: relative(process.cwd(), file).split(sep).join("/"),
  code: withoutComments(readFileSync(file, "utf8")),
}));

/**
 * Files allowed to name a retired Response field, each for a reason that is
 * not presentation. The list should shrink, never grow.
 */
const ALLOWED: Record<string, string> = {
  "app/(write)/write/page.tsx":
    "Names response_to in the list of retired query parameters the composer " +
    "ignores and strips from the sign-in destination.",
};

function filesMatching(pattern: RegExp) {
  return sources
    .filter(({ file, code }) => !(file in ALLOWED) && pattern.test(code))
    .map(({ file }) => file);
}

describe("Responses as a product concept", () => {
  it("has no Responses route, only the redirect that replaced it", () => {
    expect(existsSync(join(process.cwd(), "app", "(main)", "responses"))).toBe(false);
    const nextConfig = readFileSync(join(process.cwd(), "next.config.mjs"), "utf8");
    expect(nextConfig).toMatch(/source: "\/responses",\s*destination: "\/explore",\s*permanent: true/);
  });

  it("counts no responses anywhere", () => {
    expect(filesMatching(/\bresponse_count\b|\bresponseCounts?\b/)).toEqual([]);
  });

  it("offers no Responses feed mode or per-post Responses list", () => {
    expect(filesMatching(/\bonlyResponses\b|\bfetchResponse(Page|Cards)\b|\bresponsePosts\b/)).toEqual([]);
  });

  it("gives no card, page or profile a Response identity", () => {
    expect(
      filesMatching(/\brespondingTo\b|\bresponse_to\b|Responding to|\bisResponse\b|\bResponseStartLink\b/)
    ).toEqual([]);
  });

  it("has no Response discovery shelf", () => {
    expect(filesMatching(/\bactiveConversations\b|Active conversations|Response thread/i)).toEqual([]);
  });

  it("ranks and scores nothing on Responses", () => {
    for (const file of ["lib/feedRanking.ts", "lib/postQuality.ts"]) {
      const code = sources.find((source) => source.file === file)!.code;
      expect(code, file).not.toMatch(/respon/i);
    }
  });

  it("awards no Response points and measures no Response activity", () => {
    expect(filesMatching(/\bRESPONSE_POINTS\b|\bpublishedResponses\b|\bresponseStarts?\b|"response_started"/)).toEqual([]);
  });
});
