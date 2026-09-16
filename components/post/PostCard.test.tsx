import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PostCard, { type PostCardData } from "@/components/post/PostCard";

function basePost(overrides: Partial<PostCardData> = {}): PostCardData {
  return {
    id: "post-1",
    title: null,
    slug: "my-post",
    excerpt: null,
    content_kind: "post",
    tags: [],
    created_at: "2026-07-17T00:00:00.000Z",
    published_at: "2026-07-17T00:00:00.000Z",
    profiles: {
      username: "ada",
      full_name: "Ada Lovelace",
      university: null,
      avatar_url: null,
    },
    ...overrides,
  };
}

describe("PostCard", () => {
  it("renders a titleless lightweight post without an empty heading, leading with the body text", () => {
    const post = basePost({
      content_kind: "post",
      title: null,
      excerpt: "A quick thought worth sharing with everyone.",
    });

    const { container } = render(<PostCard post={post} />);

    // No <h2> heading at all: an empty <h2></h2> is exactly what we must not render.
    expect(container.querySelector("h2")).toBeNull();
    expect(screen.getByText("A quick thought worth sharing with everyone.")).toBeInTheDocument();
    expect(screen.getByText("Post")).toBeInTheDocument();
  });

  it("still shows the title for a titled Post, of which production has 40", () => {
    const post = basePost({
      content_kind: "post",
      title: "My old blog post",
      excerpt: "Some excerpt text.",
    });

    render(<PostCard post={post} />);

    expect(screen.getByRole("heading", { level: 2, name: "My old blog post" })).toBeInTheDocument();
    expect(screen.getByText("Some excerpt text.")).toBeInTheDocument();
    expect(screen.getByText("Post")).toBeInTheDocument();
  });

  it("shows the title for an Article", () => {
    const post = basePost({
      content_kind: "article",
      title: "An Essay Worth Reading",
    });

    render(<PostCard post={post} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "An Essay Worth Reading" })
    ).toBeInTheDocument();
    expect(screen.getByText("Article")).toBeInTheDocument();
  });

  it("labels an Article with no genre suffix", () => {
    const post = basePost({
      content_kind: "article",
      title: "A new generic article",
    });

    render(<PostCard post={post} />);

    expect(screen.getByText("Article")).toBeInTheDocument();
    expect(screen.queryByText(/Essay/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Policy Brief/)).not.toBeInTheDocument();
  });
});

describe("PostCard retired review and citation identity", () => {
  it("never shows Reviewed, Citable or a genre on any card", () => {
    render(
      <PostCard
        post={basePost({
          content_kind: "article",
          title: "A formerly accepted policy brief",
        })}
      />
    );

    for (const gone of ["Reviewed", "Citable", "Research", "Policy Brief", "Essay"]) {
      expect(screen.queryByText(new RegExp(gone)), gone).not.toBeInTheDocument();
    }
  });

  it("renders a legacy Research publication as an ordinary Article card", () => {
    // The five research rows were normalized into Articles by
    // 20260915000005, so what used to render nothing now renders the card the
    // piece has always deserved.
    render(
      <PostCard
        post={basePost({ content_kind: "article", title: "A cited research paper" })}
      />
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "A cited research paper" })
    ).toBeInTheDocument();
    expect(screen.getByText("Article")).toBeInTheDocument();
  });

  it("renders a card even when the classification cannot be read, rather than nothing", () => {
    // A reader who followed a link deserves the piece, not a blank.
    render(
      <PostCard post={basePost({ content_kind: null, title: "An unreadable kind" })} />
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "An unreadable kind" })
    ).toBeInTheDocument();
    expect(screen.getByText("Post")).toBeInTheDocument();
  });
});
