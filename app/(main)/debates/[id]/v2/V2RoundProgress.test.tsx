import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import V2RoundProgress from "./V2RoundProgress";
import { makeRound } from "./testFixtures";

describe("V2RoundProgress", () => {
  it("gives every round an accessible text status label, not just a color/icon", () => {
    const rounds = [
      makeRound({ id: "r1", sequenceNumber: 1, phase: "opening", status: "completed" }),
      makeRound({ id: "r2", sequenceNumber: 2, phase: "rebuttal", status: "active" }),
      makeRound({ id: "r3", sequenceNumber: 3, phase: "cross_examination", status: "scheduled" }),
      makeRound({ id: "r4", sequenceNumber: 4, phase: "closing", status: "scheduled" }),
      makeRound({ id: "r5", sequenceNumber: 5, phase: "final_vote", status: "cancelled" }),
    ];

    render(<V2RoundProgress rounds={rounds} />);

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Active now")).toBeInTheDocument();
    expect(screen.getAllByText("Scheduled")).toHaveLength(2);
    expect(screen.getByText("Cancelled")).toBeInTheDocument();

    // Every status icon is decorative -- the adjacent text label carries the meaning.
    const icons = document.querySelectorAll('[aria-hidden="true"]');
    expect(icons.length).toBeGreaterThanOrEqual(5);
  });

  it("exposes the rail as an accessible list", () => {
    render(<V2RoundProgress rounds={[makeRound()]} />);

    expect(screen.getByRole("list", { name: "Debate round progress" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});
