import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const activateDebateV2ActionMock = vi.fn();
const routerRefreshMock = vi.fn();

vi.mock("./v2/actions", () => ({
  activateDebateV2Action: (...args: unknown[]) => activateDebateV2ActionMock(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}));

import ActivateDebateV2 from "./ActivateDebateV2";

describe("ActivateDebateV2", () => {
  beforeEach(() => {
    activateDebateV2ActionMock.mockReset();
    routerRefreshMock.mockReset();
  });

  it("shows the ineligibility reason instead of an activation button when not eligible", () => {
    render(
      <ActivateDebateV2 debateId="debate-1" eligible={false} ineligibleReason="This debate already has 3 argument(s)." />
    );

    expect(screen.getByText("This debate already has 3 argument(s).")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enable structured Debate V2" })).not.toBeInTheDocument();
  });

  it("requires an explicit confirmation step before converting, and cancel backs out cleanly", async () => {
    const user = userEvent.setup();
    render(<ActivateDebateV2 debateId="debate-1" eligible ineligibleReason={null} />);

    await user.click(screen.getByRole("button", { name: "Enable structured Debate V2" }));
    expect(screen.getByText("Convert to Debate V2?")).toBeInTheDocument();
    expect(activateDebateV2ActionMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Convert to Debate V2?")).not.toBeInTheDocument();
  });

  it("activates on confirmation and refreshes so the server re-resolves format_version", async () => {
    activateDebateV2ActionMock.mockResolvedValue({ ok: true, data: {} });
    const user = userEvent.setup();
    render(<ActivateDebateV2 debateId="debate-1" eligible ineligibleReason={null} />);

    await user.click(screen.getByRole("button", { name: "Enable structured Debate V2" }));
    await user.click(screen.getByRole("button", { name: "Convert to V2" }));

    expect(activateDebateV2ActionMock).toHaveBeenCalledWith("debate-1");
    expect(routerRefreshMock).toHaveBeenCalledTimes(1);
  });

  it("shows a clean error and does not refresh when activation is rejected", async () => {
    activateDebateV2ActionMock.mockResolvedValue({ ok: false, error: "Only a moderator can activate Debate V2." });
    const user = userEvent.setup();
    render(<ActivateDebateV2 debateId="debate-1" eligible ineligibleReason={null} />);

    await user.click(screen.getByRole("button", { name: "Enable structured Debate V2" }));
    await user.click(screen.getByRole("button", { name: "Convert to V2" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Only a moderator can activate Debate V2.");
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });
});
