import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HomeFeedCard from "./HomeFeedCard";
import type { PostCardData } from "./PostCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/ui/GuestAuthGateProvider", () => ({
  useGuestAuthGate: () => ({ requestAuth: vi.fn() }),
}));

function post(overrides: Partial<PostCardData> = {}): PostCardData {
  return {
    id: "post-1",
    title: null,
    slug: "clear-thinking",
    excerpt: "A short thought about building better institutions.",
    type: "blog",
    content_kind: "post",
    article_format: null,
    tags: [],
    created_at: "2026-07-22T10:00:00.000Z",
    published_at: "2026-07-22T10:00:00.000Z",
    like_count: 3,
    profiles: {
      username: "amara",
      full_name: "Amara Okafor",
      university: "University of Lagos",
      avatar_url: null,
    },
    ...overrides,
  };
}

describe("HomeFeedCard", () => {
  it("renders a titleless Post as body-first content without a fabricated heading", () => {
    const { container } = render(<HomeFeedCard post={post()} currentUserId="user-1" />);

    expect(container.querySelector("h2")).toBeNull();
    expect(screen.getByText("A short thought about building better institutions.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "0 comments" })).toHaveAttribute(
      "href",
      "/post/clear-thinking#discussion"
    );
  });

  it("shows recency by default and lets contextual callers suppress it", () => {
    const published = { published_at: "2026-07-22T10:00:00.000Z" };
    const { unmount } = render(<HomeFeedCard post={post(published)} currentUserId="user-1" />);
    expect(screen.getByText(/\bago\b|just now/)).toBeInTheDocument();
    unmount();

    render(
      <HomeFeedCard post={post(published)} currentUserId="user-1" showTimestamp={false} />
    );
    expect(screen.queryByText(/\bago\b|just now/)).toBeNull();
  });

  it("names the writer, with no university line and no co-author count", () => {
    // Both were removed from feed cards in Phase 2F. A card identifies the
    // writer; the rest of who they are is on their profile.
    const withCredits = {
      ...post(),
      co_authors: [{ user_id: "author-2", profile: { username: "kwame", full_name: "Kwame" } }],
    } as PostCardData;
    render(<HomeFeedCard post={withCredits} currentUserId="user-1" />);

    expect(screen.getByRole("link", { name: "Amara Okafor" })).toHaveAttribute("href", "/amara");
    expect(screen.queryByText(/University of Lagos/)).toBeNull();
    expect(screen.queryByText(/\+ 1/)).toBeNull();
  });

  it("explains nothing about why the card is there", () => {
    const explained = {
      ...post(),
      surface_reason: "Matches your reading interests",
      quality_badges: [{ key: "source_backed", label: "Source-backed", tone: "emerald" }],
    } as PostCardData;
    render(<HomeFeedCard post={explained} currentUserId="user-1" />);

    expect(screen.queryByText("Matches your reading interests")).toBeNull();
    expect(screen.queryByText("Source-backed")).toBeNull();
  });

  it("counts comments only, and links to the comment thread", () => {
    render(<HomeFeedCard post={post({ comment_count: 3 })} currentUserId="user-1" />);

    const link = screen.getByRole("link", { name: "3 comments" });
    expect(link).toHaveAttribute("href", "/post/clear-thinking#discussion");
    expect(link).toHaveTextContent("3");
  });

  it("gives a post published as a response no Response identity", () => {
    // Responses are retired. A historic one still stores its parent, and the
    // card is an ordinary Post regardless.
    const historicResponse = { ...post(), in_response_to: "parent-1" } as ReturnType<typeof post>;
    render(<HomeFeedCard post={historicResponse} currentUserId="user-1" />);

    expect(screen.queryByText(/Responding to/)).toBeNull();
    expect(screen.queryByText(/Response/)).toBeNull();
  });

  // The chip renders its own '#', so a tag stored as "#africa" printed as
  // "##africa" and linked to a /topics page keyed on the hashed spelling.
  it("renders a stored tag with one hash and links to the unhashed topic", () => {
    render(
      <HomeFeedCard post={post({ tags: ["#africa", "Human Rights"] })} currentUserId="user-1" />
    );

    const link = screen.getByRole("link", { name: "#africa" });
    expect(link).toHaveAttribute("href", "/topics/africa");
    expect(screen.queryByText("##africa")).toBeNull();
    expect(screen.getByRole("link", { name: "#Human Rights" })).toHaveAttribute(
      "href",
      "/topics/Human%20Rights"
    );
  });

  it("renders Article identity and reading time, with no genre between them", () => {
    render(
      <HomeFeedCard
        post={post({
          title: "Why institutions outlast intentions",
          content_kind: "article",
          word_count: 1400,
        })}
        currentUserId="user-1"
      />
    );

    expect(
      screen.getByRole("heading", { name: "Why institutions outlast intentions" })
    ).toBeInTheDocument();
    expect(screen.getByText("Article")).toBeInTheDocument();
    expect(screen.getByText("7 min")).toBeInTheDocument();
    // The kicker used to read "Article · Policy Brief · 7 min".
    expect(screen.queryByText("Policy Brief")).not.toBeInTheDocument();
    expect(screen.queryByText("Essay")).not.toBeInTheDocument();
    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
  });

  // Regression: reading time was derived from `excerpt`, which is capped at
  // roughly thirty words, so ceil(words / 200) was always 1 and every card in
  // the feed reported "1 min" regardless of the article behind it.
  it("derives reading time from the body word count, not the excerpt", () => {
    const article = {
      title: "Why institutions outlast intentions",
      content_kind: "article",
      excerpt: "Six words is all this is.",
    };
    const { rerender } = render(
      <HomeFeedCard post={post({ ...article, word_count: 3000 })} currentUserId="user-1" />
    );

    expect(screen.getByText("15 min")).toBeInTheDocument();
    expect(screen.queryByText("1 min")).not.toBeInTheDocument();

    rerender(<HomeFeedCard post={post({ ...article, word_count: 240 })} currentUserId="user-1" />);

    expect(screen.getByText("2 min")).toBeInTheDocument();
  });

  it("omits the reading time rather than inventing one when no count is stored", () => {
    render(
      <HomeFeedCard
        post={post({
          title: "Why institutions outlast intentions",
          content_kind: "article",
          word_count: null,
        })}
        currentUserId="user-1"
      />
    );

    expect(screen.getByText("Article")).toBeInTheDocument();
    expect(screen.queryByText(/\bmin\b/)).not.toBeInTheDocument();
  });

  // Both layouts render the same way, and the cover is an illustration below
  // the text rather than a scrim the headline sits on.
  it("renders an Article the same way with a cover as without one", () => {
    const withCover = render(
      <HomeFeedCard
        post={post({
          title: "Why institutions outlast intentions",
          type: "essay",
          content_kind: "article",
          cover_image_url: "https://example.com/article-cover.jpg",
        })}
        currentUserId="user-1"
      />
    );

    const heading = screen.getByRole("heading", {
      name: "Why institutions outlast intentions",
    });
    expect(heading.closest("a")).toHaveAttribute("href", "/post/clear-thinking");
    expect(heading.closest("a")?.querySelector("img")).toBeNull();
    expect(heading).toHaveClass("text-ink");

    const cover = withCover.container.querySelector("img");
    expect(cover?.parentElement).toHaveClass("aspect-[16/9]");
    // Decorative: the headline link directly above already carries the
    // destination, so the cover is not a second tab stop to the same place.
    const coverLink = cover?.closest("a");
    expect(coverLink).toHaveAttribute("aria-hidden", "true");
    expect(coverLink).toHaveAttribute("tabindex", "-1");

    withCover.unmount();

    render(
      <HomeFeedCard
        post={post({
          title: "Why institutions outlast intentions",
          type: "essay",
          content_kind: "article",
        })}
        currentUserId="user-1"
      />
    );

    const bare = screen.getByRole("heading", {
      name: "Why institutions outlast intentions",
    });
    expect(bare).toHaveClass("text-ink");
    expect(bare.className).toBe(heading.className);
  });

  it("surfaces real publication topics as navigable discovery cues", () => {
    render(
      <HomeFeedCard
        post={post({ tags: ["Climate Policy", "Public Health", "Education"] })}
        currentUserId="user-1"
      />
    );

    expect(screen.getByRole("navigation", { name: "Publication topics" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "#Climate Policy" })).toHaveAttribute(
      "href",
      "/topics/Climate%20Policy"
    );
    expect(screen.getByRole("link", { name: "#Public Health" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "#Education" })).not.toBeInTheDocument();
  });
});

describe("HomeFeedCard legacy research", () => {
  it("renders a normalized research publication as an ordinary Article", () => {
    // 20260915000005 turned the five legacy research rows into Articles, so
    // what used to render nothing now renders the piece as what it is.
    render(
      <HomeFeedCard
        post={post({
          title: "A field study of public trust",
          content_kind: "article",
          word_count: 1400,
        })}
        currentUserId="user-1"
      />
    );

    expect(
      screen.getByRole("heading", { name: "A field study of public trust" })
    ).toBeInTheDocument();
    expect(screen.getByText("Article")).toBeInTheDocument();
    for (const gone of ["Research", "Citable", "Reviewed"]) {
      expect(screen.queryByText(gone), gone).not.toBeInTheDocument();
    }
  });

  it("falls back to the Post layout when the kind cannot be read", () => {
    render(
      <HomeFeedCard
        post={post({ title: "An unreadable kind", content_kind: null })}
        currentUserId="user-1"
      />
    );

    expect(screen.queryByText("Article")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "An unreadable kind" })
    ).toBeInTheDocument();
  });
});
