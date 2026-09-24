import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShareButtons from "./ShareButtons";
import PublicationIdentity from "./PublicationIdentity";
import ReadingProgressBar from "./ReadingProgressBar";

afterEach(() => { vi.unstubAllGlobals(); });

describe("publication detail regressions", () => {
  it("shows verification only when the profile is verified", () => {
    const { rerender } = render(<PublicationIdentity verified={false} />);
    expect(screen.queryByRole("img")).toBeNull();
    rerender(<PublicationIdentity verified />);
    expect(screen.getByRole("img", { name: "Identity verified by Indegenius" })).toBeInTheDocument();
  });

  it("provides a selectable URL when clipboard permissions fail", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) } });
    render(<ShareButtons title="Test" slug="example" flat />);
    fireEvent.click(screen.getByRole("button", { name: "Share publication" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not copy");
    expect(screen.getByRole("textbox", { name: "Publication link" })).toHaveValue(`${window.location.origin}/post/example`);
  });

  it("confirms a successful copy and returns keyboard focus", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<ShareButtons title="Test" slug="example" />);
    fireEvent.click(screen.getByRole("button", { name: "Share publication" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy link" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Link copied" })).toHaveFocus());
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/post/example`);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("finishes at the article's end, regardless of the discussion length", () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { fn(0); return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("scrollY", 0);
    const article = document.createElement("div");
    article.id = "post-article-prose";
    article.getBoundingClientRect = () => ({ top: 400 - window.scrollY, bottom: 2400 - window.scrollY, height: 2000 }) as DOMRect;
    document.body.appendChild(article);
    const { container } = render(<ReadingProgressBar />);
    const bar = container.querySelector<HTMLElement>(".publication-reading-progress > div")!;
    expect(bar.style.width).toBe("0%");
    vi.stubGlobal("scrollY", 1000);
    act(() => { fireEvent.scroll(window); });
    expect(bar.style.width).toBe("50%");
    vi.stubGlobal("scrollY", 1600);
    act(() => { fireEvent.scroll(window); });
    expect(bar.style.width).toBe("100%");
    article.remove();
  });
});
