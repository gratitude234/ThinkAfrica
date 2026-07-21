import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const joinDebateV2ActionMock = vi.fn();

vi.mock("./actions", () => ({
  joinDebateV2Action: (...args: unknown[]) => joinDebateV2ActionMock(...args),
}));

import V2Lobby from "./V2Lobby";
import type { DebateV2CurrentUserMembership, DebateV2MembershipCounts } from "./types";

function membership(overrides: Partial<DebateV2CurrentUserMembership> = {}): DebateV2CurrentUserMembership {
  return { debaterStance: null, isJuror: false, isModeratorMember: false, ...overrides };
}

const counts: DebateV2MembershipCounts = { debatersFor: 2, debatersAgainst: 1, jurors: 4 };

describe("V2Lobby", () => {
  beforeEach(() => {
    joinDebateV2ActionMock.mockReset();
    joinDebateV2ActionMock.mockResolvedValue({ ok: true, data: { role: "debater", stance: "for", already_joined: false } });
  });

  it("shows a sign-in prompt and no join controls for an anonymous visitor", () => {
    render(
      <V2Lobby debateId="debate-1" isAuthenticated={false} membership={membership()} membershipCounts={counts} onSuccess={vi.fn()} />
    );

    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Argue FOR")).not.toBeInTheDocument();
  });

  it("requires an explicit permanent-stance confirmation before joining as a debater", async () => {
    const user = userEvent.setup();
    render(
      <V2Lobby debateId="debate-1" isAuthenticated membership={membership()} membershipCounts={counts} onSuccess={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Argue FOR" }));

    expect(joinDebateV2ActionMock).not.toHaveBeenCalled();
    expect(screen.getByText(/permanent/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm For" }));

    expect(joinDebateV2ActionMock).toHaveBeenCalledWith("debate-1", "debater", "for");
  });

  it("calls onSuccess and never assumes the requested stance won -- it just triggers a refresh", async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(
      <V2Lobby debateId="debate-1" isAuthenticated membership={membership()} membershipCounts={counts} onSuccess={onSuccess} />
    );

    await user.click(screen.getByRole("button", { name: "Argue AGAINST" }));
    await user.click(screen.getByRole("button", { name: "Confirm Against" }));

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("renders the persisted stance as locked and hides the stance-picker once already a debater", () => {
    render(
      <V2Lobby
        debateId="debate-1"
        isAuthenticated
        membership={membership({ debaterStance: "against" })}
        membershipCounts={counts}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText(/Arguing Against/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Argue FOR" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Argue AGAINST" })).not.toBeInTheDocument();
  });

  it("lets a juror join with no stance selection at all", async () => {
    const user = userEvent.setup();
    render(
      <V2Lobby debateId="debate-1" isAuthenticated membership={membership()} membershipCounts={counts} onSuccess={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Join as juror" }));

    expect(joinDebateV2ActionMock).toHaveBeenCalledWith("debate-1", "juror");
  });

  it("shows a clean error message instead of raw RPC internals when a join fails", async () => {
    joinDebateV2ActionMock.mockResolvedValue({ ok: false, error: "This debate is closed to new participants." });
    const user = userEvent.setup();
    render(
      <V2Lobby debateId="debate-1" isAuthenticated membership={membership()} membershipCounts={counts} onSuccess={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Join as juror" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This debate is closed to new participants.");
  });
});
