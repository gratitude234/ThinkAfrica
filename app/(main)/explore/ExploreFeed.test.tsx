import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExploreFeed from "./ExploreFeed";
import type { PostCardData } from "@/components/post/PostCard";
vi.mock("@/components/post/PostCardImpression", () => ({ default: ({ post }: {post: PostCardData}) => <article>{post.id}</article> }));
vi.mock("@/lib/activationEvents", () => ({ trackActivationEvent: vi.fn() }));
const post = (id: string, content_kind: "post" | "article" = "post") => ({ id, content_kind, slug: id, title: null, excerpt: id, tags: [], profiles: null, published_at: null, created_at: "2026-10-01" } as PostCardData);
const props = { tab: "for-you" as const, primary: "all" as const, initialPosts: [post("first")], initialHasMore: true, initialNextCursor: "cursor-1", signedIn: true, surface: "explore" };
const response = (posts: PostCardData[], hasMore = false) => ({ ok: true, json: async () => ({ posts, hasMore, nextCursor: "cursor-2" }) });
afterEach(() => vi.unstubAllGlobals());
describe("Explore feed interactions", () => {
  it("continues Trending with its cursor and de-duplicates the whole response", async () => {
    const fetcher = vi.fn().mockResolvedValue(response([post("first"), post("second"), post("second")]));
    vi.stubGlobal("fetch", fetcher);
    render(<ExploreFeed {...props} tab="trending" />);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("second");
    expect(screen.getAllByRole("article")).toHaveLength(2);
    const url = new URL(fetcher.mock.calls[0][0], "http://localhost");
    expect(url.searchParams.get("cursor")).toBe("cursor-1");
    expect(url.searchParams.get("personalized")).toBe("0");
    expect(url.searchParams.get("timeframe")).toBe("week");
  });
  it("recovers an expired cursor by replacing the shelf with a fresh page", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ error: { code: "INVALID_CURSOR" } }) }).mockResolvedValueOnce(response([post("fresh")]));
    vi.stubGlobal("fetch", fetcher);
    render(<ExploreFeed {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("fresh");
    expect(screen.queryByText("first")).not.toBeInTheDocument();
    expect(fetcher.mock.calls[1][0]).toContain("page=1");
    expect(fetcher.mock.calls[1][0]).not.toContain("cursor=");
  });
  it("keeps existing posts on failure and retries the same page", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(response([post("second")]));
    vi.stubGlobal("fetch", fetcher);
    render(<ExploreFeed {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("alert");
    expect(screen.getByText("first")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("second");
    expect(fetcher.mock.calls[0][0]).toBe(fetcher.mock.calls[1][0]);
  });
  it("clears a Trending filter within Trending and keeps topic discovery", () => {
    render(<ExploreFeed {...props} tab="trending" primary="article" initialPosts={[]} initialHasMore={false} interlude={<div>Popular topics</div>} />);
    expect(screen.getByRole("link", {name: "Clear filters"})).toHaveAttribute("href", "/explore?tab=trending");
    expect(screen.getByText("Popular topics")).toBeInTheDocument();
  });
  it("allows continuation when a safety-filtered page has no visible rows", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([post("article-result", "article")])));
    render(<ExploreFeed {...props} primary="article" />);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("article-result");
  });
  it("prevents duplicate requests before React commits the loading state", async () => {
    let resolve!: (value: unknown) => void;
    const fetcher = vi.fn(() => new Promise(r => {resolve = r;}));
    vi.stubGlobal("fetch", fetcher);
    render(<ExploreFeed {...props} />);
    const button = screen.getByRole("button", {name: "Load more"});
    act(() => {button.click(); button.click();});
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => resolve(response([])));
    await waitFor(() => expect(button).not.toBeInTheDocument());
  });
});
