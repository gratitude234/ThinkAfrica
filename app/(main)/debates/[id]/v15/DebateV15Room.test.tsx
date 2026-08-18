import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const submitDebateArgumentV15ActionMock = vi.fn();
const castFinalVoteV15ActionMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
}));

vi.mock("./actions", () => ({
  advanceDebatePhaseV15Action: vi.fn(),
  cancelDebateV15Action: vi.fn(),
  castFinalVoteV15Action: (...args: unknown[]) =>
    castFinalVoteV15ActionMock(...args),
  completeDebateV15Action: vi.fn(),
  extendDeadlineV15Action: vi.fn(),
  inviteDebaterV15Action: vi.fn(),
  remindVotersV15Action: vi.fn(),
  respondToDebateInvitationV15Action: vi.fn(),
  retryDebateRecapV15Action: vi.fn(),
  revokeDebateInvitationV15Action: vi.fn(),
  searchDebatersV15Action: vi.fn(),
  startDebateV15Action: vi.fn(),
  submitDebateArgumentV15Action: (...args: unknown[]) =>
    submitDebateArgumentV15ActionMock(...args),
  toggleArgumentUpvoteV15Action: vi.fn(),
}));

import DebateV15Room from "./DebateV15Room";
import type { DebateV15Phase, DebateV15RoomData } from "./types";

const BASE_NOW = new Date("2026-08-01T12:00:00.000Z").getTime();
const DEBATE_ID = "debate-1";
const USER_ID = "user-1";

function makeRoom(
  overrides: {
    phase?: DebateV15Phase;
    openingDeadline?: string | null;
    loadedAt?: number;
  } = {}
): DebateV15RoomData {
  const phase = overrides.phase ?? "opening";
  return {
    loadedAt: overrides.loadedAt ?? BASE_NOW,
    debate: {
      id: DEBATE_ID,
      title: "African cities should make public transport free",
      description: "A motion about urban mobility funding.",
      tags: [],
      status: "active",
      phase,
      moderatorId: "moderator-1",
      moderator: {
        id: "moderator-1",
        username: "mod",
        fullName: "Moderator One",
        university: null,
        avatarUrl: null,
      },
      recruitingDeadline: new Date(BASE_NOW - 86_400_000).toISOString(),
      openingDeadline:
        overrides.openingDeadline === undefined
          ? new Date(BASE_NOW + 5 * 60_000).toISOString()
          : overrides.openingDeadline,
      rebuttalDeadline: new Date(BASE_NOW + 86_400_000).toISOString(),
      votingDeadline: new Date(BASE_NOW + 2 * 86_400_000).toISOString(),
      cancellationReason: null,
      cancelledAt: null,
      forVotes: 0,
      againstVotes: 0,
      recapStatus: "none",
      recapText: null,
      recapKeyDisagreement: null,
      recapAgreement: null,
      recapStrongestFor: null,
      recapStrongestAgainst: null,
      recapError: null,
    },
    currentUserId: USER_ID,
    isManager: false,
    slots: [
      {
        userId: USER_ID,
        stance: "for",
        status: "accepted",
        invitedAt: new Date(BASE_NOW - 172_800_000).toISOString(),
        respondedAt: new Date(BASE_NOW - 86_400_000).toISOString(),
        profile: {
          id: USER_ID,
          username: "debater",
          fullName: "Debater One",
          university: null,
          avatarUrl: null,
        },
      },
    ],
    arguments: [],
    userUpvotedArgumentIds: [],
    userFinalVote: null,
    relatedDebates: [],
  };
}

describe("DebateV15Room", () => {
  beforeEach(() => {
    submitDebateArgumentV15ActionMock.mockReset();
    castFinalVoteV15ActionMock.mockReset();
    refreshMock.mockReset();
    window.localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("keeps compact debate context when the primary nav retreats", () => {
    const { container } = render(<DebateV15Room room={makeRoom()} />);

    expect(container.querySelector("header[data-app-context-nav]")).toHaveAttribute(
      "data-app-chrome-motion"
    );
    expect(container.querySelector("[data-app-context-remove] button")).toHaveTextContent(
      "Share"
    );
  });

  it("keeps an unsent draft on screen when the submission deadline passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_NOW);

    render(<DebateV15Room room={makeRoom()} />);

    const textarea = screen.getByLabelText("Argument");
    fireEvent.change(textarea, {
      target: { value: "Free transport unlocks access to work and school." },
    });

    // The clock ticks past the opening deadline while the debater is typing.
    act(() => {
      vi.setSystemTime(BASE_NOW + 10 * 60_000);
      vi.advanceTimersByTime(60_000);
    });

    // The composer must not unmount — that would destroy the unsent argument.
    expect(screen.getByLabelText("Argument")).toHaveValue(
      "Free transport unlocks access to work and school."
    );
    expect(
      screen.getByText("The opening deadline passed before this was submitted.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy my draft" })
    ).toBeInTheDocument();
  });

  it("warns the debater while the deadline is close", () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_NOW);

    render(<DebateV15Room room={makeRoom()} />);

    expect(
      screen.getByText("Only 5 minutes left to submit your opening.")
    ).toBeInTheDocument();
  });

  it("restores a draft saved on this device", async () => {
    window.localStorage.setItem(
      `v15-draft:${DEBATE_ID}:opening:${USER_ID}`,
      JSON.stringify({
        content: "A draft recovered after the tab was closed.",
        sources: [{ url: "https://example.org/report", title: "Report" }],
      })
    );

    render(<DebateV15Room room={makeRoom()} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Argument")).toHaveValue(
        "A draft recovered after the tab was closed."
      );
    });
    expect(
      screen.getByText("We restored the draft you had saved on this device.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Source 1 URL")).toHaveValue(
      "https://example.org/report"
    );
  });

  it("moves focus to the feedback banner when a submission fails", async () => {
    submitDebateArgumentV15ActionMock.mockResolvedValue({
      ok: false,
      message: "The opening deadline has passed.",
    });

    render(<DebateV15Room room={makeRoom()} />);

    fireEvent.change(screen.getByLabelText("Argument"), {
      target: { value: "An argument that the server will reject." },
    });
    fireEvent.click(
      screen.getByLabelText(
        "I have reviewed my argument and understand that submission is final."
      )
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Submit final opening" })
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The opening deadline has passed.");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("clears the stored draft once the argument is accepted", async () => {
    submitDebateArgumentV15ActionMock.mockResolvedValue({ ok: true });
    const storageKey = `v15-draft:${DEBATE_ID}:opening:${USER_ID}`;

    render(<DebateV15Room room={makeRoom()} />);

    fireEvent.change(screen.getByLabelText("Argument"), {
      target: { value: "A complete opening case for the motion." },
    });
    fireEvent.click(
      screen.getByLabelText(
        "I have reviewed my argument and understand that submission is final."
      )
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Submit final opening" })
    );

    expect(
      await screen.findByText(
        "Your opening argument is submitted and locked on the record."
      )
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(window.localStorage.getItem(storageKey)).toBeNull()
    );
    expect(refreshMock).toHaveBeenCalled();
  });

  it("explains why submission is blocked instead of silently disabling it", () => {
    render(<DebateV15Room room={makeRoom()} />);

    expect(
      screen.getByText("Write your argument to enable submission.")
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Argument"), {
      target: { value: "A complete opening case for the motion." },
    });

    expect(
      screen.getByText("Tick the confirmation box to enable submission.")
    ).toBeInTheDocument();
  });

  it("confirms a final vote with the stance rather than a generic message", async () => {
    castFinalVoteV15ActionMock.mockResolvedValue({ ok: true });

    render(<DebateV15Room room={makeRoom({ phase: "voting" })} />);

    fireEvent.click(screen.getByRole("button", { name: /for the motion/i }));

    expect(
      await screen.findByText("Your final vote is recorded FOR the motion.")
    ).toBeInTheDocument();
  });
});
