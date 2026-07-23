import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PostsFeedTabs from "./PostsFeedTabs";
import type { PostCardData } from "@/components/post/PostCard";

vi.mock("@/components/post/PostFeed", () => ({
  default: ({ posts }: { posts: PostCardData[] }) => (
    <div data-testid="feed">{posts.map((post) => post.id).join(",")}</div>
  ),
}));

// jsdom has no IntersectionObserver; the infinite-scroll sentinel only
// needs to construct one without throwing for these tests.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error -- test-only stub, not a spec-complete implementation.
global.IntersectionObserver = IntersectionObserverStub;

const common = {
  initialTab: "home" as const,
  initialType: "all" as const,
  initialTimeframe: "all" as const,
  initialPosts: [],
  initialHasMore: false,
  activeDebate: null,
  peopleSuggestions: [],
  peopleSuggestionReason: "",
  prioritizePeopleSuggestions: false,
};

describe("PostsFeedTabs", () => {
  it("shows For you, Following, and Latest to authenticated readers", () => {
    render(
      <PostsFeedTabs
        {...common}
        showFollowingTab
        currentUserId="user-1"
      />
    );

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "For you",
      "Following",
      "Latest",
    ]);
    expect(screen.getByRole("tab", { name: "For you" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("labels the public ranked feed Discover and omits Following for guests", () => {
    render(
      <PostsFeedTabs
        {...common}
        showFollowingTab={false}
        currentUserId={null}
      />
    );

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Discover",
      "Latest",
    ]);
  });

  it("canonicalizes a legacy content filter without dropping guest context", async () => {
    window.history.replaceState(null, "", "/?guest=1&type=policy_brief");
    render(
      <PostsFeedTabs
        {...common}
        initialType="article"
        showFollowingTab={false}
        currentUserId={null}
      />
    );

    await waitFor(() => {
      expect(window.location.search).toBe("?guest=1&type=article");
    });
  });
});

function feedPost(id: string): PostCardData {
  return {
    id,
    title: `Post ${id}`,
    slug: `post-${id}`,
    excerpt: "An excerpt.",
    type: "blog",
    content_kind: "post",
    tags: [],
    created_at: "2026-07-22T10:00:00.000Z",
    published_at: "2026-07-22T10:00:00.000Z",
    profiles: { username: id, full_name: `Author ${id}`, university: null, avatar_url: null },
  };
}

describe("PostsFeedTabs featured-lead deduplication", () => {
  const featuredPost = {
    id: "featured-1",
    title: "Editor's pick",
    slug: "editors-pick",
    excerpt: "An excerpt.",
    type: "blog",
    profiles: { username: "author", full_name: "Author", university: null, avatar_url: null },
  };

  it("does not render the featured lead's post a second time in the feed list below it", () => {
    render(
      <PostsFeedTabs
        {...common}
        initialPosts={[feedPost("featured-1"), feedPost("a"), feedPost("b")]}
        showFollowingTab={false}
        currentUserId={null}
        featuredPost={featuredPost}
      />
    );

    expect(screen.getByTestId("feed").textContent).toBe("a,b");
  });

  it("keeps the full feed list when there is no featured lead to deduplicate", () => {
    render(
      <PostsFeedTabs
        {...common}
        initialPosts={[feedPost("a"), feedPost("b")]}
        showFollowingTab={false}
        currentUserId={null}
        featuredPost={null}
      />
    );

    expect(screen.getByTestId("feed").textContent).toBe("a,b");
  });
});

describe("PostsFeedTabs caught-up state", () => {
  it("shows the quiet caught-up line once pagination is exhausted, without topic chips", () => {
    render(
      <PostsFeedTabs
        {...common}
        initialPosts={[feedPost("a"), feedPost("b")]}
        initialHasMore={false}
        showFollowingTab={false}
        currentUserId={null}
      />
    );

    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
    expect(screen.queryByText(/switch to Latest/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^\+ /})).not.toBeInTheDocument();
  });

  it("does not show the caught-up state while more pages remain", () => {
    render(
      <PostsFeedTabs
        {...common}
        initialPosts={[feedPost("a"), feedPost("b")]}
        initialHasMore
        showFollowingTab={false}
        currentUserId={null}
      />
    );

    expect(screen.queryByText("You're all caught up.")).not.toBeInTheDocument();
  });

  it("does not show the caught-up state for an initially empty feed", () => {
    render(
      <PostsFeedTabs
        {...common}
        initialPosts={[]}
        initialHasMore={false}
        showFollowingTab={false}
        currentUserId={null}
      />
    );

    expect(screen.queryByText("You're all caught up.")).not.toBeInTheDocument();
  });
});
