import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FeedPreviewPage from "./page";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  like: vi.fn(),
  bookmark: vi.fn(),
}));

// Preserve the real notFound() (this is the exact behavior under test) while
// stubbing only useRouter, the same way other card tests do.
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return { ...actual, useRouter: () => ({ push: mocks.push }) };
});

// The same server actions the real Like/Save buttons call. If a click in
// this harness ever reached these, it would be a real Supabase write --
// these mocks let the test prove that never happens.
vi.mock("@/app/(main)/post/[slug]/likeActions", () => ({ togglePostLike: mocks.like }));
vi.mock("@/app/(main)/post/[slug]/bookmarkActions", () => ({ toggleBookmark: mocks.bookmark }));

describe("FeedPreviewPage (dev-only visual fixture harness)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mocks.push.mockReset();
    mocks.like.mockReset();
    mocks.bookmark.mockReset();
  });

  it("is inaccessible in a production build", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => FeedPreviewPage()).toThrow();
  });

  it("renders real fixture data for every section outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    render(<FeedPreviewPage />);

    expect(screen.getByText("Home feed visual preview")).toBeInTheDocument();
    // One representative fixture per content kind, rendered through the
    // real HomeFeedCard/HomeFeaturedLead/HomeSidebar components.
    expect(screen.getByRole("heading", { name: "The Hidden Cost of Studying Abroad" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Community Health Worker Retention After the 2023 Stipend Reform" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "What My First Year of Medical School Taught Me About Grief" })
    ).toBeInTheDocument();
    expect(screen.getByText("Featured today")).toBeInTheDocument();
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
  });

  it("never writes to Supabase, even when a pre-liked/saved fixture's engagement button is clicked", () => {
    vi.stubEnv("NODE_ENV", "development");
    render(<FeedPreviewPage />);

    // Every card is rendered with currentUserId={null} -- clicking a
    // pre-"liked" fixture's Unlike control must redirect to login instead
    // of calling the real like/bookmark server actions.
    for (const button of screen.getAllByRole("button", { name: /Unlike this item/i })) {
      fireEvent.click(button);
    }
    for (const button of screen.getAllByRole("button", { name: /Remove from saved/i })) {
      fireEvent.click(button);
    }

    expect(mocks.like).not.toHaveBeenCalled();
    expect(mocks.bookmark).not.toHaveBeenCalled();
    expect(mocks.push.mock.calls.every(([to]) => String(to).startsWith("/login"))).toBe(true);
    expect(mocks.push).toHaveBeenCalled();
  });
});
