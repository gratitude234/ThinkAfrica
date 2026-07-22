import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PostsFeedTabs from "./PostsFeedTabs";

vi.mock("@/components/post/PostFeed", () => ({
  default: () => <div data-testid="feed" />,
}));

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
