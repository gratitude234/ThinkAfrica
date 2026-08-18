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
    response_count: 2,
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
    const { container } = render(
      <HomeFeedCard post={post()} currentUserId="user-1" surface="home" />
    );

    expect(container.querySelector("h2")).toBeNull();
    expect(screen.getByText("A short thought about building better institutions.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2 in this discussion" })).toHaveAttribute(
      "href",
      "/post/clear-thinking#discussion"
    );
  });

  it("labels a response card with the parent it is responding to", () => {
    render(
      <HomeFeedCard
        post={post({ in_response_to: "parent-1" })}
        currentUserId="user-1"
        surface="latest"
        respondingTo={{ title: "The Lecture Hall Still Wins", author: "Ada Obi" }}
      />
    );

    expect(screen.getByText("The Lecture Hall Still Wins")).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent ===
          "Responding to The Lecture Hall Still Wins by Ada Obi"
      )
    ).toBeInTheDocument();
  });

  it("derives real parent context from hydrated feed data when no explicit prop is passed", () => {
    render(
      <HomeFeedCard
        post={post({
          in_response_to: "parent-1",
          response_to: {
            slug: "the-lecture-hall-still-wins",
            title: "The Lecture Hall Still Wins",
            content_kind: "post",
            type: "blog",
            profiles: { username: "ada-obi", full_name: "Ada Obi" },
          },
        })}
        currentUserId="user-1"
        surface="latest"
      />
    );

    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent ===
          "Responding to The Lecture Hall Still Wins by Ada Obi"
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "The Lecture Hall Still Wins" })).toHaveAttribute(
      "href",
      "/post/the-lecture-hall-still-wins"
    );
    expect(screen.getByRole("link", { name: "Ada Obi" })).toHaveAttribute("href", "/ada-obi");
  });

  it("names a titleless parent once, not once in the title and again as the author", () => {
    render(
      <HomeFeedCard
        post={post({
          in_response_to: "parent-2",
          response_to: {
            slug: "quiet-thought",
            title: null,
            content_kind: "post",
            type: "blog",
            profiles: { username: "isacc", full_name: "Isacc Newton" },
          },
        })}
        currentUserId="user-1"
        surface="latest"
      />
    );

    // The metadata fallback is already "Post by Isacc Newton"; appending the
    // author again produced "Post by Isacc Newton by Isacc Newton".
    expect(
      screen.getByText(
        (_, element) => element?.textContent === "Responding to Post by Isacc Newton"
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Isacc Newton by Isacc Newton/)).toBeNull();
  });

  it("falls back to a safe metadata title for a response to a titleless parent Post", () => {
    render(
      <HomeFeedCard
        post={post({
          in_response_to: "parent-2",
          response_to: {
            slug: "quiet-thought",
            title: null,
            content_kind: "post",
            type: "blog",
            profiles: { username: "kwame-b", full_name: "Kwame Boateng" },
          },
        })}
        currentUserId="user-1"
        surface="latest"
      />
    );

    expect(screen.getByRole("link", { name: "Post by Kwame Boateng" })).toHaveAttribute(
      "href",
      "/post/quiet-thought"
    );
  });

  it("falls back to a generic line when the parent can't be resolved", () => {
    render(
      <HomeFeedCard
        post={post({ in_response_to: "parent-3", response_to: null })}
        currentUserId="user-1"
        surface="latest"
      />
    );

    expect(screen.getByText(/Responding to another publication/)).toBeInTheDocument();
  });

  it("shows recency by default and lets contextual callers suppress it", () => {
    const published = { published_at: "2026-07-22T10:00:00.000Z" };
    const { unmount } = render(
      <HomeFeedCard post={post(published)} currentUserId="user-1" surface="home" />
    );
    expect(screen.getByText(/\bago\b|just now/)).toBeInTheDocument();
    unmount();

    render(
      <HomeFeedCard
        post={post(published)}
        currentUserId="user-1"
        surface="latest"
        showTimestamp={false}
      />
    );
    // \b matters: the fixture's "University of Lagos" contains "ago".
    expect(screen.queryByText(/\bago\b|just now/)).toBeNull();
  });

  it("drops the responding-to line where the parent is already the context", () => {
    render(
      <HomeFeedCard
        post={post({ in_response_to: "parent-1", response_to: null })}
        currentUserId="user-1"
        surface="latest"
        hideRespondingTo
      />
    );

    expect(screen.queryByText(/Responding to/)).toBeNull();
  });

  it("counts comments and responses together, and links to the comment thread", () => {
    render(
      <HomeFeedCard
        post={post({ response_count: 2, comment_count: 3 })}
        currentUserId="user-1"
        surface="home"
      />
    );

    const link = screen.getByRole("link", { name: "5 in this discussion" });
    expect(link).toHaveAttribute("href", "/post/clear-thinking#discussion");
    expect(link).toHaveTextContent("5");
  });

  it("gives Research a discussion count too, now that it has a comment thread", () => {
    render(
      <HomeFeedCard
        post={post({
          title: "A field study of public trust",
          type: "research",
          content_kind: "research",
          response_count: 0,
          comment_count: 4,
        })}
        currentUserId="user-1"
        surface="home"
      />
    );

    expect(screen.getByRole("link", { name: "4 in this discussion" })).toBeInTheDocument();
  });

  // The chip renders its own '#', so a tag stored as "#africa" printed as
  // "##africa" and linked to a /topics page keyed on the hashed spelling.
  it("renders a stored tag with one hash and links to the unhashed topic", () => {
    render(
      <HomeFeedCard
        post={post({ tags: ["#africa", "Human Rights"] })}
        currentUserId="user-1"
        surface="home"
      />
    );

    const link = screen.getByRole("link", { name: "#africa" });
    expect(link).toHaveAttribute("href", "/topics/africa");
    expect(screen.queryByText("##africa")).toBeNull();
    expect(screen.getByRole("link", { name: "#Human Rights" })).toHaveAttribute(
      "href",
      "/topics/Human%20Rights"
    );
  });

  it("renders Article identity with its optional genre as secondary metadata", () => {
    render(
      <HomeFeedCard
        post={post({
          title: "Why institutions outlast intentions",
          type: "essay",
          content_kind: "article",
          article_format: "policy_brief",
          word_count: 1400,
        })}
        currentUserId="user-1"
        surface="latest"
      />
    );

    expect(screen.getByRole("heading", { name: "Why institutions outlast intentions" })).toBeInTheDocument();
    expect(screen.getByText("Article")).toBeInTheDocument();
    expect(screen.getByText("Policy Brief")).toBeInTheDocument();
    expect(screen.getByText("7 min")).toBeInTheDocument();
    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
  });

  // Regression: reading time was derived from `excerpt`, which is capped at
  // roughly thirty words, so ceil(words / 200) was always 1 and every card in
  // the feed reported "1 min" regardless of the article behind it.
  it("derives reading time from the body word count, not the excerpt", () => {
    const { rerender } = render(
      <HomeFeedCard
        post={post({
          title: "Why institutions outlast intentions",
          content_kind: "article",
          excerpt: "Six words is all this is.",
          word_count: 3000,
        })}
        currentUserId="user-1"
        surface="latest"
      />
    );

    expect(screen.getByText("15 min")).toBeInTheDocument();
    expect(screen.queryByText("1 min")).not.toBeInTheDocument();

    rerender(
      <HomeFeedCard
        post={post({
          title: "Why institutions outlast intentions",
          content_kind: "article",
          excerpt: "Six words is all this is.",
          word_count: 240,
        })}
        currentUserId="user-1"
        surface="latest"
      />
    );

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
        surface="latest"
      />
    );

    expect(screen.getByText("Article")).toBeInTheDocument();
    expect(screen.queryByText(/\bmin\b/)).not.toBeInTheDocument();
  });

  // An Article with a cover used to print its headline *over* the image under
  // a fixed dark gradient, while a cover-less one printed it as ordinary text.
  // Two layouts alternating down one column, and the overlay was the half that
  // read worse: one scrim over photographs it knows nothing about, and a
  // line-clamp that truncated real headlines mid-phrase. Both now render the
  // same way, and the cover is an illustration below the text.
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
        surface="home"
      />
    );

    const heading = screen.getByRole("heading", {
      name: "Why institutions outlast intentions",
    });
    expect(heading.closest("a")).toHaveAttribute("href", "/post/clear-thinking");
    // The headline is card text, not a layer inside the image link.
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
        surface="home"
      />
    );

    const bare = screen.getByRole("heading", {
      name: "Why institutions outlast intentions",
    });
    expect(bare).toHaveClass("text-ink");
    expect(bare.className).toBe(heading.className);
  });

  it("uses a contained paper-shaped preview for Research covers", () => {
    render(
      <HomeFeedCard
        post={post({
          title: "A field study of public trust",
          type: "research",
          content_kind: "research",
          cover_image_url: "https://example.com/research-cover.jpg",
        })}
        currentUserId="user-1"
        surface="home"
      />
    );

    const image = screen.getByRole("img", {
      name: "A field study of public trust",
    });
    expect(image.parentElement).toHaveClass("aspect-[3/4]");
    expect(image).toHaveClass("object-contain");
  });

  it("surfaces real publication topics as navigable discovery cues", () => {
    render(
      <HomeFeedCard
        post={post({ tags: ["Climate Policy", "Public Health", "Education"] })}
        currentUserId="user-1"
        surface="home"
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

  it("shows at most the strongest evidence-based Research badge", () => {
    const { container } = render(
      <HomeFeedCard
        post={post({
          title: "A field study of public trust",
          type: "research",
          content_kind: "research",
          citation_id: "IND-2026-0012",
          published_version_id: "version-1",
          document_original_name: "field-study-of-public-trust.pdf",
          document_mime_type: "application/pdf",
          document_size_bytes: 2_516_582,
        })}
        currentUserId="user-1"
        surface="home"
      />
    );

    expect(screen.getByText("Research")).toBeInTheDocument();
    expect(screen.getByText("Citable")).toBeInTheDocument();
    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
    expect(screen.getByText(/PDF manuscript · 2\.4 MB/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View paper" })).toHaveAttribute(
      "href",
      "/post/clear-thinking"
    );
    // Research used to suppress the discussion metric entirely; it has a
    // comment thread now, so it carries the same count as everything else.
    expect(screen.getByRole("link", { name: "2 in this discussion" })).toBeInTheDocument();
    // Evidence status remains honest and the document row stays lightweight.
    expect(container.querySelector('[class*="bg-purple-tint"]')).toBeNull();
    expect(screen.queryByText(/pages/)).not.toBeInTheDocument();
  });

  it("omits the manuscript action instead of linking to a missing document", () => {
    render(
      <HomeFeedCard
        post={post({
          title: "A field study of public trust",
          type: "research",
          content_kind: "research",
        })}
        currentUserId="user-1"
        surface="home"
      />
    );

    expect(screen.queryByRole("link", { name: "View paper" })).not.toBeInTheDocument();
    expect(screen.queryByText(/PDF manuscript/)).not.toBeInTheDocument();
    // Still reachable via the title link even without a document.
    expect(screen.getByRole("heading", { name: "A field study of public trust" })).toBeInTheDocument();
  });

  it("lists Research co-authors on a separate 'with' line under the lead author", () => {
    render(
      <HomeFeedCard
        post={post({
          title: "A field study of public trust",
          type: "research",
          content_kind: "research",
          co_authors: [
            { profile: { username: "kwame-b", full_name: "Kwame Boateng" } },
            { profile: { username: "ama-s", full_name: null } },
          ] as PostCardData["co_authors"],
        })}
        currentUserId="user-1"
        surface="home"
      />
    );

    expect(screen.getByText("Amara Okafor")).toBeInTheDocument();
    expect(screen.getByText("with Kwame Boateng, ama-s")).toBeInTheDocument();
  });

  it("does not fabricate a Reviewed badge for unreviewed Research", () => {
    render(
      <HomeFeedCard
        post={post({
          title: "An early-stage working paper",
          type: "research",
          content_kind: "research",
          citation_id: null,
          published_version_id: null,
        })}
        currentUserId="user-1"
        surface="home"
      />
    );

    expect(screen.queryByText("Citable")).not.toBeInTheDocument();
    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
  });
});
