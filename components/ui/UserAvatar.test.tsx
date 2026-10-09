import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import UserAvatar from "./UserAvatar";

describe("UserAvatar image fallbacks", () => {
  it("shows a generated avatar after a failed image and can display a replacement source", () => {
    const { rerender } = render(<UserAvatar name="Amara" src="/missing.png" />);
    fireEvent.error(screen.getByRole("img", { name: "Amara" }));
    expect(screen.getByRole("img", { name: "Amara" }).querySelector("svg")).toBeTruthy();
    rerender(<UserAvatar name="Amara" src="/replacement.png" />);
    expect(screen.getByRole("img", { name: "Amara" })).toHaveAttribute("src", "/replacement.png");
  });

  it("shows the generated avatar when a cached failure finishes before hydration", () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    const naturalWidth = vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(0);
    try {
      render(<UserAvatar name="Amara" src="/cached-missing.png" />);
      expect(screen.getByRole("img", { name: "Amara" }).querySelector("svg")).toBeTruthy();
    } finally {
      complete.mockRestore();
      naturalWidth.mockRestore();
    }
  });
});
