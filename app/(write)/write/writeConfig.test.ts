import { describe, expect, it } from "vitest";
import { getPublishGateCopy, isPostType, resolveWriteRedirectPath } from "./writeConfig";

describe("isPostType", () => {
  it("accepts every legacy post type", () => {
    expect(isPostType("blog")).toBe(true);
    expect(isPostType("essay")).toBe(true);
    expect(isPostType("policy_brief")).toBe(true);
    expect(isPostType("research")).toBe(true);
  });

  it("rejects new content-kind values and unknown/null input", () => {
    expect(isPostType("post")).toBe(false);
    expect(isPostType("article")).toBe(false);
    expect(isPostType(null)).toBe(false);
    expect(isPostType("")).toBe(false);
  });
});

describe("getPublishGateCopy (Article composer publish-gate wording)", () => {
  it("uses 'Preview & publish' for a Post/Article draft -- not 'Review', which implies a formal review step it doesn't have", () => {
    expect(getPublishGateCopy("blog").desktopLabel).toBe("Preview & publish");
    expect(getPublishGateCopy("essay").desktopLabel).toBe("Preview & publish");
    expect(getPublishGateCopy("blog").mobileLabel).toBe("Publish");
    expect(getPublishGateCopy("essay").mobileLabel).toBe("Publish");
  });

  it("preserves 'Review & publish' for a legacy Policy Brief draft still in the editorial workflow", () => {
    const copy = getPublishGateCopy("policy_brief");
    expect(copy.desktopLabel).toBe("Review & publish");
    expect(copy.mobileLabel).toBe("Review");
    expect(copy.ariaLabel).toBe("Review and publish");
  });

  it("never uses raw 'Review' alone for a plain Article/Post -- only 'Publish' or 'Preview & publish'", () => {
    for (const type of ["blog", "essay"] as const) {
      const copy = getPublishGateCopy(type);
      expect(copy.mobileLabel).not.toBe("Review");
      expect(copy.desktopLabel).not.toContain("Review");
    }
  });
});

describe("resolveWriteRedirectPath (old query params / legacy drafts resolve safely)", () => {
  it("redirects type=research to the research submission flow", () => {
    expect(
      resolveWriteRedirectPath({ typeParam: "research", kindParam: null, draftParam: null })
    ).toBe("/submit/research");
  });

  it("redirects kind=research the same as the legacy type=research param", () => {
    expect(
      resolveWriteRedirectPath({ typeParam: null, kindParam: "research", draftParam: null })
    ).toBe("/submit/research");
  });

  it("carries a draft id through the research redirect", () => {
    expect(
      resolveWriteRedirectPath({ typeParam: "research", kindParam: null, draftParam: "draft-1" })
    ).toBe("/submit/research?draft=draft-1");
  });

  it("redirects kind=post to the lightweight Post composer", () => {
    expect(
      resolveWriteRedirectPath({ typeParam: null, kindParam: "post", draftParam: null })
    ).toBe("/create/post");
  });

  it("research redirect takes priority over a simultaneous kind=post", () => {
    expect(
      resolveWriteRedirectPath({ typeParam: "research", kindParam: "post", draftParam: null })
    ).toBe("/submit/research");
  });

  it("does not redirect legacy type=essay/type=policy_brief links -- they land on the Article composer", () => {
    expect(
      resolveWriteRedirectPath({ typeParam: "essay", kindParam: null, draftParam: null })
    ).toBeNull();
    expect(
      resolveWriteRedirectPath({ typeParam: "policy_brief", kindParam: null, draftParam: null })
    ).toBeNull();
  });

  it("does not redirect the preferred kind=article param", () => {
    expect(
      resolveWriteRedirectPath({ typeParam: null, kindParam: "article", draftParam: null })
    ).toBeNull();
  });

  it("does not redirect when there are no params at all", () => {
    expect(
      resolveWriteRedirectPath({ typeParam: null, kindParam: null, draftParam: null })
    ).toBeNull();
  });
});
