import type { AnchorHTMLAttributes, ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PostsFeedTabs from "./PostsFeedTabs";
import type { PostCardData } from "@/components/post/PostCard";

const mocks = vi.hoisted(() => ({
  requestAuth: vi.fn(),
  push: vi.fn(),
  trackActivationEvent: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/components/post/PostFeed", () => ({
  default: ({ posts }: { posts: PostCardData[] }) => (
    <div data-testid="feed">{posts.map((post) => post.id).join(",")}</div>
  ),
}));

vi.mock("@/components/ui/GuestAuthGateProvider", () => ({
  useGuestAuthGate: () => ({ requestAuth: mocks.requestAuth }),
}));

vi.mock("@/lib/activationEvents", () => ({
  trackActivationEvent: mocks.trackActivationEvent,
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
  options?: IntersectionObserverInit;
  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit
  ) {
    this.callback = callback;
    this.options = options;
    observerInstances.push(this);
  }
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}
let observerInstances: MockIntersectionObserver[] = [];

// The component runs two observers: infinite scroll (rootMargin "400px 0px")
// and the pinned-state watcher on the feed-top marker (a negative top margin
// matching the nav height). Select by rootMargin rather than by position --
// picking "the last one" silently swapped which observer a test drove when the
// second was added.
//
// Take the *newest* match: the infinite-scroll effect re-runs on tab/filter
// changes and registers a fresh observer each time, so the earliest match is
// usually a disconnected one that will never fire.
function observerMatching(label: string, predicate: (rootMargin: string) => boolean) {
  const matches = observerInstances.filter((instance) =>
    predicate(instance.options?.rootMargin ?? "")
  );
  const observer = matches[matches.length - 1];
  if (!observer) {
    throw new Error(
      `No ${label} IntersectionObserver. Saw rootMargins: ` +
        `${observerInstances.map((i) => i.options?.rootMargin).join(", ") || "none"}`
    );
  }
  return observer;
}

const infiniteScrollObserver = () =>
  observerMatching("infinite-scroll", (m) => m.startsWith("400px"));
const pinnedStateObserver = () =>
  observerMatching("pinned-state", (m) => m.startsWith("-"));

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
    mocks.push.mockReset();
    mocks.trackActivationEvent.mockReset();
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

  it("shows the dedicated Topics tab only when topic subscriptions are enabled", () => {
    render(
      <PostsFeedTabs
        {...common}
        showFollowingTab
        showTopicsTab
        currentUserId="user-1"
      />
    );

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "For you",
      "Following",
      "Topics",
      "Latest",
    ]);
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

  it("treats a featured-only result as content without rendering an empty list", () => {
    render(
      <PostsFeedTabs
        {...common}
        initialPosts={[feedPost("featured-1")]}
        showFollowingTab={false}
        currentUserId={null}
        featuredPost={{ ...featuredPost, featured_provenance: "editorial" }}
      />
    );

    expect(screen.queryByTestId("feed")).not.toBeInTheDocument();
    expect(screen.queryByText("No posts match this view yet.")).not.toBeInTheDocument();
    expect(screen.getByText(/Editor’s pick/)).toBeInTheDocument();
  });
});

describe("PostsFeedTabs caught-up state", () => {
  // Only needed for the "more pages remain" case below, which sets
  // initialHasMore -- that's what makes the sentinel effect construct an
  // IntersectionObserver, which jsdom doesn't provide natively.
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

describe("PostsFeedTabs -- loading state", () => {
  beforeEach(() => {
    mocks.requestAuth.mockReset();
    mocks.trackActivationEvent.mockReset();
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

    expect(mocks.trackActivationEvent).toHaveBeenCalledWith({
      event: "home_tab_changed",
      metadata: expect.objectContaining({
        fromTab: "home",
        toTab: "latest",
        feedSessionId: expect.any(String),
      }),
    });

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
    mocks.push.mockReset();
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

  it("navigates an authenticated viewer straight to the Post composer", () => {
    render(<PostsFeedTabs {...common} showFollowingTab currentUserId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(mocks.requestAuth).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/create/post");
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

  it("shows the Topics-specific empty state with an Explore topics CTA", () => {
    render(
      <PostsFeedTabs
        {...common}
        initialTab="topics"
        showFollowingTab
        showTopicsTab
        currentUserId="user-1"
      />
    );

    expect(
      screen.getByText("No posts from your subscribed topics yet.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore topics" })).toHaveAttribute(
      "href",
      "/topics"
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
    // The reset used to be asserted via the "All" chip's aria-pressed state.
    // Content-kind filtering now lives on Explore, so there is no chip on this
    // surface to read it from -- but the behaviour under test is unchanged and
    // still observable two ways: the fetch mock above asserts the refetch
    // carries no `type` param, and the filtered empty state is gone.
    expect(screen.queryByText("No Articles here yet.")).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});

describe("PostsFeedTabs -- scroll position on tab switch", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ posts: [post("1")], hasMore: false }), {
            status: 200,
          })
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns a reader who is scrolled into the feed back to the top of it", async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    render(<PostsFeedTabs {...common} showFollowingTab currentUserId="user-1" />);

    // jsdom reports every rect as zero, so stand in for "the feed controls
    // have scrolled 2400px above the viewport".
    vi.stubGlobal("scrollY", 2400);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: -2400,
    } as DOMRect);

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Latest" }));
    });

    // "instant", not "auto". globals.css sets `scroll-behavior: smooth` on
    // html, and per CSSOM View "auto" defers to that, so asking for "auto"
    // here animated the reader all the way back up through the cards they had
    // just left. This assertion is the guard against that regressing.
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
  });

  it("leaves the viewport alone when the feed controls are already in view", async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    render(<PostsFeedTabs {...common} showFollowingTab currentUserId="user-1" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Latest" }));
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe("PostsFeedTabs -- pagination overlap", () => {
  beforeEach(() => {
    mocks.requestAuth.mockReset();
    observerInstances = [];
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function paginate() {
    const observer = infiniteScrollObserver();
    await act(async () => {
      observer.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver
      );
    });
  }

  it("uses the server cursor when loading more chronological posts", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ posts: [], hasMore: false }), {
          status: 200,
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PostsFeedTabs
        {...common}
        initialTab="latest"
        initialPosts={[post("1")]}
        initialHasMore
        initialNextCursor="opaque-cursor"
        showFollowingTab
        currentUserId="user-1"
      />
    );

    await paginate();

    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(new URL(requestUrl, "http://localhost").searchParams.get("cursor")).toBe(
      "opaque-cursor"
    );
  });

  it("appends only posts the reader does not already have", async () => {
    // Every date-ordered tab pages by offset, so one post published between the
    // two requests slides the window and re-serves post 2 as the head of page 2.
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ posts: [post("2"), post("3")], hasMore: false }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PostsFeedTabs
        {...common}
        initialPosts={[post("1"), post("2")]}
        initialHasMore
        showFollowingTab
        currentUserId="user-1"
      />
    );

    await paginate();

    await waitFor(() =>
      expect(screen.getByTestId("feed")).toHaveTextContent("1,2,3")
    );
  });

  it("stops paging after three pages that add nothing new", async () => {
    // A backend that keeps promising more while handing back cards the reader
    // already has would otherwise re-arm the sentinel forever.
    // A fresh Response per call: a body can only be read once, so a shared
    // instance would fail every page after the first for the wrong reason.
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ posts: [post("1")], hasMore: true }), {
          status: 200,
        })
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

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await paginate();
    }

    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Nothing is watching the sentinel any more: the last observer was torn
    // down and the effect declined to register a replacement, so there is no
    // longer anything that can re-arm the loop.
    expect(infiniteScrollObserver().disconnect).toHaveBeenCalled();
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
  });
});

describe("PostsFeedTabs -- error and retry states", () => {
  beforeEach(() => {
    mocks.requestAuth.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a server-render failure as a retryable feed error", () => {
    render(
      <PostsFeedTabs
        {...common}
        initialLoadFailed
        showFollowingTab
        currentUserId="user-1"
      />
    );

    expect(screen.getByText("Couldn't load your feed")).toBeInTheDocument();
    expect(screen.queryByText("No content yet.")).not.toBeInTheDocument();
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
    const observer = infiniteScrollObserver();

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

  it("clears a rejected cursor before retrying the same chronological page", async () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: "INVALID_CURSOR", message: "expired" },
          }),
          { status: 400 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ posts: [post("2")], hasMore: false }), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PostsFeedTabs
        {...common}
        initialTab="latest"
        initialPosts={[post("1")]}
        initialHasMore
        initialNextCursor="rejected-cursor"
        showFollowingTab
        currentUserId="user-1"
      />
    );

    await act(async () => {
      infiniteScrollObserver().callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        infiniteScrollObserver() as unknown as IntersectionObserver
      );
    });
    await waitFor(() =>
      expect(screen.getByText("Couldn't load more.")).toBeInTheDocument()
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    const firstUrl = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    const retryUrl = new URL(String(fetchMock.mock.calls[1][0]), "http://localhost");
    expect(firstUrl.searchParams.get("cursor")).toBe("rejected-cursor");
    expect(retryUrl.searchParams.has("cursor")).toBe(false);
    expect(retryUrl.searchParams.get("page")).toBe("2");
  });

  it("does not leak an old tab's pagination failure into the new tab", async () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    let resolveOldPage!: (response: Response) => void;
    const oldPage = new Promise<Response>((resolve) => {
      resolveOldPage = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => oldPage)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ posts: [post("latest")], hasMore: false }), {
          status: 200,
        })
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

    await act(async () => {
      infiniteScrollObserver().callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        infiniteScrollObserver() as unknown as IntersectionObserver
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Latest" }));
    });
    await act(async () => {
      resolveOldPage(new Response("failed", { status: 500 }));
      await oldPage;
    });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Latest", selected: true })).toBeInTheDocument()
    );
    expect(screen.queryByText("Couldn't load more.")).not.toBeInTheDocument();
  });
});

// jsdom has no layout engine and never actually pins a sticky element, so the
// pinned state is driven through the observer directly and asserted on classes.
describe("PostsFeedTabs -- pinned control strip", () => {
  beforeEach(() => {
    mocks.requestAuth.mockReset();
    observerInstances = [];
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stickyStrip(container: HTMLElement) {
    const strip = container.querySelector<HTMLElement>("[data-app-context-nav]");
    if (!strip) throw new Error("sticky control strip not found");
    return strip;
  }

  function expandedControls(container: HTMLElement) {
    const controls = container.querySelector<HTMLElement>(
      "[data-app-context-expanded]"
    );
    if (!controls) throw new Error("expanded feed controls not found");
    return controls;
  }

  function setPinned(isPinned: boolean) {
    const observer = pinnedStateObserver();
    act(() => {
      observer.callback(
        [{ isIntersecting: !isPinned } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver
      );
    });
  }

  it("shows no bottom edge while the page is at rest", () => {
    const { container } = render(
      <PostsFeedTabs {...common} showFollowingTab currentUserId="user-1" />
    );

    const controls = expandedControls(container);
    expect(controls).toHaveClass("border-transparent");
    expect(controls.className).not.toMatch(/shadow-/);
  });

  it("gains a hairline and shadow once pinned, and drops them again at the top", () => {
    const { container } = render(
      <PostsFeedTabs {...common} showFollowingTab currentUserId="user-1" />
    );

    setPinned(true);
    const controls = expandedControls(container);
    expect(controls).toHaveClass("border-divider");
    expect(controls.className).toMatch(/shadow-/);
    expect(controls).not.toHaveClass("border-transparent");

    setPinned(false);
    expect(expandedControls(container)).toHaveClass("border-transparent");
    expect(expandedControls(container).className).not.toMatch(/shadow-/);
  });

  // The border sits in the box at both states so pinning cannot reflow content.
  it("keeps the border in the box in both states", () => {
    const { container } = render(
      <PostsFeedTabs {...common} showFollowingTab currentUserId="user-1" />
    );

    expect(expandedControls(container)).toHaveClass("border-b");
    setPinned(true);
    expect(expandedControls(container)).toHaveClass("border-b");
  });

  // The offset itself is the shared rule's job. What has to hold here is that
  // the strip never pins itself: a local `sticky top-...` would freeze the
  // offset at the nav's expanded height and reopen the hole under the strip.
  it("defers pinning to the shared chrome rule", () => {
    const { container } = render(
      <PostsFeedTabs {...common} showFollowingTab currentUserId="user-1" />
    );

    expect(stickyStrip(container)).toHaveAttribute("data-app-context-nav");
    expect(stickyStrip(container)).toHaveAttribute("data-app-chrome-motion");
    expect(stickyStrip(container)).not.toHaveClass("sticky");
  });

  // The wrapper spans the viewport but paints nothing and pads nothing: each
  // row carries its own full-bleed background, so the filter row can collapse
  // away without leaving a white band, and cards passing beneath the strip
  // have no transparent gutter to ghost through.
  it("keeps the strip transparent and paints each row full-bleed", () => {
    const { container } = render(
      <PostsFeedTabs {...common} showFollowingTab currentUserId="user-1" />
    );

    // `bg-card` is the theme-aware token that replaced the literal `bg-white`;
    // the guarantee under test is unchanged -- each row paints its own opaque
    // ground so cards cannot ghost through it, and the wrapper paints none.
    expect(stickyStrip(container)).not.toHaveClass("bg-card");
    expect(stickyStrip(container)).not.toHaveClass("px-4");
    expect(container.querySelector("[data-app-context-primary]")).toHaveClass(
      "bg-card",
      "px-4"
    );
    expect(expandedControls(container)).toHaveClass("bg-card");
  });

  // The collapsing row has to be able to reach zero height: padding on the
  // clipped row itself would floor it at the padding, leaving a band of bare
  // canvas under the pinned tabs.
  it("keeps the collapsing row's padding off the clipped box", () => {
    const { container } = render(
      <PostsFeedTabs {...common} showFollowingTab currentUserId="user-1" />
    );

    const controls = expandedControls(container);
    expect(controls).not.toHaveClass("px-4");
    expect(controls).not.toHaveClass("pb-1");
    expect(controls.firstElementChild).not.toHaveClass("px-4");
    expect(controls.firstElementChild?.firstElementChild).toHaveClass(
      "px-4",
      "pb-1"
    );
  });

  it("keeps tabs interactive while marking filters as expanded-only", () => {
    const { container } = render(
      <PostsFeedTabs {...common} showFollowingTab currentUserId="user-1" />
    );

    expect(container.querySelector("[data-app-context-primary]")).toHaveClass(
      "pointer-events-auto"
    );
    expect(expandedControls(container)).toHaveAttribute(
      "data-app-context-expanded"
    );
    expect(stickyStrip(container)).toHaveClass("pointer-events-none");
  });
});
