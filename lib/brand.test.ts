import { describe, expect, it } from "vitest";
import {
  BRAND_AUDIENCE,
  BRAND_DESCRIPTION,
  BRAND_ORIGIN_STATEMENT,
  BRAND_PROMISE,
  BRAND_TAGLINE,
} from "./brand";

describe("Phase 1 brand contract", () => {
  it("keeps one public promise and supporting Africa context", () => {
    expect(BRAND_PROMISE).toBe("Build your intellectual identity.");
    expect(BRAND_TAGLINE).toBe("Africa's First Intellectual Social Network");
    expect(BRAND_ORIGIN_STATEMENT).toBe("Imagined in Africa. Ideas have no borders.");
  });

  it("defines the audience by intellectual intent rather than university status", () => {
    expect(BRAND_AUDIENCE).toBe("young people who actively engage with ideas");
    expect(BRAND_DESCRIPTION).toContain("lasting record");
    expect(BRAND_DESCRIPTION).not.toContain("student");
  });
});
