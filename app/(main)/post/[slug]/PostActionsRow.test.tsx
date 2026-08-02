import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    requestAuth: vi.fn(),
    engagement: {
      liked: false,
      likeCount: 0,
      likePending: false,
      likeError: null as string | null,
      bookmarked: false,
      bookmarkPending: false,
      syncLiked: vi.fn(),
      syncLikeCount: vi.fn(),
      syncBookmarked: vi.fn(),
      toggleLike: vi.fn(),
      toggleBookmark: vi.fn(),
      setInlineActionsVisible: vi.fn(),
    },
  },
}));

vi.mock("./PostEngagementContext", () => ({
  usePostEngagement: () => mocks.engagement,
}));
vi.mock("@/components/ui/GuestAuthGateProvider", () => ({
  useGuestAuthGate: () => ({ requestAuth: mocks.requestAuth }),
}));
vi.mock("./ShareButtons", () => ({ default: () => <button type="button">Share</button> }));

import PostActionsRow from "./PostActionsRow";

function renderRow(overrides: Partial<Parameters<typeof PostActionsRow>[0]> = {}) {
  return render(
    <PostActionsRow
      postId="post-1"
      slug="a-post"
      title="A Post"
      excerpt={null}
      authorName="Amara"
      userId="viewer-1"
      initialLiked={false}
      initialLikeCount={0}
      initialBookmarked={false}
      responseCount={2}
      commentCount={3}
      {...overrides}
    />
  );
}

beforeEach(() => {
  mocks.requestAuth.mockReset();
  document.body.innerHTML = "";
});

describe("PostActionsRow reply action", () => {
  it("counts comments and responses together", () => {
    renderRow();
    expect(screen.getByRole("button", { name: "Reply to this post" })).toHaveTextContent("5");
  });

  it("takes the reader to the composer instead of navigating away", () => {
    const composer = document.createElement("textarea");
    composer.id = "inline-response";
    composer.scrollIntoView = vi.fn();
    document.body.appendChild(composer);

    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Reply to this post" }));

    expect(composer.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(composer);
    // The old behaviour was a link to /create/post or /write.
    expect(screen.queryByRole("link", { name: /respond/i })).toBeNull();
  });

  it("falls back to the thread when there is no composer on the page", () => {
    const thread = document.createElement("section");
    thread.id = "comments";
    thread.scrollIntoView = vi.fn();
    document.body.appendChild(thread);

    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Reply to this post" }));

    expect(thread.scrollIntoView).toHaveBeenCalled();
  });

  it("gates a guest to sign-in rather than focusing a box they can't use", () => {
    renderRow({ userId: null });

    fireEvent.click(screen.getByRole("button", { name: "Reply to this post" }));

    expect(mocks.requestAuth).toHaveBeenCalledWith("respond", { contentKind: "post" });
  });

  it("hides the count when there is nothing to count", () => {
    renderRow({ responseCount: 0, commentCount: 0 });
    expect(screen.getByRole("button", { name: "Reply to this post" })).toHaveTextContent("Reply");
    expect(screen.getByRole("button", { name: "Reply to this post" })).not.toHaveTextContent("0");
  });
});
