import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificationPermissionPrompt from "@/components/push/NotificationPermissionPrompt";

const hide = vi.fn();
const notePermission = vi.fn();
const subscribeCurrentDevice = vi.fn();

vi.mock("@/components/push/usePushNudge", () => ({
  usePushNudge: () => ({ status: "offer", offerNumber: 1, permission: "granted", hide, notePermission }),
}));
vi.mock("@/lib/activationEvents", () => ({ trackActivationEvent: vi.fn() }));
vi.mock("@/lib/pushClient", () => ({
  getPushOperationErrorMessage: () => "The device subscribed, but we could not save it. Please try again.",
  requestPushPermission: vi.fn(),
  subscribeCurrentDevice: (...args: unknown[]) => subscribeCurrentDevice(...args),
}));

describe("NotificationPermissionPrompt", () => {
  beforeEach(() => {
    hide.mockReset();
    subscribeCurrentDevice.mockReset();
  });

  it("keeps a recoverable subscription error visible", async () => {
    subscribeCurrentDevice.mockResolvedValue({ ok: false, code: "persistence_failed" });
    const onContinue = vi.fn();
    render(<NotificationPermissionPrompt userId="user-a" onContinue={onContinue} />);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    await userEvent.click(screen.getByRole("button", { name: "Restore notifications" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not save it");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue without notifications" })).toBeInTheDocument();
    expect(hide).not.toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();
  });
});
