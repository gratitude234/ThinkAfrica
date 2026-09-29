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

  it("crops portrait feed media to a square", () => {
    render(<PostImage src={SRC} alt="A portrait" variant="feed" />);
    loadFeedImage(1080, 1350);

    const image = screen.getByRole("img", { name: "A portrait" });
    expect(ratioOf(image.parentElement as HTMLElement)).toBeCloseTo(1);
    expect(image.closest("button")).toHaveClass("w-full");
    expect(screen.getByText("View full image")).toBeInTheDocument();
    expect(image).toHaveClass("object-cover");
    expect(
      screen.getByRole("button", { name: "View image full screen: A portrait" })
    ).toBeInTheDocument();
  });

  it("caps tall feed previews at 1:1 and exposes the original", () => {
    render(<PostImage src={SRC} alt="Tall feed screenshot" variant="feed" />);
    loadFeedImage(1000, 4000);
    const image = screen.getByRole("img", { name: "Tall feed screenshot" });
    expect(ratioOf(image.parentElement as HTMLElement)).toBe(1);
    expect(image.closest("button")).toHaveClass("w-full");
    expect(screen.getByText("View full image")).toBeInTheDocument();
    fireEvent.click(image.closest("button")!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(image).toHaveClass("object-cover");
  });

  it.each([[1200, 1200], [1600, 900], [2400, 600]])(
    "preserves square and landscape proportions (%i x %i)", (width, height) => {
      render(<PostImage src={SRC} alt="Feed photo" variant="feed" />);
      loadFeedImage(width, height);
      const image = screen.getByRole("img", { name: "Feed photo" });
      expect(ratioOf(image.parentElement as HTMLElement)).toBeCloseTo(width / height);
      expect(image.closest("button")).toHaveClass("w-full");
      expect(image.closest("button")?.style.width).toBe("");
      expect(screen.queryByText("View full image")).toBeNull();
    }
  );

  it("uses a compact crop for article thumbnails", () => {
    render(<PostImage src={SRC} alt="An article cover" variant="feed-thumbnail" />);

    expect(screen.getByRole("img", { name: "An article cover" }).parentElement).toHaveClass(
      "aspect-[4/3]",
      "sm:aspect-[16/10]",
    );
  });

});
