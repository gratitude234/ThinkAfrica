import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as postQuality from "@/lib/postQuality";

describe("isLowQualityTitle", () => {
  it.each([null, undefined, "", "   ", "abc"])("treats %j as too thin to index", (title) => {
    expect(postQuality.isLowQualityTitle(title)).toBe(true);
  });

  it.each(["Untitled reflection", "Test post", "draft", "New post about water", "asdfff", "..."])(
    "treats the placeholder title %j as too thin to index",
    (title) => {
      expect(postQuality.isLowQualityTitle(title)).toBe(true);
    }
  );

  it.each(["Water policy in Lagos", "Drafting a constitution", "Testimony and memory"])(
    "keeps a real title %j, including one that merely starts like a placeholder",
    (title) => {
      expect(postQuality.isLowQualityTitle(title)).toBe(false);
    }
  );
});

describe("post quality after Phase 2F", () => {
  it("offers no badges, feed reasons or quality checklist", () => {
    expect(Object.keys(postQuality)).toEqual(["isLowQualityTitle"]);
    const source = readFileSync(resolve(process.cwd(), "lib/postQuality.ts"), "utf8");
    for (const retired of ["getPublicQualitySignals", "getFeedSurfaceReason", "getPostQualitySummary"]) {
      expect(source).not.toContain(retired);
    }
  });
});
