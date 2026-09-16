import { describe, expect, it } from "vitest";
import {
  getGraduationYearError,
  getProfileDetailsError,
  PROFILE_SETTINGS_SECTIONS,
  type ProfileDetailsDraft,
} from "./profileSettings";

const draft = (overrides: Partial<ProfileDetailsDraft> = {}): ProfileDetailsDraft => ({
  fullName: "Ada Obi",
  username: "ada",
  headline: "",
  bio: "",
  country: "",
  university: "",
  fieldOfStudy: "",
  graduationYear: "",
  ...overrides,
});

describe("Edit profile", () => {
  it("is Profile, Topics and Visibility", () => {
    expect([...PROFILE_SETTINGS_SECTIONS]).toEqual(["profile", "topics", "visibility"]);
  });
});

describe("getProfileDetailsError", () => {
  it("needs a name and a usable username, and treats everything else as optional", () => {
    expect(getProfileDetailsError(draft())).toBeNull();
    expect(getProfileDetailsError(draft({ fullName: "" }))).toBe("Add your name.");
    expect(getProfileDetailsError(draft({ username: "" }))).toBe("Choose a username.");
    expect(getProfileDetailsError(draft({ username: "explore" }))).toMatch(/reserved/);
  });

  it("bounds the headline and the bio", () => {
    expect(getProfileDetailsError(draft({ headline: "x".repeat(120) }))).toBeNull();
    expect(getProfileDetailsError(draft({ headline: "x".repeat(121) }))).toMatch(/headline/);
    expect(getProfileDetailsError(draft({ bio: "x".repeat(301) }))).toMatch(/bio/);
  });

  it("takes education as an ordinary fact, from any year a graduate could have", () => {
    expect(
      getProfileDetailsError(
        draft({ university: "University of Ibadan", fieldOfStudy: "Law", graduationYear: "1998" })
      )
    ).toBeNull();
  });
});

describe("getGraduationYearError", () => {
  it("accepts an empty year and a four-digit year in range", () => {
    expect(getGraduationYearError("")).toBeNull();
    expect(getGraduationYearError("2027")).toBeNull();
  });

  it("rejects anything else", () => {
    expect(getGraduationYearError("27")).toMatch(/four-digit/);
    expect(getGraduationYearError("1900")).toMatch(/between/);
    expect(getGraduationYearError("2200")).toMatch(/between/);
  });
});
