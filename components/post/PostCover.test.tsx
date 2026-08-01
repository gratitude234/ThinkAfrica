import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PostCover from "./PostCover";

const SRC = "https://example.supabase.co/storage/v1/object/public/post-images/a.jpg";

function ratioOf(el: HTMLElement) {
  // jsdom serializes `aspect-ratio: 0.8` as "0.8 / 1", so compare numbers.
  const [width, height = "1"] = el.style.aspectRatio.split("/");
  return Number(width) / Number(height);
}

function loadWith(img: HTMLImageElement, naturalWidth: number, naturalHeight: number) {
  Object.defineProperty(img, "naturalWidth", { value: naturalWidth, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: naturalHeight, configurable: true });
  fireEvent.load(img);
}

describe("PostCover", () => {
  it("reserves a 16/9 box in natural mode before the image reports its size", () => {
    render(<PostCover src={SRC} alt="Attached image" fit="natural" />);

    const box = screen.getByRole("img").parentElement as HTMLElement;
    expect(ratioOf(box)).toBeCloseTo(16 / 9);
  });

  it("adopts the image's own ratio so a portrait photo stays portrait", () => {
    render(<PostCover src={SRC} alt="Attached image" fit="natural" />);

    const img = screen.getByRole("img") as HTMLImageElement;
    loadWith(img, 1080, 1350); // 4:5

    const box = img.parentElement as HTMLElement;
    expect(ratioOf(box)).toBeCloseTo(1080 / 1350);
  });

  it("clamps extremes rather than letting a panorama or a tall screenshot run away", () => {
    const { unmount } = render(<PostCover src={SRC} alt="Panorama" fit="natural" />);
    loadWith(screen.getByRole("img") as HTMLImageElement, 3000, 500);
    expect(ratioOf(screen.getByRole("img").parentElement as HTMLElement)).toBeCloseTo(16 / 9);
    unmount();

    render(<PostCover src={SRC} alt="Tall screenshot" fit="natural" />);
    loadWith(screen.getByRole("img") as HTMLImageElement, 1080, 2340);
    expect(ratioOf(screen.getByRole("img").parentElement as HTMLElement)).toBeCloseTo(3 / 4);
  });

  it("leaves the caller's aspect box alone outside natural mode", () => {
    const { container } = render(
      <PostCover src={SRC} alt="Cover" className="aspect-[16/9] w-full" />
    );

    const box = container.firstElementChild as HTMLElement;
    expect(box.style.aspectRatio).toBe("");
    expect(box.className).toContain("aspect-[16/9]");
  });
});
