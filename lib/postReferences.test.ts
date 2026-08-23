import { describe, expect, it } from "vitest";
import {
  getPersistedReferenceId,
  hasReferenceContent,
  validateCitationReferences,
} from "./postReferences";

const STORED_ID = "11111111-1111-4111-8111-111111111111";

describe("getPersistedReferenceId", () => {
  it("keeps the database id a stored reference already has", () => {
    expect(getPersistedReferenceId(STORED_ID)).toBe(STORED_ID);
    expect(getPersistedReferenceId(`temp-${STORED_ID}`)).toBe(STORED_ID);
  });

  it("returns nothing for a composer row that never reached the database", () => {
    expect(getPersistedReferenceId("temp-abc")).toBeNull();
    expect(getPersistedReferenceId(undefined)).toBeNull();
    expect(getPersistedReferenceId(null)).toBeNull();
  });
});

describe("hasReferenceContent", () => {
  it("treats an untouched form row as nothing to store", () => {
    expect(hasReferenceContent({ title: "   ", url: "" })).toBe(false);
    expect(hasReferenceContent({})).toBe(false);
  });

  it("stores a row as soon as any field carries something", () => {
    expect(hasReferenceContent({ title: "A study" })).toBe(true);
    expect(hasReferenceContent({ raw: "A note" })).toBe(true);
  });
});

describe("validateCitationReferences", () => {
  it("passes content whose anchor still matches a stored source", () => {
    expect(
      validateCitationReferences(`<p>A claim <a href="#ref-id-${STORED_ID}">[source]</a></p>`, [
        { id: STORED_ID, title: "A study" },
      ])
    ).toBeNull();
  });

  it("rejects an anchor whose source was removed", () => {
    expect(
      validateCitationReferences(`<p>A claim <a href="#ref-id-${STORED_ID}">[source]</a></p>`, [])
    ).toMatch(/source that was removed/i);
  });

  it("rejects a positional marker past the end of the source list", () => {
    expect(validateCitationReferences("<p>A claim [ref:2]</p>", [{ title: "Only one" }])).toMatch(
      /source that was removed/i
    );
    expect(validateCitationReferences("<p>A claim [ref:1]</p>", [{ title: "Only one" }])).toBeNull();
  });

  it("ignores blank source rows when counting positional markers", () => {
    expect(
      validateCitationReferences("<p>A claim [ref:2]</p>", [{ title: "Only one" }, { title: "  " }])
    ).toMatch(/source that was removed/i);
  });

  it("says nothing about content that cites nothing", () => {
    expect(validateCitationReferences("<p>Plain writing.</p>", [])).toBeNull();
  });
});
