import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const sendTestPushNotification = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/push", () => ({
  sendTestPushNotification: (...args: unknown[]) => sendTestPushNotification(...args),
}));

import { sendCurrentDeviceTestPush } from "./pushActions";

describe("sendCurrentDeviceTestPush", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fails closed for unauthenticated callers", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(sendCurrentDeviceTestPush("https://push.example/device-a")).resolves.toEqual({ ok: false, code: "not_found" });
    expect(sendTestPushNotification).not.toHaveBeenCalled();
  });

  it("passes the authenticated user and current endpoint to the ownership-checking sender", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-a" } } });
    sendTestPushNotification.mockResolvedValue({ ok: true });
    await expect(sendCurrentDeviceTestPush("https://push.example/device-a")).resolves.toEqual({ ok: true });
    expect(sendTestPushNotification).toHaveBeenCalledWith("user-a", "https://push.example/device-a");
  });

  it("rejects invalid endpoints before querying authentication", async () => {
    await expect(sendCurrentDeviceTestPush("")).resolves.toEqual({ ok: false, code: "not_found" });
    expect(getUser).not.toHaveBeenCalled();
  });
});
