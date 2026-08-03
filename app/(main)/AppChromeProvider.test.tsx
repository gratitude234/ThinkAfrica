import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppChromeProvider, useAppChrome } from "./AppChromeProvider";

const navigationState = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

let frames: Array<FrameRequestCallback | null> = [];

function mediaQueries({ mobile = true, reduced = false } = {}) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("max-width") ? mobile : reduced,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function flushFrames() {
  act(() => {
    const queued = frames;
    frames = [];
    queued.forEach((callback) => callback?.(0));
  });
}

function scrollTo(y: number) {
  act(() => {
    window.scrollY = y;
    window.dispatchEvent(new Event("scroll"));
  });
  flushFrames();
}

function Harness({ registerContext = false }: { registerContext?: boolean }) {
  const {
    mode,
    navHeight,
    registerSubnav,
    revealChrome,
    setInteractionLocked,
  } = useAppChrome();

  return (
    <>
      {registerContext ? (
        <ContextRegistration registerSubnav={registerSubnav} />
      ) : null}
      <output data-testid="mode">{mode}</output>
      <output data-testid="height">{navHeight}</output>
      <button type="button" onClick={() => revealChrome({ immediate: true })}>
        Reveal now
      </button>
      <button type="button" onClick={() => setInteractionLocked(true)}>
        Lock chrome
      </button>
    </>
  );
}

function ContextRegistration({
  registerSubnav,
}: {
  registerSubnav: ReturnType<typeof useAppChrome>["registerSubnav"];
}) {
  const nodeRef = (node: HTMLDivElement | null) => {
    if (!node) return;
    const anchor = node.previousElementSibling as HTMLElement | null;
    return registerSubnav(node, anchor);
  };

  return (
    <>
      <div data-testid="anchor" />
      <div ref={nodeRef}>Context</div>
    </>
  );
}

function renderProvider(options: { registerContext?: boolean } = {}) {
  return render(
    <AppChromeProvider>
      <Harness registerContext={options.registerContext} />
    </AppChromeProvider>
  );
}

beforeEach(() => {
  navigationState.pathname = "/";
  frames = [];
  window.scrollY = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    frames.push(callback)
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames[id - 1] = null;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.scrollY = 0;
});

describe("AppChromeProvider", () => {
  it("uses one shared scroll listener", () => {
    mediaQueries();
    const addSpy = vi.spyOn(window, "addEventListener");

    renderProvider();

    expect(
      addSpy.mock.calls.filter(([event]) => event === "scroll")
    ).toHaveLength(1);
  });

  // Thumb-sized, so a flick's own momentum wobble cannot flip the chrome.
  it("requires 64px downward and 40px upward intent", () => {
    mediaQueries();
    window.scrollY = 100;
    renderProvider();
    flushFrames();

    scrollTo(163);
    expect(screen.getByTestId("mode")).toHaveTextContent("expanded");

    scrollTo(164);
    expect(screen.getByTestId("mode")).toHaveTextContent("compact");

    scrollTo(125);
    expect(screen.getByTestId("mode")).toHaveTextContent("compact");

    scrollTo(124);
    expect(screen.getByTestId("mode")).toHaveTextContent("expanded");
  });

  it("waits for a registered contextual header to reach its sticky boundary", () => {
    mediaQueries();
    renderProvider({ registerContext: true });
    flushFrames();
    const anchor = screen.getByTestId("anchor");
    const rect = vi
      .spyOn(anchor, "getBoundingClientRect")
      .mockReturnValue({ top: 100 } as DOMRect);

    scrollTo(400);
    expect(screen.getByTestId("mode")).toHaveTextContent("expanded");

    rect.mockReturnValue({ top: 60 } as DOMRect);
    scrollTo(420);
    expect(screen.getByTestId("mode")).toHaveTextContent("compact");
  });

  it("stays expanded on desktop and for reduced-motion users", () => {
    mediaQueries({ mobile: false });
    const desktop = renderProvider();
    flushFrames();
    scrollTo(400);
    expect(screen.getByTestId("mode")).toHaveTextContent("expanded");
    desktop.unmount();

    mediaQueries({ mobile: true, reduced: true });
    renderProvider();
    flushFrames();
    scrollTo(400);
    expect(screen.getByTestId("mode")).toHaveTextContent("expanded");
  });

  it("expands and publishes a transition-free offset for programmatic reveals", () => {
    mediaQueries();
    renderProvider();
    flushFrames();
    scrollTo(400);
    const root = screen.getByTestId("mode").closest("[data-app-chrome]");

    expect(root).toHaveAttribute("data-chrome-mode", "compact");
    expect(root).toHaveStyle({ "--app-nav-offset": "0px" });

    fireEvent.click(screen.getByRole("button", { name: "Reveal now" }));
    expect(root).toHaveAttribute("data-chrome-mode", "expanded");
    expect(root).toHaveAttribute("data-chrome-instant", "true");
    expect(root).toHaveStyle({ "--app-nav-offset": "60px" });
  });

  it("holds expanded while an interaction lock is active", () => {
    mediaQueries();
    renderProvider();
    flushFrames();
    fireEvent.click(screen.getByRole("button", { name: "Lock chrome" }));

    scrollTo(400);
    expect(screen.getByTestId("mode")).toHaveTextContent("expanded");
  });
});
