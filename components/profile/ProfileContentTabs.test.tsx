import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProfileContentTabs, { type ProfileContentItem } from "./ProfileContentTabs";

function item(overrides: Partial<ProfileContentItem>): ProfileContentItem {
  return {
    id: "item-1",
    title: null,
    slug: "a-publication",
    excerpt: "A concise contribution to the conversation.",
    type: "blog",
    content_kind: "post",
    article_format: null,
    created_at: "2026-07-22T10:00:00.000Z",
    published_at: "2026-07-22T10:00:00.000Z",
    ...overrides,
  };
}

describe("ProfileContentTabs", () => {
  it("separates Posts, Articles, and Research by the resolved content model", () => {
    render(
      <ProfileContentTabs
        isOwnProfile={false}
        items={[
          item({ id: "post", slug: "post", excerpt: "A titleless post" }),
          item({ id: "article", slug: "article", title: "A public argument", type: "essay", content_kind: "article", article_format: "essay" }),
          item({ id: "research", slug: "research", title: "A field study", type: "research", content_kind: "research", citation_id: "IND-1" }),
        ]}
      />
    );

    expect(screen.getByText("A titleless post")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Articles/ }));
    expect(screen.getByRole("heading", { name: "A public argument" })).toBeInTheDocument();
    expect(screen.getByText("Article · Essay")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Research/ }));
    expect(screen.getByRole("heading", { name: "A field study" })).toBeInTheDocument();
    expect(screen.getByText("Citable")).toBeInTheDocument();
  });

  it("shows the matching creation action in an owner's empty tab", () => {
    render(<ProfileContentTabs items={[]} isOwnProfile />);
    expect(screen.getByRole("link", { name: "Write a post" })).toHaveAttribute("href", "/create/post");
    fireEvent.click(screen.getByRole("tab", { name: /Research/ }));
    expect(screen.getByRole("link", { name: "Submit research" })).toHaveAttribute("href", "/submit/research");
  });
});
