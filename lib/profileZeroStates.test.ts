import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildProfileRecordHref,
  parseProfileRecordQuery,
  PROFILE_RECORD_FILTERS,
} from "./profileRecord";
import { getVisibleProfileRecordMetrics } from "./profileRecordMetrics";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const profilePage = read("app/(main)/[username]/page.tsx");
const recordPage = read("app/(main)/[username]/record/page.tsx");
const onboarding = read("app/(onboarding)/onboarding/OnboardingClient.tsx");

describe("public profile zero states", () => {
  it("never offers the full record when the preview is empty", () => {
    expect(profilePage).toContain("{latestRecord.items.length > 0 ? (");
    const linkIndex = profilePage.indexOf("View full record");
    const guardIndex = profilePage.indexOf("{latestRecord.items.length > 0 ? (");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(linkIndex);
  });

  it("keeps the respectful empty state a visitor already had", () => {
    expect(profilePage).toContain("has not published any work yet.");
  });

  it("gives the owner a next action and no public completion score", () => {
    expect(profilePage).toContain("Publish your first contribution");
    expect(profilePage).not.toMatch(/completion|profileScore|percentComplete/i);
  });
});

describe("full record zero states", () => {
  it("prints a tab count only when the tab has something in it", () => {
    expect(recordPage).toContain(
      "{showFilterCounts && filterCount(filter, summary) > 0 ? ("
    );
  });

  it("still renders and links every supported filter", () => {
    // Suppressing a count must not suppress the tab: a reader who wants
    // Responses can still get there, and so can a URL.
    expect(recordPage).toContain("filters.map((filter)");
    expect(recordPage).not.toMatch(/filters\.filter\([^)]*filterCount/);
    for (const filter of PROFILE_RECORD_FILTERS) {
      expect(
        buildProfileRecordHref({ username: "ada", filter })
      ).toMatch(/^\/ada\/record(\?type=|$)/);
    }
  });

  it("preserves URL normalization for every filter and quality pair", () => {
    expect(parseProfileRecordQuery({ type: "responses" }, true).filter).toBe(
      "responses"
    );
    expect(parseProfileRecordQuery({ type: "debates" }, true).filter).toBe(
      "debates"
    );
    expect(
      parseProfileRecordQuery({ type: "publications", quality: "citable" }, true)
    ).toEqual({
      filter: "publications",
      quality: "citable",
      topic: null,
      page: 1,
    });
    expect(parseProfileRecordQuery({ type: "research" }, false).filter).toBe("all");
  });

  it("builds its topic row from demonstrated topics rather than interests", () => {
    expect(recordPage).toContain("topicIndex.demonstratedTopics");
    expect(recordPage).not.toContain("topicIndex.topics");
    expect(recordPage).not.toMatch(/interests[\s\S]{0,60}topicChips/);
  });
});

describe("onboarding record preview", () => {
  it("does not render a grid of three zeroes", () => {
    expect(onboarding).not.toContain("[recordStats.publicationCount, \"Publications\"]");
    expect(onboarding).toContain("getVisibleProfileRecordMetrics(recordStats)");
    expect(onboarding).toContain("{previewMetrics.length > 0 ? (");
  });

  it("explains what will appear after a first publication", () => {
    expect(onboarding).toContain("Publish your first contribution and this becomes a record");
  });

  it("shows a returning user the record statistics they already have", () => {
    // Same rule as the public profile, from the same module: whatever is
    // non-zero is shown, whatever is zero is not.
    expect(
      getVisibleProfileRecordMetrics({
        publicationCount: 4,
        sourceBackedCount: 2,
        citableCount: 0,
      }).map((metric) => metric.label)
    ).toEqual(["Publications", "Source-backed"]);
    expect(
      getVisibleProfileRecordMetrics({
        publicationCount: 0,
        sourceBackedCount: 0,
        citableCount: 0,
      })
    ).toEqual([]);
  });

  it("still reads the record summary from the shared RPC", () => {
    expect(onboarding).toContain('rpc("get_public_profile_record_summary"');
  });
});
