import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import IntellectualRecordWelcome from "./IntellectualRecordWelcome";

describe("IntellectualRecordWelcome", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/explore?welcome=1");
  });

  it("connects discovery to the first Intellectual Record contribution", () => {
    render(<IntellectualRecordWelcome />);

    expect(
      screen.getByRole("heading", {
        name: "Your Intellectual Record starts with one contribution.",
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Publish an idea" })).toHaveAttribute(
      "href",
      "/write"
    );
    expect(screen.getByRole("link", { name: "Read responses" })).toHaveAttribute(
      "href",
      "/responses"
    );
    expect(screen.getByRole("link", { name: "Join a debate" })).toHaveAttribute(
      "href",
      "/debates"
    );
    expect(window.location.search).toBe("");
  });

  it("can be dismissed", () => {
    render(<IntellectualRecordWelcome />);

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss getting started guide" })
    );

    expect(
      screen.queryByText("Your Intellectual Record starts with one contribution.")
    ).not.toBeInTheDocument();
  });
});
