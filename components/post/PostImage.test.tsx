import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PostImage from "./PostImage";

const SRC = "https://example.supabase.co/storage/v1/object/public/post-images/a.jpg";

function loadFeedImage(naturalWidth: number, naturalHeight: number) {
  const img = screen.getAllByRole("img")[0] as HTMLImageElement;
  Object.defineProperty(img, "naturalWidth", { value: naturalWidth, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: naturalHeight, configurable: true });
  fireEvent.load(img);
}

describe("PostImage", () => {
  it("opens the viewer on tap instead of navigating to the post", () => {
    const { container } = render(<PostImage src={SRC} alt="A screenshot" />);

    expect(container.querySelector("a")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "View image full screen: A screenshot" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("returns focus to the image after the viewer closes", () => {
    render(<PostImage src={SRC} alt="A screenshot" />);
    const trigger = screen.getByRole("button", { name: "View image full screen: A screenshot" });

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Close image viewer" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("flags an image the feed had to crop, and leaves an uncropped one unmarked", () => {
    const { container, unmount } = render(<PostImage src={SRC} alt="A tall screenshot" />);
    loadFeedImage(1080, 2340);
    expect(container.querySelector("[title='Tap to see the whole image']")).toBeTruthy();
    unmount();

    const uncropped = render(<PostImage src={SRC} alt="A photo" />);
    loadFeedImage(1080, 1350);
    expect(
      uncropped.container.querySelector("[title='Tap to see the whole image']")
    ).toBeNull();
  });
});
