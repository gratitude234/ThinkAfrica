import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BackLink from "./BackLink";

const back = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ back }) }));

function setReferrer(value: string) {
  Object.defineProperty(document, "referrer", { value, configurable: true });
}

/** Shadows the prototype getter so each case controls history explicitly. */
function setHistoryLength(value: number) {
  Object.defineProperty(window.history, "length", { value, configurable: true });
}

beforeEach(() => {
  back.mockClear();
  setReferrer("");
  setHistoryLength(3);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BackLink", () => {
  it("stays a real link so middle-click and no-JS still work", () => {
    render(<BackLink>Back</BackLink>);
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/");
  });

  it("goes back in history instead of resetting to the feed", () => {
    render(<BackLink>Back</BackLink>);

    const event = fireEvent.click(screen.getByRole("link", { name: "Back" }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(event).toBe(false); // default prevented
  });

  it("falls back to the feed when the referrer is another site", () => {
    setReferrer("https://x.com/someone/status/1");
    render(<BackLink>Back</BackLink>);

    const event = fireEvent.click(screen.getByRole("link", { name: "Back" }));
    expect(back).not.toHaveBeenCalled();
    expect(event).toBe(true); // navigation left to the browser
  });

  it("falls back to the feed when opened in a fresh tab with no history", () => {
    setHistoryLength(1);
    render(<BackLink>Back</BackLink>);

    const event = fireEvent.click(screen.getByRole("link", { name: "Back" }));
    expect(back).not.toHaveBeenCalled();
    expect(event).toBe(true);
  });

  it("leaves modifier clicks to the browser", () => {
    render(<BackLink>Back</BackLink>);

    fireEvent.click(screen.getByRole("link", { name: "Back" }), { metaKey: true });
    expect(back).not.toHaveBeenCalled();
  });
});
