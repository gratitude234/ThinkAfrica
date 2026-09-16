import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The publishing model is Post and Article, and nothing else.
 *
 * Phase 2I made the database say so -- `content_kind` NOT NULL and constrained
 * to 'post' and 'article', `article_format` always null, `type` derived
 * (20260915000005 to 20260915000007) -- and this keeps the application from
 * drifting back. Production carries 101 Posts and 210 Articles, no research
 * kind, and no policy_brief or research legacy type.
 *
 * What this scans and what it does not:
 *
 *   - application code only: app, components, lib and proxy.ts, with comments
 *     stripped and test files excluded. A comment explaining why something was
 *     removed is not a reintroduction of it;
 *   - historical SQL migrations are deliberately not scanned. They are the
 *     record of how the database got here and must not be edited;
 *   - the phase reports and docs are not scanned, for the same reason.
 *
 * The exception list below is the whole of the deliberate residue, each entry
 * naming why it survives. Anything else matching is a failure.
 */

const ROOT = process.cwd();
const ROOTS = ["app", "components", "lib"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") out.push(...sourceFiles(full));
    } else if (
      /\.(ts|tsx|mjs)$/.test(entry.name) &&
      !/\.test\.(ts|tsx)$/.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(
      /(^|[^:])\/\/[^\n]*/g,
      (match, prefix) => prefix + " ".repeat(match.length - prefix.length)
    );
}

const sources = [
  ...ROOTS.flatMap((dir) => sourceFiles(join(ROOT, dir))),
  join(ROOT, "proxy.ts"),
].map((file) => ({
  file: relative(ROOT, file).split(sep).join("/"),
  code: withoutComments(readFileSync(file, "utf8")),
}));

function filesMatching(pattern: RegExp, allowed: Record<string, string> = {}) {
  return sources
    .filter(({ file, code }) => !(file in allowed) && pattern.test(code))
    .map(({ file }) => file);
}

describe("the retired content kinds are gone from the application", () => {
  /**
   * The legacy vocabulary survives in exactly three shapes, each of which
   * keeps an existing URL working rather than reviving a concept:
   *
   *   - a legacy `?type=` parameter on Explore and on the feed, mapped to the
   *     shelf the piece now belongs to;
   *   - a legacy `type` parameter on the OG image route, so an image already
   *     cached against a shared link still resolves;
   *   - the refusal list in lib/postPolicy.ts, which names the columns an
   *     authenticated write may never set.
   *
   * Anything outside this list is a reintroduction.
   */
  const LEGACY_URL_MAPPERS = {
    "app/(main)/explore/exploreFilters.ts":
      "maps a legacy ?type= link to the Posts or Articles shelf",
    "lib/feedData.ts": "maps a legacy ?type= link to a feed content filter",
    "app/api/og/route.tsx":
      "maps a legacy share link to Article, so an existing OG URL still resolves",
  };

  it("classifies nothing as research", () => {
    // Anchored to classification, not to the word: "research" is still a
    // topic somebody can write about, and still a reserved profile path.
    expect(
      filesMatching(
        /content_kind[^\n]*["']research["']|["']research["'][^\n]*content_kind|\btype\s*===?\s*["']research["']|["']type["']\s*,\s*["']research["']|\btype:\s*["']research["']/,
        LEGACY_URL_MAPPERS
      )
    ).toEqual([]);
  });

  it("classifies nothing as a policy brief, and labels nothing that way", () => {
    expect(filesMatching(/policy_brief|Policy Brief/, LEGACY_URL_MAPPERS)).toEqual([]);
  });

  it("reads no article_format anywhere", () => {
    // The column is always null (20260915000006). The one mention left is the
    // write refusal list, which is what keeps it that way from this side.
    expect(
      filesMatching(/article_format/, {
        "lib/postPolicy.ts":
          "names it in NEVER_AUTHOR_WRITABLE_POST_COLUMNS, so a write cannot set it",
      })
    ).toEqual([]);
  });

  it("offers no Essay as a genre", () => {
    expect(filesMatching(/["']essay["']|\bEssay\b/, LEGACY_URL_MAPPERS)).toEqual([]);
  });
});

describe("the legacy type column is not read or written", () => {
  it("has no research query exclusion left", () => {
    expect(filesMatching(/RESEARCH_TYPE_QUERY_EXCLUSION/)).toEqual([]);
  });

  it("selects posts.type in no query", () => {
    expect(
      filesMatching(/\btype,\s*content_kind\b|\bcontent_kind,\s*article_format\b/)
    ).toEqual([]);
  });

  it("filters on posts.type in no query", () => {
    expect(
      filesMatching(/\.neq\(\s*["']type["']|\.eq\(\s*["']type["']\s*,\s*["'](?:essay|blog|research|policy_brief)/)
    ).toEqual([]);
  });

  it("exports no PostType union and no legacy type labels", () => {
    for (const gone of [
      "POST_TYPE_LABELS",
      "POST_TYPE_INTENTS",
      "MIN_WORD_COUNTS",
      "isQuickTake",
      "QUICK_TAKE_MAX_WORDS",
    ]) {
      expect(filesMatching(new RegExp(`\\b${gone}\\b`)), gone).toEqual([]);
    }
  });
});

describe("the content model module stays small", () => {
  it("exports two kinds and no dual-model helper", () => {
    const model = readFileSync(join(ROOT, "lib/contentModel.ts"), "utf8");

    expect(model).toContain(`export type ContentKind = "post" | "article"`);
    for (const gone of [
      "ArticleFormat",
      "resolveArticleFormat",
      "getArticleFormatLabel",
      "LegacyPostType",
      "legacyTypesForContentKind",
      "contentKindFromLegacyType",
      "legacyTypeForNewContent",
      "isFormallyReviewed",
      "needsEditorialWorkflow",
      "isLegacyPolicyBriefInFlight",
      "contentKindRequiresFormalReview",
      "contentKindIsFormalPublication",
    ]) {
      expect(model, gone).not.toContain(gone);
    }
  });

  it("resolves a kind from content_kind alone, with no fallback to type", () => {
    const model = withoutComments(
      readFileSync(join(ROOT, "lib/contentModel.ts"), "utf8")
    );
    const resolver = model.slice(model.indexOf("export function resolveContentKind"));
    expect(resolver).not.toContain("record.type");
  });
});

describe("the review workflow is gone from the write path", () => {
  it("keeps no editorial operation in the mutation domain", () => {
    const domain = withoutComments(
      readFileSync(join(ROOT, "lib/postMutations.ts"), "utf8")
    );
    for (const gone of [
      "submitPostForReview",
      "resubmitRevision",
      "withdrawSubmission",
      "editorialDecision",
      "publishApprovedPost",
    ]) {
      expect(domain, gone).not.toContain(gone);
    }
  });

  it("keeps no editorial rule in the policy", () => {
    const policy = withoutComments(
      readFileSync(join(ROOT, "lib/postPolicy.ts"), "utf8")
    );
    for (const gone of [
      "EDITORIAL_POST_TYPES",
      "requiresEditorialPublication",
      "self_publish_reviewed",
      "locked_publication",
      "withdraw_not_eligible",
      "LIVE_POLICY",
      "REPO_POLICY",
      "freezeClassificationInReview",
      "classifyByContentKind",
    ]) {
      expect(policy, gone).not.toContain(gone);
    }
  });

  it("has no editor post actor", () => {
    const policy = withoutComments(
      readFileSync(join(ROOT, "lib/postPolicy.ts"), "utf8")
    );
    expect(policy).not.toMatch(/kind:\s*["']editor["']/);
  });

  it("still refuses to let an author touch the citation evidence", () => {
    // Kept deliberately: /publication/[citationId] resolves old citation URLs
    // through posts.citation_id, and two published rows carry one.
    const policy = readFileSync(join(ROOT, "lib/postPolicy.ts"), "utf8");
    expect(policy).toContain("citation_id_forbidden");
    expect(policy).toContain("published_version_id_forbidden");
  });
});

describe("the writing path persists the classification once", () => {
  it("derives what it stores from the title, and stores content_kind alone", () => {
    const contribution = withoutComments(
      readFileSync(join(ROOT, "lib/contribution.ts"), "utf8")
    );
    const derive = contribution.slice(
      contribution.indexOf("export function derivePresentationClassification")
    );
    expect(derive).toContain("content_kind");
    expect(derive).not.toContain("type:");
    expect(derive).not.toContain("article_format");
  });

  it("sends no legacy classification column to the database", () => {
    const writes = withoutComments(
      readFileSync(join(ROOT, "lib/db/postWrites.ts"), "utf8")
    );
    const columnMap = writes.slice(
      writes.indexOf("const COLUMN_KINDS"),
      writes.indexOf("/** The placeholder expression")
    );
    for (const gone of ["type:", "article_format", "in_response_to", "current_round"]) {
      expect(columnMap, gone).not.toContain(gone);
    }
  });
});

describe("no retired vocabulary reaches a reader", () => {
  it("shows no Reviewed or Citable label", () => {
    expect(
      filesMatching(/["'][^"']*\b(Reviewed publication|Citable)\b[^"']*["']/)
    ).toEqual([]);
  });

  it("offers no Editorial Trust analytics", () => {
    expect(filesMatching(/Editorial Trust|editorialCitablePosts|editorialCompletedReviews/)).toEqual(
      []
    );
  });
});
