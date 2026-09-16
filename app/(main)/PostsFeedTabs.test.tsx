import type { AnchorHTMLAttributes, ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PostsFeedTabs from "./PostsFeedTabs";
import type { PostCardData } from "@/components/post/PostCard";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/post/PostFeed", () => ({
  default: ({ posts }: { posts: PostCardData[] }) => (
    <div data-testid="feed">{posts.map((post) => post.id).join(",")}</div>
  ),
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
// matching the nav height). Select by rootMargin rather than by position, and
// take the newest match: the infinite-scroll effect registers a fresh observer
// on every cache write, so the earliest match is usually a disconnected one.
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
    profiles: { username: "amara", full_name: "Amara", university: null, avatar_url: null },
  };
}

function page(posts: PostCardData[], hasMore = false, nextCursor: string | null = null) {
  return new Response(JSON.stringify({ posts, hasMore, nextCursor }), { status: 200 });
}

function requestParams(fetchMock: ReturnType<typeof vi.fn>, call: number) {
  return new URL(String(fetchMock.mock.calls[call][0]), "http://localhost").searchParams;
}

const member = {
  initialTab: "home" as const,
  initialPosts: [] as PostCardData[],
  initialHasMore: false,
  currentUserId: "user-1",
};

const guest = { ...member, currentUserId: null };

async function paginate() {
  const observer = infiniteScrollObserver();
  await act(async () => {
    observer.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      observer as unknown as IntersectionObserver
    );
  });
}

beforeEach(() => {
  observerInstances = [];
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PostsFeedTabs -- feed modes", () => {
  it("offers a member exactly two modes, For you and Following", () => {
    render(<PostsFeedTabs {...member} />);

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "For you",
      "Following",
    ]);
    expect(screen.getByRole("tab", { name: "For you" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    for (const retired of ["Latest", "Subscribed", "Topics", "Discover", "Featured"]) {
      expect(screen.queryByRole("tab", { name: retired })).not.toBeInTheDocument();
    }
  });

  it("gives a guest the feed and one sign-in notice, with no mode switcher", () => {
    render(<PostsFeedTabs {...guest} initialPosts={[post("a")]} />);

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByText(/Browsing as a guest/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Sign in" })).toHaveLength(1);
    expect(screen.getByTestId("feed")).toHaveTextContent("a");
  });

  it("switches to Following, and back, keeping the address in step", async () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const fetchMock = vi.fn(async () => page([post("f1")]));
    vi.stubGlobal("fetch", fetchMock);
    render(<PostsFeedTabs {...member} initialPosts={[post("h1")]} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Following" }));
    });

    await waitFor(() => expect(screen.getByTestId("feed")).toHaveTextContent("f1"));
    expect(window.location.search).toBe("?tab=following");
    expect(requestParams(fetchMock, 0).get("tab")).toBe("following");
    expect(requestParams(fetchMock, 0).get("page")).toBe("1");

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "For you" }));
    });

    expect(window.location.search).toBe("");
    expect(screen.getByRole("tab", { name: "For you" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("moves between the two modes with the arrow keys", async () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.stubGlobal("fetch", vi.fn(async () => page([])));
    render(<PostsFeedTabs {...member} />);

    await act(async () => {
      fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    });

    expect(screen.getByRole("tab", { name: "Following" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });
});

describe("PostsFeedTabs -- caught-up state", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  it("shows the quiet caught-up line once pagination is exhausted", () => {
    render(<PostsFeedTabs {...guest} initialPosts={[post("a"), post("b")]} />);

    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
    expect(screen.queryByText(/switch to Latest/i)).not.toBeInTheDocument();
  });

  it("does not show the caught-up state while more pages remain", () => {
    render(
      <PostsFeedTabs {...guest} initialPosts={[post("a"), post("b")]} initialHasMore />
    );

    expect(screen.queryByText("You're all caught up.")).not.toBeInTheDocument();
  });

  it("does not show the caught-up state for an initially empty feed", () => {
    render(<PostsFeedTabs {...guest} />);

    expect(screen.queryByText("You're all caught up.")).not.toBeInTheDocument();
  });
});

describe("PostsFeedTabs -- loading state", () => {
  it("shows the skeleton, not the feed, while switching to an uncached mode", async () => {
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending)
    );

    render(<PostsFeedTabs {...member} initialPosts={[post("a")]} />);

    fireEvent.click(screen.getByRole("tab", { name: "Following" }));

    expect(screen.queryByTestId("feed")).not.toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      resolveFetch(page([]));
      await pending;
    });
  });
});

describe("PostsFeedTabs -- empty states", () => {
  it("says For You has nothing to show, and offers nothing else", () => {
    render(<PostsFeedTabs {...member} />);

    const panel = screen.getByRole("tabpanel");
    expect(
      within(panel).getByRole("heading", { name: "No publications to show yet." })
    ).toBeInTheDocument();
    expect(within(panel).queryByRole("link")).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button")).not.toBeInTheDocument();
  });

  it("points an empty Following feed at writers to follow on Explore", () => {
    render(<PostsFeedTabs {...member} initialTab="following" />);

    const panel = screen.getByRole("tabpanel");
    expect(
      within(panel).getByRole("heading", {
        name: "Follow writers to see their Posts and Articles here.",
      })
    ).toBeInTheDocument();
    const links = within(panel).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent("Explore writers");
    expect(links[0]).toHaveAttribute("href", "/explore?tab=people");
  });

  it("gives a guest the same plain empty state", () => {
    render(<PostsFeedTabs {...guest} />);

    expect(
      screen.getByRole("heading", { name: "No publications to show yet." })
    ).toBeInTheDocument();
  });
});

describe("PostsFeedTabs -- scroll position on tab switch", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => page([post("1")]))
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a reader who is scrolled into the feed back to the top of it", async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    render(<PostsFeedTabs {...member} />);

    // jsdom reports every rect as zero, so stand in for "the feed controls
    // have scrolled 2400px above the viewport".
    vi.stubGlobal("scrollY", 2400);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: -2400,
    } as DOMRect);

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Following" }));
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
    render(<PostsFeedTabs {...member} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Following" }));
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe("PostsFeedTabs -- pagination", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  it("continues Following from the server cursor", async () => {
    const fetchMock = vi.fn(async () => page([]));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PostsFeedTabs
        {...member}
        initialTab="following"
        initialPosts={[post("1")]}
        initialHasMore
        initialNextCursor="opaque-cursor"
      />
    );

    await paginate();

    expect(requestParams(fetchMock, 0).get("cursor")).toBe("opaque-cursor");
    expect(requestParams(fetchMock, 0).get("tab")).toBe("following");
  });

  it("pages For You by number, never by cursor", async () => {
    const fetchMock = vi.fn(async () => page([]));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PostsFeedTabs
        {...member}
        initialPosts={[post("1")]}
        initialHasMore
        initialNextCursor="stray-cursor"
      />
    );

    await paginate();

    expect(requestParams(fetchMock, 0).get("tab")).toBe("home");
    expect(requestParams(fetchMock, 0).get("page")).toBe("2");
    expect(requestParams(fetchMock, 0).has("cursor")).toBe(false);
  });

  it("appends only posts the reader does not already have", async () => {
    // One post published between two requests slides a page window and
    // re-serves the previous page's last card as the head of the next.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => page([post("2"), post("3")]))
    );

    render(
      <PostsFeedTabs {...member} initialPosts={[post("1"), post("2")]} initialHasMore />
    );

    await paginate();

    await waitFor(() => expect(screen.getByTestId("feed")).toHaveTextContent("1,2,3"));
  });

  it("stops paging after three pages that add nothing new", async () => {
    // A fresh Response per call: a body can only be read once.
    const fetchMock = vi.fn(async () => page([post("1")], true));
    vi.stubGlobal("fetch", fetchMock);

    render(<PostsFeedTabs {...member} initialPosts={[post("1")]} initialHasMore />);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await paginate();
    }

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(infiniteScrollObserver().disconnect).toHaveBeenCalled();
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
  });
});

describe("PostsFeedTabs -- error and retry states", () => {
  it("shows a server-render failure as a retryable feed error", () => {
    render(<PostsFeedTabs {...member} initialLoadFailed />);

    expect(screen.getByText("Couldn't load your feed")).toBeInTheDocument();
    expect(screen.queryByText("No publications to show yet.")).not.toBeInTheDocument();
  });

  it("shows the initial-failure state and recovers on retry, refetching the current mode", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("fail", { status: 500 }))
      .mockResolvedValueOnce(page([post("1")]));
    vi.stubGlobal("fetch", fetchMock);

    render(<PostsFeedTabs {...member} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Following" }));
    });

    await waitFor(() =>
      expect(screen.getByText("Couldn't load your feed")).toBeInTheDocument()
    );
    expect(screen.getByText("Check your connection and try again.")).toBeInTheDocument();
    expect(screen.queryByTestId("feed")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    await waitFor(() => expect(screen.getByTestId("feed")).toBeInTheDocument());
    expect(screen.queryByText("Couldn't load your feed")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestParams(fetchMock, 1).get("tab")).toBe("following");
  });

  it("keeps already-loaded content visible on a pagination failure and retries only the next page", async () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("fail", { status: 500 }))
      .mockResolvedValueOnce(page([post("2")]));
    vi.stubGlobal("fetch", fetchMock);

    render(<PostsFeedTabs {...member} initialPosts={[post("1")]} initialHasMore />);

    expect(screen.getByTestId("feed")).toBeInTheDocument();
    await paginate();

    await waitFor(() => expect(screen.getByText("Couldn't load more.")).toBeInTheDocument());
    expect(screen.getByTestId("feed")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    await waitFor(() =>
      expect(screen.queryByText("Couldn't load more.")).not.toBeInTheDocument()
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestParams(fetchMock, 1).get("page")).toBe("2");
  });

  it("clears a rejected cursor before retrying the same Following page", async () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: "INVALID_CURSOR", message: "expired" } }),
          { status: 400 }
        )
      )
      .mockResolvedValueOnce(page([post("2")]));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PostsFeedTabs
        {...member}
        initialTab="following"
        initialPosts={[post("1")]}
        initialHasMore
        initialNextCursor="rejected-cursor"
      />
    );

    await paginate();
    await waitFor(() => expect(screen.getByText("Couldn't load more.")).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(requestParams(fetchMock, 0).get("cursor")).toBe("rejected-cursor");
    expect(requestParams(fetchMock, 1).has("cursor")).toBe(false);
    expect(requestParams(fetchMock, 1).get("page")).toBe("2");
  });

  it("does not leak one mode's pagination failure into the other", async () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    let resolveOldPage!: (response: Response) => void;
    const oldPage = new Promise<Response>((resolve) => {
      resolveOldPage = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => oldPage)
      .mockResolvedValueOnce(page([post("followed")]));
    vi.stubGlobal("fetch", fetchMock);

    render(<PostsFeedTabs {...member} initialPosts={[post("1")]} initialHasMore />);

    await paginate();
    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Following" }));
    });
    await act(async () => {
      resolveOldPage(new Response("failed", { status: 500 }));
      await oldPage;
    });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Following", selected: true })).toBeInTheDocument()
    );
    expect(screen.queryByText("Couldn't load more.")).not.toBeInTheDocument();
  });
});

// jsdom has no layout engine and never actually pins a sticky element, so the
// pinned state is driven through the observer directly and asserted on classes.
describe("PostsFeedTabs -- pinned tab strip", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  function stickyStrip(container: HTMLElement) {
    const strip = container.querySelector<HTMLElement>("[data-app-context-nav]");
    if (!strip) throw new Error("sticky tab strip not found");
    return strip;
  }

  function tabRow(container: HTMLElement) {
    const row = container.querySelector<HTMLElement>("[data-app-context-primary]");
    if (!row) throw new Error("tab row not found");
    return row;
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

  it("shows no shadow at rest, and gains one once pinned", () => {
    const { container } = render(<PostsFeedTabs {...member} />);

    expect(tabRow(container).className).not.toMatch(/shadow-/);
    setPinned(true);
    expect(tabRow(container).className).toMatch(/shadow-/);
    setPinned(false);
    expect(tabRow(container).className).not.toMatch(/shadow-/);
  });

  // The border sits in the box at both states so pinning cannot reflow content.
  it("keeps the border in the box in both states", () => {
    const { container } = render(<PostsFeedTabs {...member} />);

    expect(tabRow(container)).toHaveClass("border-b", "border-divider");
    setPinned(true);
    expect(tabRow(container)).toHaveClass("border-b", "border-divider");
  });

  // The offset itself is the shared rule's job. A local `sticky top-...` would
  // freeze the offset at the nav's expanded height and reopen a hole under it.
  it("defers pinning to the shared chrome rule", () => {
    const { container } = render(<PostsFeedTabs {...member} />);

    expect(stickyStrip(container)).toHaveAttribute("data-app-context-nav");
    expect(stickyStrip(container)).toHaveAttribute("data-app-chrome-motion");
    expect(stickyStrip(container)).not.toHaveClass("sticky");
  });

  it("keeps the strip transparent and paints the tab row full-bleed", () => {
    const { container } = render(<PostsFeedTabs {...member} />);

    expect(stickyStrip(container)).not.toHaveClass("bg-card");
    expect(stickyStrip(container)).not.toHaveClass("px-4");
    expect(stickyStrip(container)).toHaveClass("pointer-events-none");
    expect(tabRow(container)).toHaveClass("bg-card", "px-4", "pointer-events-auto");
  });

  it("has no filter row under the tabs", () => {
    const { container } = render(<PostsFeedTabs {...member} />);

    expect(container.querySelector("[data-app-context-expanded]")).toBeNull();
  });
});
