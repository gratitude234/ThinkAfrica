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
    expect(screen.getByRole("link", { name: "2 responses" })).toHaveAttribute(
      "href",
      "/post/clear-thinking#responses"
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

  it("renders Article identity with its optional genre as secondary metadata", () => {
    render(
      <HomeFeedCard
        post={post({
          title: "Why institutions outlast intentions",
          type: "essay",
          content_kind: "article",
          article_format: "policy_brief",
        })}
        currentUserId="user-1"
        surface="latest"
      />
    );

    expect(screen.getByRole("heading", { name: "Why institutions outlast intentions" })).toBeInTheDocument();
    expect(screen.getByText(/Article · Policy Brief/)).toBeInTheDocument();
    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
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
    expect(screen.queryByRole("link", { name: /responses/ })).not.toBeInTheDocument();
    // The dashboard-like tinted/bordered PDF sub-card is gone -- the
    // manuscript row is a plain, borderless metadata line.
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
