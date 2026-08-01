import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ImageLightbox from "./ImageLightbox";

const SRC = "https://example.supabase.co/storage/v1/object/public/post-images/a.jpg";

function Harness({ onClosed }: { onClosed?: () => void } = {}) {
  return (
    <ImageLightbox
      src={SRC}
      alt="A screenshot"
      open
      onClose={onClosed ?? (() => {})}
    />
  );
}

afterEach(() => {
  document.body.style.overflow = "";
});

describe("ImageLightbox", () => {
  it("renders nothing when closed", () => {
    render(<ImageLightbox src={SRC} alt="A screenshot" open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the original image in a labelled modal dialog", () => {
    render(<Harness />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Image: A screenshot");
    expect(screen.getByRole("img", { name: "A screenshot" }).getAttribute("src")).toBe(SRC);
    expect(screen.getByRole("link", { name: "Open original" }).getAttribute("href")).toBe(SRC);
  });

  it("locks page scroll while open and restores it on close", () => {
    const { rerender } = render(<Harness />);
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<ImageLightbox src={SRC} alt="A screenshot" open={false} onClose={() => {}} />);
    expect(document.body.style.overflow).toBe("");
  });

  it("focuses the close button so keyboard users land inside the viewer", () => {
    render(<Harness />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close image viewer" }));
  });

  it("closes on Escape, on the close button, and on a backdrop tap", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Harness onClosed={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Close image viewer" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(3);

    rerender(<ImageLightbox src={SRC} alt="A screenshot" open={false} onClose={onClose} />);
  });

  it("closes on a back gesture instead of leaving the page", () => {
    const onClose = vi.fn();
    const entries = window.history.length;
    render(<Harness onClosed={onClose} />);

    // Opening owns a history entry, so back has something to pop.
    expect(window.history.length).toBeGreaterThan(entries);
    expect(window.history.state?.indegeniusImageViewer).toBe(true);

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("rewinds its own history entry when closed by button rather than by back", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { rerender } = render(<Harness />);

    rerender(<ImageLightbox src={SRC} alt="A screenshot" open={false} onClose={() => {}} />);
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it("does not rewind history twice when the back gesture closed it", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { rerender } = render(<Harness />);

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    rerender(<ImageLightbox src={SRC} alt="A screenshot" open={false} onClose={() => {}} />);

    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it("toggles zoom from the control and from a double click", () => {
    render(<Harness />);
    const zoom = screen.getByRole("button", { name: "Zoom" });
    const image = screen.getByRole("img", { name: "A screenshot" });

    expect(image.className).toContain("object-contain");
    fireEvent.click(zoom);
    expect(screen.getByRole("img", { name: "A screenshot" }).className).toContain("max-w-none");

    fireEvent.doubleClick(screen.getByRole("img", { name: "A screenshot" }));
    expect(screen.getByRole("img", { name: "A screenshot" }).className).toContain("object-contain");
  });

  it("dismisses on a downward swipe but not on a short drag", () => {
    const onClose = vi.fn();
    render(<Harness onClosed={onClose} />);
    const surface = screen.getByRole("img", { name: "A screenshot" }).parentElement as HTMLElement;

    fireEvent.touchStart(surface, { touches: [{ clientY: 300 }] });
    fireEvent.touchMove(surface, { touches: [{ clientY: 330 }] });
    fireEvent.touchEnd(surface);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.touchStart(surface, { touches: [{ clientY: 300 }] });
    fireEvent.touchMove(surface, { touches: [{ clientY: 450 }] });
    fireEvent.touchEnd(surface);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
