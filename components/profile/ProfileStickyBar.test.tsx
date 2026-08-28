import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfileStickyBar from "./ProfileStickyBar";

// The bar's own follow behaviour is covered in profileFollowFunnel.test.tsx.
// This file is only about the offset it publishes for the compose FAB, so the
// controls and the avatar are stubbed down to nothing.
vi.mock("@/components/profile/AuthorRelationshipControls", () => ({
  default: () => <button type="button">Follow author</button>,
}));
vi.mock("@/components/ui/UserAvatar", () => ({ default: () => <span /> }));
vi.mock("@/lib/profileFunnel", () => ({ trackProfileFunnelEvent: vi.fn() }));

const BAR_HEIGHT = 53;

let notify: IntersectionObserverCallback | null = null;

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    notify = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  root = null;
  rootMargin = "";
  thresholds: number[] = [];
}

/** Drives the sentinel past the top of the viewport, which reveals the bar. */
function scrollHeaderAway() {
  act(() => {
    notify?.(
      [
        {
          isIntersecting: false,
          boundingClientRect: { top: -240 } as DOMRectReadOnly,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver
    );
  });
}

function renderBar() {
  return render(
    <ProfileStickyBar
      authorId="author-1"
      authorName="Ada"
      avatarUrl={null}
      currentUserId="reader"
      initialFollowing={false}
      viewerState="authenticated"
    />
  );
}

const publishedHeight = () =>
  document.documentElement.style.getPropertyValue("--profile-sticky-bar-height");

describe("ProfileStickyBar bottom-chrome offset", () => {
  beforeEach(() => {
    notify = null;
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      value: BAR_HEIGHT,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.style.removeProperty("--profile-sticky-bar-height");
  });

  it("publishes no offset while the header is still on screen", () => {
    renderBar();
    expect(publishedHeight()).toBe("0px");
  });

  it("publishes its measured height once it pins, so the FAB can lift clear", () => {
    renderBar();
    scrollHeaderAway();
    expect(publishedHeight()).toBe(`${BAR_HEIGHT}px`);
  });

  it("gives the offset back when it unmounts", () => {
    const { unmount } = renderBar();
    scrollHeaderAway();
    unmount();
    expect(publishedHeight()).toBe("");
  });

  it("clears the bottom nav's safe-area padding rather than sitting in it", () => {
    const { getByTestId } = renderBar();
    expect(getByTestId("profile-sticky-bar").style.bottom).toContain(
      "env(safe-area-inset-bottom)"
    );
  });
});
