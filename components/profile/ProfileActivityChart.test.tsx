import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProfileActivityChart from "./ProfileActivityChart";

describe("profile publication activity", () => {
  it("draws a zero month at zero and exposes its year and value by touch/keyboard", () => {
    render(
      <ProfileActivityChart
        activity={[
          { month: "2025-12", count: 3 },
          { month: "2026-01", count: 0 },
        ]}
      />,
    );
    const zero = screen.getByRole("button", {
      name: "January 2026: 0 published works",
    });
    expect(zero.querySelector(".profile-activity-bar")).toHaveStyle({
      height: "0px",
    });
    fireEvent.focus(zero);
    expect(screen.getByRole("status")).toHaveTextContent(
      "January 2026 · 0 published works",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "December 2025: 3 published works" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "December 2025 · 3 published works",
    );
  });
  it("uses an honest empty state with no fictitious bars", () => {
    render(
      <ProfileActivityChart activity={[{ month: "2026-01", count: 0 }]} />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/This record will grow/)).toBeInTheDocument();
  });
});
