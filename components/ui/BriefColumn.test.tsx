import { render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BriefColumn from "./BriefColumn";

const NAV_HEIGHT = 60;
const OFFSET = NAV_HEIGHT + 16; // --app-sticky-offset, in px

vi.mock("@/app/(main)/AppChromeProvider", () => ({
  useAppChrome: () => ({ navHeight: NAV_HEIGHT }),
}));

// jsdom implements neither of these. The component guards both, so the tests
// supply just enough of each to drive the behaviour under test.
let columnHeight = 400;

function setViewport({ width, height }: { width: number; height: number }) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

/** Scroll the window and let the component's rAF callback run. */
async function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  await act(async () => {
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
}

function renderColumn() {
  const view = render(
    <BriefColumn>
      <p>Your intellectual brief</p>
    </BriefColumn>
  );
  return { ...view, column: screen.getByRole("complementary") };
}

function topOf(column: HTMLElement) {
  return column.style.top;
}

beforeEach(() => {
  setViewport({ width: 1440, height: 900 });
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  // Every element in the tree reports the height the test asked for; only the
  // column's own height is ever read.
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    get: () => columnHeight,
    configurable: true,
  });
});

afterEach(() => {
  columnHeight = 400;
});

describe("BriefColumn", () => {
  it("renders the brief and keeps the pre-hydration pin as a fallback", () => {
    columnHeight = 400;
    const { column } = renderColumn();

    expect(screen.getByText("Your intellectual brief")).toBeInTheDocument();
    // Server HTML has no inline top, so the class has to place the column on
    // its own or the first paint is wrong.
    expect(column).toHaveClass("lg:sticky");
    expect(column).toHaveClass("lg:top-[var(--app-sticky-offset)]");
    expect(column).toHaveClass("self-start");
  });

  it("holds the column under the nav while it fits the viewport", async () => {
    columnHeight = 400; // shorter than 900 - 76 - 16
    const { column } = renderColumn();

    expect(topOf(column)).toBe(`${OFFSET}px`);

    await scrollTo(600);

    // Nothing to reveal, so the floor collapses onto the offset and this stays
    // the plain sticky column it replaced.
    expect(topOf(column)).toBe(`${OFFSET}px`);
  });

  it("rides up with the feed, then rests its last card on the bottom edge", async () => {
    // 1200 tall in a 900 viewport: 316px more column than there is room for.
    columnHeight = 1200;
    const { column } = renderColumn();
    const floor = 900 - 1200 - 16; // -316

    // At the top of the feed the head sits under the nav, as before.
    expect(topOf(column)).toBe(`${OFFSET}px`);

    // Then it travels with the document, pixel for pixel, instead of pinning.
    await scrollTo(200);
    expect(topOf(column)).toBe(`${OFFSET - 200}px`);

    await scrollTo(4000);
    // However far the reader goes, it stops with its tail on the bottom edge
    // rather than continuing off the top of the screen.
    expect(topOf(column)).toBe(`${floor}px`);
  });

  it("brings the head back the moment the reader scrolls up", async () => {
    columnHeight = 1200;
    const { column } = renderColumn();
    const floor = 900 - 1200 - 16;

    await scrollTo(4000);
    expect(topOf(column)).toBe(`${floor}px`);

    // Reading back up releases the pin immediately and tracks the gesture,
    // rather than waiting until the top of the feed.
    await scrollTo(3900);
    expect(topOf(column)).toBe(`${floor + 100}px`);

    await scrollTo(3800);
    expect(topOf(column)).toBe(`${floor + 200}px`);
  });

  it("never lets the head travel below the nav", async () => {
    columnHeight = 1200;
    const { column } = renderColumn();

    await scrollTo(4000);
    await scrollTo(0);

    expect(topOf(column)).toBe(`${OFFSET}px`);
  });

  it("re-reads its own height when a card comes or goes", async () => {
    columnHeight = 1200;
    const { column } = renderColumn();

    await scrollTo(4000);
    expect(topOf(column)).toBe(`${900 - 1200 - 16}px`);

    // A card closes and the column now fits. Height is cached rather than read
    // every frame, so if the cache went stale here the column would stay
    // parked off the top of the screen with its head unreachable.
    columnHeight = 400;
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(topOf(column)).toBe(`${OFFSET}px`);
  });

  it("writes no inline position below the two-column breakpoint", async () => {
    columnHeight = 1200;
    setViewport({ width: 800, height: 900 });
    const { column } = renderColumn();

    expect(topOf(column)).toBe("");

    await scrollTo(600);

    // The aside is display:none here; an inline top would apply at every width
    // and outrank the lg: class once the window grew again.
    expect(topOf(column)).toBe("");
  });

  it("pulls the column back down when the viewport grows under it", async () => {
    columnHeight = 1200;
    const { column } = renderColumn();

    await scrollTo(4000);
    expect(topOf(column)).toBe(`${900 - 1200 - 16}px`);

    // A taller window raises the floor. Without a re-clamp the column would be
    // stranded above its new resting place, showing a band of empty canvas
    // under its last card.
    setViewport({ width: 1440, height: 1100 });
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(topOf(column)).toBe(`${1100 - 1200 - 16}px`);

    // Once the window is tall enough to hold the whole column, it goes back to
    // resting under the nav.
    setViewport({ width: 1440, height: 1400 });
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(topOf(column)).toBe(`${OFFSET}px`);
  });
});
