import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FeedFilterChips from "./FeedFilterChips";

describe("FeedFilterChips", () => {
  it("shows exactly the three content kinds plus All", () => {
    render(<FeedFilterChips type="all" onTypeChange={vi.fn()} />);

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "All",
      "Posts",
      "Articles",
      "Research",
    ]);
    expect(screen.queryByText("Policy Briefs")).not.toBeInTheDocument();
    expect(screen.queryByText("Quick Takes")).not.toBeInTheDocument();
  });

  it("announces selection and emits the canonical filter value", () => {
    const onChange = vi.fn();
    render(<FeedFilterChips type="article" onTypeChange={onChange} />);

    expect(screen.getByRole("button", { name: "Articles" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "Posts" }));
    expect(onChange).toHaveBeenCalledWith("post");
  });
});
