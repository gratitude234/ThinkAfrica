import { describe, expect, it } from "vitest";
import {
  BRAND_AUDIENCE,
  BRAND_DESCRIPTION,
  BRAND_ORIGIN_STATEMENT,
  BRAND_PROMISE,
  BRAND_SEO_DESCRIPTION,
  BRAND_TAGLINE,
} from "./brand";

/**
 * The brand contract for the focused publishing product. The final UI
 * simplification retired the "intellectual identity" promise and the
 * "Intellectual Social Network" tagline with the record products they
 * described.
 */
describe("brand contract", () => {
  it("keeps one plain public promise and the Africa origin", () => {
    expect(BRAND_PROMISE).toBe("Read. Write. Follow. Discover.");
    expect(BRAND_TAGLINE).toBe("A place to read and publish ideas.");
    expect(BRAND_ORIGIN_STATEMENT).toBe("Imagined in Africa. Ideas have no borders.");
  });

  it("speaks to readers and writers, not to an intellectual identity or a university status", () => {
    expect(BRAND_AUDIENCE).toBe("readers and writers");
    expect(BRAND_DESCRIPTION).toContain("Posts and Articles");
    for (const copy of [BRAND_PROMISE, BRAND_TAGLINE, BRAND_AUDIENCE, BRAND_DESCRIPTION, BRAND_SEO_DESCRIPTION]) {
      expect(copy).not.toMatch(
        /intellectual identity|intellectual social network|lasting record|evidence-backed|research|student/i
      );
    }
  });
});
