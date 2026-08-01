import { describe, expect, it } from "vitest";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import PostImage from "./PostImage";

const SRC = "https://example.supabase.co/storage/v1/object/public/post-images/a.jpg";

/**
 * Hydration, not `render()`, is what caught this: in a real browser the feed
 * image is usually already decoded by the time React attaches the ref, so
 * `node.complete` is true and the measurement runs on attach.
 *
 * next/image rebuilds its internal ref whenever the `onError` identity changes
 * and merges it with ours, so an unstable handler makes React re-attach
 * `measureRef` on every render. That re-measurement must be a no-op when the
 * image's dimensions have not changed -- otherwise attach -> setState ->
 * render -> attach loops until React throws "Maximum update depth exceeded",
 * which takes the whole feed down to app/(main)/error.tsx.
 */
describe("PostImage hydration", () => {
  it("hydrates an already-decoded image without looping", async () => {
    const recoverable: unknown[] = [];

    const element = (
      <PostImage src={SRC} alt="A tall screenshot" wrapperClassName="mt-3" className="w-full" />
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.appendChild(container);

    const img = container.querySelector("img") as HTMLImageElement;
    Object.defineProperty(img, "complete", { value: true, configurable: true });
    Object.defineProperty(img, "naturalWidth", { value: 1080, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: 2340, configurable: true });

    await act(async () => {
      hydrateRoot(container, element, {
        onRecoverableError: (error) => recoverable.push(error),
      });
    });

    expect(recoverable).toEqual([]);
    // 1080x2340 is far taller than the 3/4 clamp, so the crop hint is shown.
    expect(container.querySelector("[title='Tap to see the whole image']")).toBeTruthy();
    expect(container.querySelector("[style*='aspect-ratio']")).toBeTruthy();

    document.body.removeChild(container);
  });
});
