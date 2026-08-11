import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ExpandablePostBody from "./ExpandablePostBody";

describe("ExpandablePostBody", () => {
  it("leaves short Posts open without a redundant control", () => {
    render(
      <ExpandablePostBody
        text="A short observation."
        href="/post/short-observation"
      />
    );

    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/post/short-observation"
    );
  });

  it("clamps a long Post to four lines and expands it in place", () => {
    const text = "A careful observation about campus life, public trust, and the choices students make together. ".repeat(4);
    const { container } = render(
      <ExpandablePostBody text={text} href="/post/long-observation" />
    );

    const paragraph = container.querySelector("p");
    expect(paragraph).toHaveClass("line-clamp-4");

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(paragraph).not.toHaveClass("line-clamp-4");
    expect(screen.getByRole("button", { name: "Less" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: "Less" }));
    expect(paragraph).toHaveClass("line-clamp-4");
  });
});
