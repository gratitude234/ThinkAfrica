import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toggleDebateReactionV2ActionMock = vi.fn();

vi.mock("./actions", () => ({
  toggleDebateReactionV2Action: (...args: unknown[]) => toggleDebateReactionV2ActionMock(...args),
}));

import V2ReactionBar from "./V2ReactionBar";

function renderBar(overrides: Partial<Parameters<typeof V2ReactionBar>[0]> = {}) {
  return render(
    <V2ReactionBar
      debateId="debate-1"
      argumentId="arg-1"
      authorId="author-1"
      currentUserId="viewer-1"
      isDebateActive
      counts={{}}
      currentUserReactions={[]}
      onSuccess={vi.fn()}
      {...overrides}
    />
  );
}

// "Well-supported"/"Strong rebuttal"/"Changed my mind" are top-level pills
// that are ALSO duplicated inside the always-in-DOM (native <details>)
// "More" panel, so any query for them can match twice -- the first match is
// always the visible top-level pill, since it appears earlier in the DOM.
function topPill(name: RegExp) {
  return screen.getAllByRole("button", { name })[0];
}

describe("V2ReactionBar", () => {
  beforeEach(() => {
    toggleDebateReactionV2ActionMock.mockReset();
    toggleDebateReactionV2ActionMock.mockResolvedValue({
      ok: true,
      data: { argument_id: "arg-1", reacted: true, reaction_type: "well_supported", counts: {} },
    });
  });

  it("disables every reaction (including inside the expanded picker) and explains why on the author's own argument", async () => {
    const user = userEvent.setup();
    renderBar({ authorId: "viewer-1", currentUserId: "viewer-1" });

    expect(screen.getByText("Your argument")).toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { name: /Well-supported/ })) {
      expect(button).toBeDisabled();
    }

    await user.click(screen.getByText("More"));
    expect(screen.getByRole("button", { name: /Needs evidence/ })).toBeDisabled();
  });

  it("disables reactions and prompts sign-in for an anonymous viewer", () => {
    renderBar({ currentUserId: null });

    expect(screen.getByText("Sign in to react")).toBeInTheDocument();
    expect(topPill(/Well-supported/)).toBeDisabled();
  });

  it("toggles a top-level reaction and reconciles with the server afterward", async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderBar({ onSuccess });

    await user.click(topPill(/Well-supported/));

    expect(toggleDebateReactionV2ActionMock).toHaveBeenCalledWith("debate-1", "arg-1", "well_supported");
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("keeps 'Needs evidence' visually and semantically distinct from the positive reactions", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByText("More"));
    const needsEvidence = screen.getByRole("button", { name: /Needs evidence/ });

    expect(needsEvidence).toBeInTheDocument();
    // A positive reaction (well_supported) and the critical one (needs_evidence)
    // must not share the same "reacted" styling class -- see V2ReactionBar's
    // pillClasses/CRITICAL_REACTION_TYPES split.
    await user.click(needsEvidence);
    expect(toggleDebateReactionV2ActionMock).toHaveBeenCalledWith("debate-1", "arg-1", "needs_evidence");
  });

  it("disables only the pending reaction type while its request is in flight", async () => {
    let resolveToggle: (value: unknown) => void = () => {};
    toggleDebateReactionV2ActionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveToggle = resolve;
      })
    );
    const user = userEvent.setup();
    renderBar();

    await user.click(topPill(/Well-supported/));

    expect(topPill(/Well-supported/)).toBeDisabled();
    for (const button of screen.getAllByRole("button", { name: /Strong rebuttal/ })) {
      expect(button).not.toBeDisabled();
    }

    resolveToggle({ ok: true, data: {} });
  });
});
