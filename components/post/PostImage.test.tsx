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

function ratioOf(el: HTMLElement) {
  const [width, height = "1"] = el.style.aspectRatio.split("/");
  return Number(width) / Number(height);
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

  it("contains a very tall image instead of hiding part of it", () => {
    const { container } = render(<PostImage src={SRC} alt="A tall screenshot" />);
    loadFeedImage(1080, 2340);

    const image = screen.getByRole("img", { name: "A tall screenshot" });
    expect(image).toHaveClass("object-contain");
    expect(ratioOf(image.parentElement as HTMLElement)).toBeCloseTo(2 / 3);
    expect(container.querySelector("[title='Tap to see the whole image']")).toBeNull();
  });

  it("uses the uploaded image's natural ratio for feed media", () => {
    render(<PostImage src={SRC} alt="A portrait" variant="feed" />);
    loadFeedImage(1080, 1350);

    const image = screen.getByRole("img", { name: "A portrait" });
    expect(ratioOf(image.parentElement as HTMLElement)).toBeCloseTo(4 / 5);
    expect(image.parentElement).toHaveClass("max-h-[72svh]", "sm:max-h-[720px]");
    expect(image).toHaveClass("object-contain");
    expect(
      screen.getByRole("button", { name: "View image full screen: A portrait" })
    ).toBeInTheDocument();
  });

  it("uses a compact crop for article and research thumbnails", () => {
    render(<PostImage src={SRC} alt="An article cover" variant="feed-thumbnail" />);

    expect(screen.getByRole("img", { name: "An article cover" }).parentElement).toHaveClass(
      "aspect-[4/3]",
      "sm:aspect-[16/10]",
    );
  });

  it("uses a contained paper ratio for Research previews", () => {
    render(<PostImage src={SRC} alt="A paper cover" variant="research-preview" />);

    const image = screen.getByRole("img", { name: "A paper cover" });
    expect(image.parentElement).toHaveClass("aspect-[3/4]");
    expect(image).toHaveClass("object-contain");
  });
});
