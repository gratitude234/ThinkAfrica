import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RecordPanel from "./RecordPanel";

const stats = {
  contributionCount: 12,
  sourceBackedCount: 5,
  citableCount: 2,
};

describe("RecordPanel", () => {
  it("leads with volume, rigour and permanence", () => {
    render(
      <RecordPanel
        stats={stats}
        badges={[]}
        displayName="A Student"
        isOwnProfile={false}
      />
    );

    expect(screen.getByText("Contributions")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Source-backed")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Citable")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  // The record is the page's single claim about how much work exists. Adding
  // a fourth figure here is what previously turned it into an undifferentiated
  // grid nobody could read in three seconds.
  it("shows exactly three figures", () => {
    const { container } = render(
      <RecordPanel
        stats={stats}
        badges={[]}
        displayName="A Student"
        isOwnProfile={false}
      />
    );

    expect(container.querySelectorAll(".tabular-nums")).toHaveLength(3);
  });

  it("renders evidence badges when the record has any", () => {
    render(
      <RecordPanel
        stats={stats}
        badges={[
          { key: "citable", label: "Citable work", tone: "sky" },
          { key: "reviewed", label: "Reviewed work", tone: "purple" },
        ]}
        displayName="A Student"
        isOwnProfile={false}
      />
    );

    expect(screen.getByText("Citable work")).toBeInTheDocument();
    expect(screen.getByText("Reviewed work")).toBeInTheDocument();
  });

  it("replaces the figures with a plain line when nothing is published", () => {
    render(
      <RecordPanel
        stats={{
          contributionCount: 0,
          sourceBackedCount: 0,
          citableCount: 0,
        }}
        badges={[]}
        displayName="A Student"
        isOwnProfile={false}
      />
    );

    expect(
      screen.getByText("A Student has not published a contribution yet.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Contributions")).not.toBeInTheDocument();
  });

  it("prompts the owner instead of showing them a row of zeros", () => {
    render(
      <RecordPanel
        stats={{
          contributionCount: 0,
          sourceBackedCount: 0,
          citableCount: 0,
        }}
        badges={[]}
        displayName="A Student"
        isOwnProfile
      />
    );

    expect(
      screen.getByText("Your record starts with your first published idea.")
    ).toBeInTheDocument();
  });
});
