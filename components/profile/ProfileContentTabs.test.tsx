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
  it("separates enabled content and omits Research records", () => {
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
    expect(screen.queryByRole("tab", { name: /Research/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "A field study" })).not.toBeInTheDocument();
  });

  it("shows the matching creation action in an owner's empty tab", () => {
    render(<ProfileContentTabs items={[]} isOwnProfile />);
    expect(
      screen.getByRole("link", { name: "Add your first contribution" })
    ).toHaveAttribute("href", "/create/post");
    fireEvent.click(screen.getByRole("tab", { name: /Posts/ }));
    expect(screen.getByRole("link", { name: "Write a post" })).toHaveAttribute("href", "/create/post");
    expect(screen.queryByRole("tab", { name: /Research/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Submit research" })).not.toBeInTheDocument();
  });

  it("shows responses and debates inside the unified record with factual quality labels", () => {
    render(
      <ProfileContentTabs
        isOwnProfile={false}
        items={[
          item({
            id: "response",
            slug: "response",
            in_response_to: "parent",
            reference_count: 2,
          }),
        ]}
        debateContributions={[
          {
            id: "argument-1",
            content: "A public argument grounded in the motion.",
            stance: "for",
            upvotes: 3,
            round_number: 1,
            created_at: "2026-07-23T10:00:00.000Z",
            debates: { id: "debate-1", title: "The public motion" },
          },
        ]}
      />
    );

    expect(screen.getByText("Source-backed")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The public motion" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Responses/ }));
    expect(screen.getByText("Response")).toBeInTheDocument();
  });
});
