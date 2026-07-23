import type { AnchorHTMLAttributes, ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PostsFeedTabs from "./PostsFeedTabs";
import type { PostCardData } from "@/components/post/PostCard";

const mocks = vi.hoisted(() => ({ requestAuth: vi.fn() }));

vi.mock("@/components/post/PostFeed", () => ({
  default: () => <div data-testid="feed" />,
}));

vi.mock("@/components/ui/GuestAuthGateProvider", () => ({
  useGuestAuthGate: () => ({ requestAuth: mocks.requestAuth }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) => (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    observerInstances.push(this);
  }
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}
let observerInstances: MockIntersectionObserver[] = [];

function post(id: string): PostCardData {
  return {
    id,
    title: null,
    slug: `post-${id}`,
    excerpt: "A short thought.",
    type: "blog",
    content_kind: "post",
    article_format: null,
    tags: [],
    created_at: "2026-07-22T10:00:00.000Z",
    published_at: "2026-07-22T10:00:00.000Z",
    like_count: 0,
    response_count: 0,
    profiles: { username: "amara", full_name: "Amara", university: null, avatar_url: null },
  };
}

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
  beforeEach(() => {
    mocks.requestAuth.mockReset();
    observerInstances = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

describe("PostsFeedTabs -- loading state", () => {
  beforeEach(() => {
    mocks.requestAuth.mockReset();
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a mixed post/article/research skeleton (not the feed) while switching to an uncached tab", async () => {
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending)
    );

    render(<PostsFeedTabs {...common} showFollowingTab currentUserId="user-1" />);

    fireEvent.click(screen.getByRole("tab", { name: "Latest" }));

    // The skeleton renders instead of the (mocked) feed while the fetch is in flight.
    expect(screen.queryByTestId("feed")).not.toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      resolveFetch(
        new Response(JSON.stringify({ posts: [], hasMore: false }), { status: 200 })
      );
      await pending;
    });
  });
});

describe("PostsFeedTabs -- empty states", () => {
  beforeEach(() => {
    mocks.requestAuth.mockReset();
  });

  it("shows the default empty state with a Create CTA that gates a guest", () => {
    render(<PostsFeedTabs {...common} showFollowingTab={false} currentUserId={null} />);

    expect(screen.getByText("No content yet.")).toBeInTheDocument();
    expect(
      screen.getByText("Be the first to share your ideas with Africa.")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(mocks.requestAuth).toHaveBeenCalledWith("create");
  });

  it("opens the real Create chooser directly for an authenticated viewer", () => {
    render(<PostsFeedTabs {...common} showFollowingTab currentUserId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(mocks.requestAuth).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Create" })).toBeInTheDocument();
  });

  it("shows the Following-specific empty state with an Explore writers CTA", () => {
    render(
      <PostsFeedTabs
        {...common}
        initialTab="following"
        showFollowingTab
        currentUserId="user-1"
      />
    );

    expect(screen.getByText("No posts from writers you follow yet.")).toBeInTheDocument();
    expect(
      screen.getByText("Follow writers to build a feed around the ideas you care about.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore writers" })).toHaveAttribute(
      "href",
      "/onboarding?step=follow"
    );
  });

  it("shows a content-kind-aware filtered empty state with a View all reset that preserves the tab", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const params = new URL(url, "http://localhost").searchParams;
        expect(params.get("tab")).toBe("latest");
        expect(params.get("type")).toBeNull();
        return new Response(
          JSON.stringify({ posts: [post("1")], hasMore: false }),
          { status: 200 }
        );
      })
    );

    render(
      <PostsFeedTabs
        {...common}
        initialTab="latest"
        initialType="article"
        showFollowingTab
        currentUserId="user-1"
      />
    );

    expect(screen.getByText("No Articles here yet.")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Latest", selected: true })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "View all" }));
    });

    await waitFor(() => expect(screen.getByTestId("feed")).toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Latest", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");

    vi.unstubAllGlobals();
  });
});

describe("PostsFeedTabs -- error and retry states", () => {
  beforeEach(() => {
    mocks.requestAuth.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the initial-failure state and recovers on a successful retry, refetching the current tab", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("fail", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ posts: [post("1")], hasMore: false }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<PostsFeedTabs {...common} showFollowingTab currentUserId="user-1" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Latest" }));
    });

    await waitFor(() =>
      expect(screen.getByText("Couldn't load your feed")).toBeInTheDocument()
    );
    expect(
      screen.getByText("Check your connection and try again.")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("feed")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    await waitFor(() => expect(screen.getByTestId("feed")).toBeInTheDocument());
    expect(screen.queryByText("Couldn't load your feed")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps already-loaded content visible on a pagination failure and retries only the next page", async () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("fail", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ posts: [post("2")], hasMore: false }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PostsFeedTabs
        {...common}
        initialPosts={[post("1")]}
        initialHasMore
        showFollowingTab
        currentUserId="user-1"
      />
    );

    expect(screen.getByTestId("feed")).toBeInTheDocument();
    const observer = observerInstances[observerInstances.length - 1];

    await act(async () => {
      observer.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver
      );
    });

    await waitFor(() => expect(screen.getByText("Couldn't load more.")).toBeInTheDocument());
    // Existing content is untouched -- the mocked feed is still rendered.
    expect(screen.getByTestId("feed")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    await waitFor(() =>
      expect(screen.queryByText("Couldn't load more.")).not.toBeInTheDocument()
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Both calls were page requests for the same tab/filter -- the retry
    // targeted the failed next page, not a full reload from page 1.
    const secondCallUrl = fetchMock.mock.calls[1][0] as string;
    expect(new URL(secondCallUrl, "http://localhost").searchParams.get("page")).toBe("2");
  });
});
