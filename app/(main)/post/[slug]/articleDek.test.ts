import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "app/(main)/post/[slug]/page.tsx"), "utf8");

describe("the article's dek", () => {
  it("is printed only when someone wrote it", () => {
    // The rule is tested in lib/contribution.test.ts. This pins the page to
    // it, because a server component this size has no render test.
    expect(page).toContain("isWrittenExcerpt(sanitizedExcerpt, sanitizedContent)");
    expect(page).toMatch(/\{writtenExcerpt \? \(/);
    expect(page).not.toMatch(/\{sanitizedExcerpt \? \(/);
  });
});
