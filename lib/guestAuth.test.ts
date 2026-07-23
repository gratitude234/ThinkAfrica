import { describe, expect, it } from "vitest";
import { buildLoginHref, getContentKindLabel, getGuestAuthCopy } from "./guestAuth";

describe("getContentKindLabel", () => {
  it("capitalizes known content kinds", () => {
    expect(getContentKindLabel("post")).toBe("Post");
    expect(getContentKindLabel("article")).toBe("Article");
    expect(getContentKindLabel("research")).toBe("Research");
  });

  it("returns null for no content kind", () => {
    expect(getContentKindLabel(null)).toBeNull();
    expect(getContentKindLabel(undefined)).toBeNull();
  });
});

describe("getGuestAuthCopy", () => {
  it("builds the like title from the content kind, capitalized", () => {
    expect(getGuestAuthCopy("like", "post").title).toBe("Sign in to like this Post");
    expect(getGuestAuthCopy("like", "article").title).toBe("Sign in to like this Article");
  });

  it("builds the save title from the content kind", () => {
    expect(getGuestAuthCopy("save", "research").title).toBe("Sign in to save this Research");
  });

  it("falls back to a generic title when no content kind is given", () => {
    expect(getGuestAuthCopy("like").title).toBe("Sign in to like this");
    expect(getGuestAuthCopy("save").title).toBe("Sign in to save this");
  });

  it("uses fixed copy for respond and create, ignoring content kind", () => {
    expect(getGuestAuthCopy("respond").title).toBe("Sign in to respond");
    expect(getGuestAuthCopy("create").title).toBe("Sign in to publish");
  });
});

describe("buildLoginHref", () => {
  it("URL-encodes a relative path with query and hash", () => {
    expect(buildLoginHref("/?tab=home&type=article#responses")).toBe(
      "/login?redirectTo=%2F%3Ftab%3Dhome%26type%3Darticle%23responses"
    );
  });

  it("falls back to / for a path that doesn't start with a single slash (never an open redirect)", () => {
    expect(buildLoginHref("https://evil.example.com")).toBe("/login?redirectTo=%2F");
    expect(buildLoginHref("//evil.example.com")).toBe("/login?redirectTo=%2F");
  });
});
