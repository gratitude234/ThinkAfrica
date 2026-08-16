import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MobileOpportunitiesBanner from "./MobileOpportunitiesBanner";

describe("MobileOpportunitiesBanner", () => {
  it("links mobile visitors to Opportunities and summarizes available signals", () => {
    render(
      <MobileOpportunitiesBanner
        openProfileCount={12}
        openFellowshipCount={3}
      />
    );

    const link = screen.getByRole("link", { name: /Opportunities/i });
    expect(link).toHaveAttribute("href", "/opportunities");
    expect(link).toHaveClass("lg:hidden");
    expect(screen.getByText("12 open profiles · 3 curated openings")).toBeInTheDocument();
  });

  it("keeps the destination discoverable when there are no current signals", () => {
    render(
      <MobileOpportunitiesBanner
        openProfileCount={0}
        openFellowshipCount={0}
      />
    );

    expect(
      screen.getByText("Discover openings and make your profile visible.")
    ).toBeInTheDocument();
  });
});
