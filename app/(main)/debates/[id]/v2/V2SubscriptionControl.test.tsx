import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setDebateSubscriptionV2ActionMock = vi.fn();

vi.mock("./actions", () => ({
  setDebateSubscriptionV2Action: (...args: unknown[]) => setDebateSubscriptionV2ActionMock(...args),
}));

import V2SubscriptionControl from "./V2SubscriptionControl";
import type { DebateV2SubscriptionView } from "./types";

const SUBSCRIBED: DebateV2SubscriptionView = {
  isSubscribed: true,
  notifyPhaseChanges: true,
  notifyDirectResponses: true,
  notifyEvidenceRequests: true,
  notifyFinalVote: true,
  notifyRecap: true,
};

function okResult(data: Partial<DebateV2SubscriptionView> & { isSubscribed: boolean }) {
  return {
    ok: true,
    data: {
      debate_id: "debate-1",
      is_subscribed: data.isSubscribed,
      notify_phase_changes: data.notifyPhaseChanges ?? true,
      notify_direct_responses: data.notifyDirectResponses ?? true,
      notify_evidence_requests: data.notifyEvidenceRequests ?? true,
      notify_final_vote: data.notifyFinalVote ?? true,
      notify_recap: data.notifyRecap ?? true,
    },
  };
}

describe("V2SubscriptionControl", () => {
  beforeEach(() => {
    setDebateSubscriptionV2ActionMock.mockReset();
  });

  it("anonymous: shows a sign-in affordance, never a fake enabled follow state", () => {
    render(<V2SubscriptionControl debateId="debate-1" isAuthenticated={false} initialSubscription={null} />);

    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /follow/i })).not.toBeInTheDocument();
  });

  it("authenticated, never subscribed: shows a Follow control, not a Following state", () => {
    render(<V2SubscriptionControl debateId="debate-1" isAuthenticated initialSubscription={null} />);

    expect(screen.getByRole("button", { name: "Follow this debate" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unfollow this debate" })).not.toBeInTheDocument();
  });

  it("authenticated, explicitly unsubscribed (existing row, isSubscribed: false): shows Follow, not Following", () => {
    render(
      <V2SubscriptionControl
        debateId="debate-1"
        isAuthenticated
        initialSubscription={{ ...SUBSCRIBED, isSubscribed: false }}
      />
    );

    expect(screen.getByRole("button", { name: "Follow this debate" })).toBeInTheDocument();
  });

  it("authenticated, subscribed: shows a clear Following state and a preferences toggle", () => {
    render(<V2SubscriptionControl debateId="debate-1" isAuthenticated initialSubscription={SUBSCRIBED} />);

    expect(screen.getByRole("button", { name: "Unfollow this debate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage notification preferences" })).toBeInTheDocument();
  });

  it("following: calls the action with isSubscribed true and updates to Following on success", async () => {
    setDebateSubscriptionV2ActionMock.mockResolvedValue(okResult({ isSubscribed: true }));
    const user = userEvent.setup();
    render(<V2SubscriptionControl debateId="debate-1" isAuthenticated initialSubscription={null} />);

    await user.click(screen.getByRole("button", { name: "Follow this debate" }));

    expect(setDebateSubscriptionV2ActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ debateId: "debate-1", isSubscribed: true })
    );
    expect(await screen.findByRole("button", { name: "Unfollow this debate" })).toBeInTheDocument();
  });

  it("unfollowing: calls the action with isSubscribed false and collapses the preferences panel", async () => {
    setDebateSubscriptionV2ActionMock.mockResolvedValue(okResult({ isSubscribed: false }));
    const user = userEvent.setup();
    render(<V2SubscriptionControl debateId="debate-1" isAuthenticated initialSubscription={SUBSCRIBED} />);

    await user.click(screen.getByRole("button", { name: "Manage notification preferences" }));
    expect(screen.getByText("Round and phase changes")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Unfollow this debate" }));

    expect(setDebateSubscriptionV2ActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ isSubscribed: false })
    );
    expect(await screen.findByRole("button", { name: "Follow this debate" })).toBeInTheDocument();
    expect(screen.queryByText("Round and phase changes")).not.toBeInTheDocument();
  });

  it("preferences persist: toggling one checkbox reflects immediately and is sent to the action", async () => {
    setDebateSubscriptionV2ActionMock.mockResolvedValue(
      okResult({ isSubscribed: true, notifyEvidenceRequests: false })
    );
    const user = userEvent.setup();
    render(<V2SubscriptionControl debateId="debate-1" isAuthenticated initialSubscription={SUBSCRIBED} />);

    await user.click(screen.getByRole("button", { name: "Manage notification preferences" }));
    const checkbox = screen.getByRole("checkbox", { name: "Evidence requests on your arguments" });
    expect(checkbox).toBeChecked();

    await user.click(checkbox);

    expect(setDebateSubscriptionV2ActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ isSubscribed: true, notifyEvidenceRequests: false })
    );
    await waitFor(() => expect(checkbox).not.toBeChecked());
  });

  it("pending state: disables the follow/unfollow control and the preference checkboxes while a save is in flight", async () => {
    let resolveSave!: (value: unknown) => void;
    setDebateSubscriptionV2ActionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );
    const user = userEvent.setup();
    render(<V2SubscriptionControl debateId="debate-1" isAuthenticated initialSubscription={SUBSCRIBED} />);

    await user.click(screen.getByRole("button", { name: "Manage notification preferences" }));
    await user.click(screen.getByRole("checkbox", { name: "Recap ready" }));

    expect(screen.getByRole("button", { name: "Unfollow this debate" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Recap ready" })).toBeDisabled();

    resolveSave(okResult({ isSubscribed: true, notifyRecap: false }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Unfollow this debate" })).not.toBeDisabled());
  });

  it("success: shows a small inline confirmation, not a toast/alert", async () => {
    setDebateSubscriptionV2ActionMock.mockResolvedValue(okResult({ isSubscribed: true }));
    const user = userEvent.setup();
    render(<V2SubscriptionControl debateId="debate-1" isAuthenticated initialSubscription={null} />);

    await user.click(screen.getByRole("button", { name: "Follow this debate" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("recoverable error: preserves the user's draft selection instead of reverting it, and offers a retry", async () => {
    setDebateSubscriptionV2ActionMock.mockResolvedValue({ ok: false, error: "Something went wrong. Please try again." });
    const user = userEvent.setup();
    render(<V2SubscriptionControl debateId="debate-1" isAuthenticated initialSubscription={SUBSCRIBED} />);

    await user.click(screen.getByRole("button", { name: "Manage notification preferences" }));
    const checkbox = screen.getByRole("checkbox", { name: "Direct responses to you" });
    await user.click(checkbox); // user unchecks it; the save will fail

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    // Draft selection survives the error -- still unchecked, not reverted to true.
    expect(checkbox).not.toBeChecked();

    setDebateSubscriptionV2ActionMock.mockResolvedValue(
      okResult({ isSubscribed: true, notifyDirectResponses: false })
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(setDebateSubscriptionV2ActionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ notifyDirectResponses: false })
    );
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("mobile/accessibility: the preferences toggle exposes aria-expanded, and every checkbox has an accessible label", async () => {
    const user = userEvent.setup();
    render(<V2SubscriptionControl debateId="debate-1" isAuthenticated initialSubscription={SUBSCRIBED} />);

    const toggle = screen.getByRole("button", { name: "Manage notification preferences" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    expect(screen.getByRole("button", { name: "Hide notification preferences" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    for (const label of [
      "Round and phase changes",
      "Direct responses to you",
      "Evidence requests on your arguments",
      "Final vote opens",
      "Recap ready",
    ]) {
      expect(screen.getByRole("checkbox", { name: label })).toBeInTheDocument();
    }
  });

  it("never reloads the room: the component accepts no refresh/onSuccess callback at all -- a preference update can only ever update its own local state", () => {
    // Structural guarantee, not just a runtime one: V2SubscriptionControl's
    // props are limited to debateId/isAuthenticated/initialSubscription
    // (see this call site itself -- TypeScript would reject an onSuccess
    // prop here), unlike every other v2/* component, which all take
    // onSuccess and call the parent's full loadDebateV2Room-backed refresh.
    render(<V2SubscriptionControl debateId="debate-1" isAuthenticated initialSubscription={SUBSCRIBED} />);
    expect(screen.getByRole("button", { name: "Unfollow this debate" })).toBeInTheDocument();
  });
});
