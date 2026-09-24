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

// Infinite scroll re-registers its observer on cache writes, so take the newest
// observer matching the expected root margin rather than relying on creation order.
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    writable: true,
    value: 0,
  });
});

describe("PostsFeedTabs -- feed modes", () => {
  it("offers a member exactly two modes, For You and Following", () => {
    render(<PostsFeedTabs {...member} />);

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "For You",
      "Following",
    ]);
    expect(screen.getByRole("tab", { name: "For You" })).toHaveAttribute(
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
      fireEvent.click(screen.getByRole("tab", { name: "For You" }));
    });

    expect(window.location.search).toBe("");
    expect(screen.getByRole("tab", { name: "For You" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    // Returning to a warm cached tab should be instant, not another page-one
    // request that throws away the reader's snapshot.
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it("restores each cached feed to the reader's previous scroll position", async () => {
    let scrollY = 1200;
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      get: () => scrollY,
    });
    const scrollTo = vi.fn(({ top }: ScrollToOptions) => {
      scrollY = Number(top ?? 0);
    });
    vi.stubGlobal("scrollTo", scrollTo);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() => ({
      top: -scrollY,
    } as DOMRect));

    const fetchMock = vi.fn(async () => page([post("following")]));
    vi.stubGlobal("fetch", fetchMock);
    render(<PostsFeedTabs {...member} initialPosts={[post("home")]} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Following" }));
    });
    await waitFor(() => expect(screen.getByTestId("feed")).toHaveTextContent("following"));

    scrollY = 700;
    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "For You" }));
    });
    await waitFor(() =>
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 1200, behavior: "instant" })
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Following" }));
    });
    await waitFor(() =>
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 700, behavior: "instant" })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reselecting the active feed scrolls to its top before it refreshes", async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    const fetchMock = vi.fn(async () => page([post("refreshed")]));
    vi.stubGlobal("fetch", fetchMock);
    render(<PostsFeedTabs {...member} initialPosts={[post("home")]} />);

    vi.stubGlobal("scrollY", 1800);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: -1800,
    } as DOMRect);

    fireEvent.click(screen.getByRole("tab", { name: "For You" }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
    expect(fetchMock).not.toHaveBeenCalled();
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

  it("continues For You from its frozen snapshot cursor", async () => {
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
    expect(requestParams(fetchMock, 0).get("cursor")).toBe("stray-cursor");
  });

  it("appends only posts the reader does not already have", async () => {
    // Dedupe remains a defense against retries or corrupted upstream responses;
    // a valid v4 snapshot should not normally repeat a card.
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
    expect(screen.getByText("We're having trouble loading publications right now. Please try again.")).toBeInTheDocument();
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

  it("starts a fresh For You snapshot instead of falling back to numeric offsets", async () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: "INVALID_CURSOR", message: "expired" } }),
          { status: 400 }
        )
      )
      .mockResolvedValueOnce(page([post("fresh")], false));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PostsFeedTabs
        {...member}
        initialPosts={[post("1")]}
        initialHasMore
        initialNextCursor="expired-home-cursor"
      />
    );

    await paginate();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(requestParams(fetchMock, 0).get("cursor")).toBe("expired-home-cursor");
    expect(requestParams(fetchMock, 1).get("page")).toBe("1");
    expect(requestParams(fetchMock, 1).has("cursor")).toBe(false);
    await waitFor(() => expect(screen.getByTestId("feed")).toHaveTextContent("fresh"));
    expect(screen.queryByText("Couldn't load more.")).not.toBeInTheDocument();
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

// The switcher is application chrome: full-bleed on mobile, balanced 50/50,
// and intentionally flat even when sticky.
describe("PostsFeedTabs -- feed switcher layout", () => {
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

  it("uses a balanced two-column switcher instead of a scrollable link row", () => {
    const { container } = render(<PostsFeedTabs {...member} />);
    const row = tabRow(container);

    expect(row).toHaveClass("grid", "grid-cols-2", "border-b", "border-divider");
    expect(row.className).not.toMatch(/overflow-x-auto|shadow-/);
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveClass("w-full", "min-h-12", "justify-center");
    }
  });

  it("keeps only a short centered indicator under the active label", () => {
    render(<PostsFeedTabs {...member} />);
    const active = screen.getByRole("tab", { name: "For You" });
    const indicator = active.querySelector("span[aria-hidden='true']:last-child");
    expect(indicator).toHaveClass("w-10", "bg-emerald-brand");
  });

  it("defers pinning to shared chrome and breaks out of the mobile reading gutter", () => {
    const { container } = render(<PostsFeedTabs {...member} />);
    const strip = stickyStrip(container);

    expect(strip).toHaveAttribute("data-app-context-nav");
    expect(strip).toHaveAttribute("data-app-chrome-motion");
    expect(strip).toHaveClass("-mx-4", "w-[calc(100%+2rem)]", "md:mx-0", "md:w-full");
    expect(strip).not.toHaveClass("sticky", "bg-card", "px-4");
    expect(tabRow(container)).toHaveClass("bg-canvas", "pointer-events-auto");
  });

  it("has no filter row under the tabs", () => {
    const { container } = render(<PostsFeedTabs {...member} />);
    expect(container.querySelector("[data-app-context-expanded]")).toBeNull();
  });
});

describe("PostsFeedTabs -- non-disruptive freshness", () => {
  beforeEach(() => vi.stubGlobal("IntersectionObserver", MockIntersectionObserver));

  it("stages newly published content behind a dot instead of replacing the visible snapshot", async () => {
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fresh = {
      ...post("fresh"),
      created_at: new Date(now + 61_000).toISOString(),
      published_at: new Date(now + 61_000).toISOString(),
    };
    const fetchMock = vi.fn(async () => page([fresh]));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(
      <PostsFeedTabs {...member} initialPosts={[post("original")]} />
    );

    now += 61_000;
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() =>
      expect(container.querySelector("[data-feed-new-indicator]")).not.toBeNull()
    );
    expect(screen.getByTestId("feed")).toHaveTextContent("original");
    expect(screen.getByTestId("feed")).not.toHaveTextContent("fresh");

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "For You" }));
    });
    expect(screen.getByTestId("feed")).toHaveTextContent("fresh");
    expect(container.querySelector("[data-feed-new-indicator]")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});



describe("PostsFeedTabs -- snapshot and retry safety", () => {
  beforeEach(() => vi.stubGlobal("IntersectionObserver", MockIntersectionObserver));

  it("shows loading rather than an empty feed during an initial retry", async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(r => { resolve = r; })));
    const { container } = render(<PostsFeedTabs {...member} initialLoadFailed />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.queryByText("No publications to show yet.")).not.toBeInTheDocument();
    expect(container.querySelector("#home-feed-panel")).toHaveAttribute("aria-busy", "true");
    await act(async () => resolve(page([post("recovered")])));
    expect(screen.getByTestId("feed")).toHaveTextContent("recovered");
  });

  it("disconnects automatic pagination after a failure until explicit retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("failed", { status: 500 })));
    render(<PostsFeedTabs {...member} initialPosts={[post("first")]} initialHasMore />);
    await paginate();
    expect(screen.getByText("Couldn't load more.")).toBeInTheDocument();
    const observers = observerInstances.filter(o => o.options?.rootMargin === "400px 0px");
    expect(observers.every(o => o.disconnect.mock.calls.length > 0)).toBe(true);
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("does not let an older page-one response replace a newer tab refresh", async () => {
    const pending: Array<(response: Response) => void> = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(r => pending.push(r))));
    render(<PostsFeedTabs {...member} initialPosts={[post("original")]} />);
    fireEvent.click(screen.getByRole("tab", { name: "Following" }));
    fireEvent.click(screen.getByRole("tab", { name: "For You" }));
    fireEvent.click(screen.getByRole("tab", { name: "Following" }));
    await act(async () => pending[1](page([post("new-following")])));
    await act(async () => pending[0](page([post("old-following")])));
    expect(screen.getByTestId("feed")).toHaveTextContent("new-following");
    expect(screen.getByTestId("feed")).not.toHaveTextContent("old-following");
  });

  it("discards a late pagination response after refreshing the same tab", async () => {
    const pending: Array<(response: Response) => void> = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(r => pending.push(r))));
    render(<PostsFeedTabs {...member} initialPosts={[post("original")]} initialHasMore />);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    fireEvent.click(screen.getByRole("tab", { name: "For You" }));
    await act(async () => pending[1](page([post("fresh-snapshot")])));
    await act(async () => pending[0](page([post("stale-page")], true, "stale-cursor")));
    expect(screen.getByTestId("feed")).toHaveTextContent("fresh-snapshot");
    expect(screen.getByTestId("feed")).not.toHaveTextContent("stale-page");
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("keeps the cached snapshot's session if its background freshness check fails", async () => {
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(page([post("following")]))
      .mockResolvedValueOnce(new Response("failed", { status: 500 }))
      .mockResolvedValueOnce(page([post("continued")]));
    vi.stubGlobal("fetch", fetchMock);
    render(<PostsFeedTabs {...member} initialPosts={[post("original")]} initialHasMore initialNextCursor="original-cursor" />);
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Following" })));
    now += 61_000;
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "For You" })));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Load more" })));
    expect(requestParams(fetchMock, 2).get("cursor")).toBe("original-cursor");
    expect(requestParams(fetchMock, 2).get("session")).not.toBe(requestParams(fetchMock, 1).get("session"));
    expect(screen.getByTestId("feed")).toHaveTextContent("original,continued");
  });

  it("supports manual pagination when IntersectionObserver is unavailable", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    vi.stubGlobal("fetch", vi.fn(async () => page([post("second")])));
    render(<PostsFeedTabs {...member} initialPosts={[post("first")]} initialHasMore />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Load more" })));
    expect(screen.getByTestId("feed")).toHaveTextContent("first,second");
  });
});
