import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomeFeaturedLead, { type HomeFeaturedPost } from "./HomeFeaturedLead";

function featured(
  overrides: Partial<HomeFeaturedPost> = {}
): HomeFeaturedPost {
  return {
    id: "featured-1",
    title: "The pressure of wanting to have your life figured out early",
    slug: "pressure-of-figuring-life-out",
    excerpt:
      "A thoughtful reflection on ambition, uncertainty, and giving yourself room to grow.",
    type: "essay",
    content_kind: "article",
    article_format: null,
    cover_image_url: null,
    profiles: {
      username: "mofope",
      full_name: "Mofopefoluwa Idowu",
      university: "Lagos State University",
      avatar_url: null,
    },
    ...overrides,
  };
}

describe("HomeFeaturedLead", () => {
  it("gives a cover-led Editor's Pick a full-width editorial treatment", () => {
    const { container } = render(
      <HomeFeaturedLead
        post={featured({
          cover_image_url: "https://example.com/featured-cover.jpg",
        })}
      />
    );

    expect(
      container.querySelector('[data-featured-treatment="cover"]')
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "The pressure of wanting to have your life figured out early",
      }).parentElement
    ).toHaveClass("aspect-[16/10]", "sm:aspect-[2/1]");
    expect(screen.getByText("Mofopefoluwa Idowu")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read article →" })).toHaveAttribute(
      "href",
      "/post/pressure-of-figuring-life-out"
    );
  });

  it("uses a spacious text-led fallback instead of the old green block", () => {
    const { container } = render(<HomeFeaturedLead post={featured()} />);

    expect(
      container.querySelector('[data-featured-treatment="text"]')
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    expect(
      screen.getByRole("heading", {
        name: "The pressure of wanting to have your life figured out early",
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/Editor’s pick|Editor's pick/)).toBeInTheDocument();
  });
});
