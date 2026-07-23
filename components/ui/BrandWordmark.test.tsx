import type { ImgHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BrandWordmark from "./BrandWordmark";

vi.mock("next/image", () => ({
  default: ({ alt, ...rest }: ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...rest} />
  ),
}));

describe("BrandWordmark", () => {
  it("renders the real 'Indegenius' text (a readable horizontal wordmark), not just the icon", () => {
    render(<BrandWordmark />);
    expect(screen.getByText("Indegenius")).toBeInTheDocument();
  });

  it("marks the icon glyph decorative so the accessible name comes from the visible text / the Link's aria-label", () => {
    render(<BrandWordmark />);
    const icon = screen.getByRole("presentation", { hidden: true });
    expect(icon).toHaveAttribute("alt", "");
  });

  it("never stretches the icon -- it always keeps the square source aspect ratio", () => {
    render(<BrandWordmark />);
    const icon = document.querySelector("img")!;
    expect(icon).toHaveAttribute("width", "924");
    expect(icon).toHaveAttribute("height", "924");
  });

  it("can render text-only where the icon genuinely doesn't fit (mobile top bar)", () => {
    render(<BrandWordmark showIcon={false} />);
    expect(screen.getByText("Indegenius")).toBeInTheDocument();
    expect(document.querySelector("img")).not.toBeInTheDocument();
  });

  it("switches to white text/icon on dark surfaces", () => {
    render(<BrandWordmark tone="white" />);
    expect(screen.getByText("Indegenius")).toHaveClass("text-white");
    expect(document.querySelector("img")).toHaveAttribute(
      "src",
      "/brand/indegenius-icon-only-white.svg"
    );
  });
});
