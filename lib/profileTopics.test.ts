import { describe, expect, it } from "vitest";
import { formatInterestLabel } from "./profileTopics";

describe("formatInterestLabel", () => {
  it("title-cases an interest typed in lower case", () => {
    expect(formatInterestLabel("law")).toBe("Law");
    expect(formatInterestLabel("public policy")).toBe("Public Policy");
    expect(formatInterestLabel("governance & policy")).toBe("Governance & Policy");
  });

  it("capitalises after a hyphen or a slash", () => {
    expect(formatInterestLabel("socio-economic")).toBe("Socio-Economic");
    expect(formatInterestLabel("art/design")).toBe("Art/Design");
  });

  it("leaves anything already holding a capital untouched", () => {
    expect(formatInterestLabel("pan-African")).toBe("pan-African");
    expect(formatInterestLabel("Technology & AI")).toBe("Technology & AI");
  });

  it("trims before it formats", () => {
    expect(formatInterestLabel("  law  ")).toBe("Law");
  });
});
