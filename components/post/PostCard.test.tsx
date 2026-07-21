import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PostCard, { type PostCardData } from "@/components/post/PostCard";

function basePost(overrides: Partial<PostCardData> = {}): PostCardData {
  return {
    id: "post-1",
    title: null,
    slug: "my-post",
    excerpt: null,
    type: "blog",
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

    // No <h2> heading at all -- an empty <h2></h2> is exactly what we must not render.
    expect(container.querySelector("h2")).toBeNull();
    expect(screen.getByText("A quick thought worth sharing with everyone.")).toBeInTheDocument();
    expect(screen.getByText("Post")).toBeInTheDocument();
  });

  it("still shows the title for a legacy titled blog", () => {
    const post = basePost({
      type: "blog",
      title: "My old blog post",
      excerpt: "Some excerpt text.",
    });

    render(<PostCard post={post} />);

    expect(screen.getByRole("heading", { level: 2, name: "My old blog post" })).toBeInTheDocument();
    expect(screen.getByText("Some excerpt text.")).toBeInTheDocument();
  });

  it("shows the title for an article as before", () => {
    const post = basePost({
      type: "essay",
      title: "An Essay Worth Reading",
    });

    render(<PostCard post={post} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "An Essay Worth Reading" })
    ).toBeInTheDocument();
  });

  it("labels a brand-new generic Article as 'Article', not 'Essay', on the feed card", () => {
    const post = basePost({
      type: "essay",
      content_kind: "article",
      article_format: null,
      title: "A new generic article",
    });

    render(<PostCard post={post} />);

    expect(screen.getByText("Article")).toBeInTheDocument();
    expect(screen.queryByText("Essay")).not.toBeInTheDocument();
  });

  it("still labels a legacy Essay as 'Article · Essay' on the feed card", () => {
    const post = basePost({
      type: "essay",
      content_kind: "article",
      article_format: "essay",
      title: "A legacy essay",
    });

    render(<PostCard post={post} />);

    expect(screen.getByText("Article · Essay")).toBeInTheDocument();
  });

  it("does not show a Reviewed badge for a policy brief that hasn't actually completed review yet", () => {
    const post = basePost({
      type: "policy_brief",
      title: "A submitted policy brief",
      citation_id: null,
      published_version_id: null,
    });

    render(<PostCard post={post} />);

    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
  });

  it("shows Reviewed once a policy brief has an accepted published version, evidence-based", () => {
    const post = basePost({
      type: "policy_brief",
      title: "An accepted policy brief",
      citation_id: null,
      published_version_id: "11111111-1111-1111-1111-111111111111",
    });

    render(<PostCard post={post} />);

    expect(screen.getByText("Reviewed")).toBeInTheDocument();
  });

  it("shows Citable rather than Reviewed once a citation_id exists", () => {
    const post = basePost({
      type: "research",
      title: "A cited research paper",
      citation_id: "IND-2026-000123",
      published_version_id: "11111111-1111-1111-1111-111111111111",
    });

    render(<PostCard post={post} />);

    expect(screen.getByText("Citable")).toBeInTheDocument();
    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
  });
});
