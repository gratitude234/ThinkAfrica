import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE_TAB,
  PROFILE_TAB_KIND,
  PROFILE_TABS,
  profilePublicationKind,
  profileTabHref,
  resolveProfilePage,
  resolveProfileTab,
} from "./profileTabs";

describe("the profile tabs", () => {
  it("are Overview, About, Articles and Posts, opening on Overview", () => {
    expect([...PROFILE_TABS]).toEqual(["overview", "about", "articles", "posts"]);
    expect(DEFAULT_PROFILE_TAB).toBe("overview");
  });

  it("open the tab a query names", () => {
    expect(resolveProfileTab({ view: "articles" })).toBe("articles");
    expect(resolveProfileTab({ view: "about" })).toBe("about");
    expect(resolveProfileTab({ view: ["about", "posts"] })).toBe("about");
  });

  it("open the default tab for every retired view", () => {
    for (const view of ["research", "responses", "record", "featured", "brief"]) {
      expect(resolveProfileTab({ view })).toBe("overview");
    }
    expect(resolveProfileTab({})).toBe("overview");
  });

  it("honour an old record link's type after its redirect", () => {
    expect(resolveProfileTab({ type: "posts" })).toBe("posts");
    expect(resolveProfileTab({ type: "articles" })).toBe("articles");
    expect(resolveProfileTab({ type: "publications" })).toBe("overview");
    expect(resolveProfileTab({ type: "research" })).toBe("overview");
    // A real view wins over a legacy type.
    expect(resolveProfileTab({ view: "about", type: "articles" })).toBe("about");
  });

  it("build plain addresses, with no query on the default tab", () => {
    expect(profileTabHref("ada", "overview")).toBe("/ada");
    expect(profileTabHref("ada", "articles")).toBe("/ada?view=articles");
    expect(profileTabHref("ada", "about")).toBe("/ada?view=about");
    expect(profileTabHref("ada", "posts", 2)).toBe("/ada?view=posts&page=2");
    expect(profileTabHref("ada", "articles", 3)).toBe("/ada?view=articles&page=3");
  });

  it("read a page number defensively", () => {
    expect(resolveProfilePage(undefined)).toBe(1);
    expect(resolveProfilePage("0")).toBe(1);
    expect(resolveProfilePage("-4")).toBe(1);
    expect(resolveProfilePage("two")).toBe(1);
    expect(resolveProfilePage("3")).toBe(3);
    expect(resolveProfilePage("99999")).toBe(500);
  });
});

describe("Post and Article classification", () => {
  it("files each kind on its own tab", () => {
    expect(profilePublicationKind({ content_kind: "post" })).toBe("post");
    expect(profilePublicationKind({ content_kind: "article" })).toBe("article");
  });

  it("reads the kind and never a legacy type", () => {
    // A writer old Research paper or Policy Brief carries content_kind
    // "article" since 20260915000005, and lands on Articles because it is one
    // rather than because a mapping table says so.
    expect(profilePublicationKind({ content_kind: "article", type: "research" })).toBe(
      "article"
    );
    expect(profilePublicationKind({ content_kind: "post", type: "essay" })).toBe("post");
  });

  it("lists nothing it cannot classify", () => {
    expect(profilePublicationKind({ content_kind: null })).toBeNull();
    expect(profilePublicationKind({ content_kind: "research" })).toBeNull();
    expect(profilePublicationKind({})).toBeNull();
  });

  it("maps each listing tab to the kind it selects", () => {
    expect(PROFILE_TAB_KIND.posts).toBe("post");
    expect(PROFILE_TAB_KIND.articles).toBe("article");
    expect("about" in PROFILE_TAB_KIND).toBe(false);
  });
});
