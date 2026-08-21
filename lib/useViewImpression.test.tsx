import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { useViewImpression } from "./useViewImpression";
import { FEED_ALGORITHM_VERSION, type FeedExposure } from "./feedExposure";

let observers: MockIntersectionObserver[] = [];

class MockIntersectionObserver {
  constructor(public callback: IntersectionObserverCallback) {
    observers.push(this);
  }
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

function Harness({
  surface,
  exposure,
}: {
  surface: string;
  exposure?: FeedExposure;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useViewImpression(ref, "post-slug", surface, exposure);
  return <div ref={ref}>Post</div>;
}

const exposure: FeedExposure = {
  postId: "post-1",
  slug: "post-slug",
  exposureId: "request-1:1:post-1",
  feedSessionId: "request-1",
  requestId: "request-1",
  algorithmVersion: FEED_ALGORITHM_VERSION,
  experimentVariant: "ranking_v2",
  surface: "home",
  candidateSource: "for_you_ranked",
  position: 1,
  page: 1,
  servedAt: "2026-08-18T12:00:00.000Z",
};

describe("useViewImpression", () => {
  beforeEach(() => {
    observers = [];
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function qualify(observer: MockIntersectionObserver) {
    await act(async () => {
      observer.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver
      );
      await vi.advanceTimersByTimeAsync(1000);
    });
  }

  it("records placement metadata and resets when a keyed post changes surface", async () => {
    const { rerender } = render(
      <Harness surface="home" exposure={exposure} />
    );

    await qualify(observers.at(-1)!);

    expect(fetch).toHaveBeenCalledTimes(1);
    const firstBody = JSON.parse(
      String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body)
    );
    expect(firstBody.metadata).toMatchObject({
      exposureId: "request-1:1:post-1",
      requestId: "request-1",
      algorithmVersion: FEED_ALGORITHM_VERSION,
      candidateSource: "for_you_ranked",
      position: 1,
    });

    rerender(
      <Harness
        surface="latest"
        exposure={{
          ...exposure,
          exposureId: "request-2:1:post-1",
          feedSessionId: "request-1",
          requestId: "request-2",
          surface: "latest",
          candidateSource: "latest",
        }}
      />
    );
    await qualify(observers.at(-1)!);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not emit an unsigned impression from a non-feed surface", () => {
    render(<Harness surface="bookmarks" />);

    expect(observers).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
