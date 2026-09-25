import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ImageDetailsPanel from "./ImageDetailsPanel";

const chart = { src: "https://example.com/chart.png", alt: "", caption: "" };

describe("ImageDetailsPanel", () => {
  it("edits the caption and alt text of the selected image", () => {
    const onChange = vi.fn();
    render(<ImageDetailsPanel image={chart} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Caption"), { target: { value: "Lagos, 2026" } });
    expect(onChange).toHaveBeenCalledWith({ caption: "Lagos, 2026" });

    fireEvent.change(screen.getByLabelText("Alt text"), { target: { value: "A bar chart" } });
    expect(onChange).toHaveBeenCalledWith({ alt: "A bar chart" });
  });

  it("says what alt text is for", () => {
    render(<ImageDetailsPanel image={chart} onChange={vi.fn()} />);

    expect(screen.getByRole("region", { name: "Image details" })).toBeInTheDocument();
    expect(screen.getByText(/Read aloud by screen readers/)).toBeInTheDocument();
  });
});
