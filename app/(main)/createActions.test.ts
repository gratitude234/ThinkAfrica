import { describe, expect, it } from "vitest";
import { CREATE_ACTIONS, getCreateHref } from "./createActions";

describe("CREATE_ACTIONS (public creation chooser)", () => {
  it("offers exactly Post, Article, and Research Paper -- no Blog/Essay/Policy Brief choices", () => {
    expect(CREATE_ACTIONS).toHaveLength(3);
    expect(CREATE_ACTIONS.map((action) => action.label)).toEqual([
      "Post",
      "Article",
      "Research Paper",
    ]);
  });

  it("routes Post to the lightweight Post composer", () => {
    const post = CREATE_ACTIONS.find((action) => action.id === "post");
    expect(post?.href).toBe("/create/post");
  });

  it("routes Article to the Article composer via the stable kind=article param", () => {
    const article = CREATE_ACTIONS.find((action) => action.id === "article");
    expect(article?.href).toBe("/write?kind=article");
  });

  it("routes Research Paper to the research submission flow", () => {
    const research = CREATE_ACTIONS.find((action) => action.id === "research-paper");
    expect(research?.href).toBe("/submit/research");
  });

  it("does not surface any legacy format label as a top-level choice", () => {
    const labels = CREATE_ACTIONS.map((action) => action.label.toLowerCase());
    expect(labels).not.toContain("essay");
    expect(labels).not.toContain("policy brief");
    expect(labels).not.toContain("blog");
    expect(labels).not.toContain("quick take");
  });
});

describe("getCreateHref", () => {
  it("passes the href through unchanged for a signed-in user", () => {
    expect(getCreateHref("/write?kind=article", "user-1")).toBe("/write?kind=article");
  });

  it("redirects a signed-out user through login, preserving the destination", () => {
    expect(getCreateHref("/write?kind=article", null)).toBe(
      "/login?redirectTo=%2Fwrite%3Fkind%3Darticle"
    );
  });
});
