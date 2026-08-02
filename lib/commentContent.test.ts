import { describe, expect, it } from "vitest";
import {
  COMMENT_MAX_CHARACTERS,
  countCommentCharacters,
  deriveCommentPreview,
  getCommentBodyError,
  isCommentBodyValid,
  normalizeCommentText,
} from "./commentContent";

describe("commentContent", () => {
  it("normalizes line endings and trims the ends without touching inner spacing", () => {
    expect(normalizeCommentText("  a\r\n\r\nb  ")).toBe("a\n\nb");
  });

  it("counts the user-visible text, not the raw input", () => {
    expect(countCommentCharacters("   hey   ")).toBe(3);
  });

  it("rejects an empty body and accepts one at exactly the limit", () => {
    expect(isCommentBodyValid("   ")).toBe(false);
    expect(isCommentBodyValid("a".repeat(COMMENT_MAX_CHARACTERS))).toBe(true);
    expect(isCommentBodyValid("a".repeat(COMMENT_MAX_CHARACTERS + 1))).toBe(false);
  });

  it("explains why a body was rejected, with the actual length", () => {
    expect(getCommentBodyError("")).toBe("Write something before posting.");
    expect(getCommentBodyError("ok")).toBeNull();
    expect(getCommentBodyError("a".repeat(COMMENT_MAX_CHARACTERS + 5))).toContain(
      `${COMMENT_MAX_CHARACTERS + 5}`
    );
  });

  it("previews on a word boundary and leaves short text alone", () => {
    expect(deriveCommentPreview("short one")).toBe("short one");
    const preview = deriveCommentPreview("word ".repeat(80), 40);
    expect(preview.endsWith("...")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(43);
    expect(preview).not.toContain("  ");
  });
});
