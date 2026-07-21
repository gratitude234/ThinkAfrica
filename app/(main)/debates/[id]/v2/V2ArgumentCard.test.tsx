import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  toggleDebateReactionV2Action: vi.fn(),
}));

import V2ArgumentCard from "./V2ArgumentCard";
import { makeArgument } from "./testFixtures";

describe("V2ArgumentCard", () => {
  it("renders the claim before the body content", () => {
    const argument = makeArgument({ claim: "The claim goes first", content: "The body content goes after." });
    const { container } = render(
      <V2ArgumentCard
        argument={argument}
        debateId="debate-1"
        currentUserId="viewer-1"
        isDebateActive
        canRebut={false}
        onReactionSuccess={vi.fn()}
      />
    );

    const text = container.textContent ?? "";
    expect(text.indexOf("The claim goes first")).toBeLessThan(text.indexOf("The body content goes after."));
  });

  it("renders an http(s) source as a real link", () => {
    const argument = makeArgument({
      sources: [{ id: "src-1", url: "https://example.com/report", title: "A report", publisher: null, publishedAt: null, quotedText: null }],
    });
    render(
      <V2ArgumentCard argument={argument} debateId="debate-1" currentUserId="viewer-1" isDebateActive canRebut={false} onReactionSuccess={vi.fn()} />
    );

    const link = screen.getByRole("link", { name: "A report" });
    expect(link).toHaveAttribute("href", "https://example.com/report");
  });

  it("never turns an unsafe protocol (javascript:) into a clickable link", () => {
    const argument = makeArgument({
      sources: [{ id: "src-1", url: "javascript:alert(1)", title: null, publisher: null, publishedAt: null, quotedText: null }],
    });
    render(
      <V2ArgumentCard argument={argument} debateId="debate-1" currentUserId="viewer-1" isDebateActive canRebut={false} onReactionSuccess={vi.fn()} />
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Source link unavailable")).toBeInTheDocument();
  });

  it("shows the parent/relation context for a rebuttal", () => {
    const argument = makeArgument({
      entryType: "rebuttal",
      relationType: "challenges",
      parent: { id: "parent-1", claim: "The opposing claim", authorName: "Grace Hopper", stance: "against" },
    });
    render(
      <V2ArgumentCard argument={argument} debateId="debate-1" currentUserId="viewer-1" isDebateActive canRebut={false} onReactionSuccess={vi.fn()} />
    );

    expect(screen.getByText(/Challenges/)).toBeInTheDocument();
    expect(screen.getByText(/Grace Hopper/)).toBeInTheDocument();
    expect(screen.getByText(/The opposing claim/)).toBeInTheDocument();
  });

  it("offers a 'Rebut this' action only when the caller can currently rebut", () => {
    const argument = makeArgument();
    const onRebut = vi.fn();
    const { rerender } = render(
      <V2ArgumentCard argument={argument} debateId="debate-1" currentUserId="viewer-1" isDebateActive canRebut={false} onRebut={onRebut} onReactionSuccess={vi.fn()} />
    );
    expect(screen.queryByRole("button", { name: "Rebut this" })).not.toBeInTheDocument();

    rerender(
      <V2ArgumentCard argument={argument} debateId="debate-1" currentUserId="viewer-1" isDebateActive canRebut onRebut={onRebut} onReactionSuccess={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Rebut this" })).toBeInTheDocument();
  });
});
