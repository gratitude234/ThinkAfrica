import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
const deleteEq = vi.fn();
const deleteQuery = { eq: deleteEq };
const from = vi.fn(() => ({
  upsert,
  delete: () => deleteQuery,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from }),
}));

import { subscribeCurrentDevice, unsubscribeCurrentDevice } from "@/lib/pushClient";

function installPushEnvironment(subscription: PushSubscription | null) {
  const getSubscription = vi.fn().mockResolvedValue(subscription);
  const subscribe = vi.fn();
  Object.defineProperty(window, "PushManager", { configurable: true, value: class PushManager {} });
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: { permission: "granted", requestPermission: vi.fn().mockResolvedValue("granted") },
  });
  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    value: window.Notification,
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager: { getSubscription, subscribe } }) },
  });
  return { getSubscription, subscribe };
}

function fakeSubscription() {
  return {
    endpoint: "https://push.example/device-a",
    toJSON: () => ({
      endpoint: "https://push.example/device-a",
      keys: { p256dh: "p256dh", auth: "auth" },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  } as unknown as PushSubscription;
}

describe("current-device push client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "dGVzdA";
    deleteEq.mockReturnValue(deleteQuery);
    upsert.mockResolvedValue({ error: null });
  });

  it("reuses and repairs an existing browser subscription", async () => {
    const subscription = fakeSubscription();
    const environment = installPushEnvironment(subscription);
    const result = await subscribeCurrentDevice("user-a");
    expect(result).toMatchObject({ ok: true, created: false, endpoint: subscription.endpoint });
    expect(environment.subscribe).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-a", endpoint: subscription.endpoint }),
      { onConflict: "endpoint" }
    );
  });

  it("reports persistence failure without creating another subscription", async () => {
    const subscription = fakeSubscription();
    const environment = installPushEnvironment(subscription);
    upsert.mockResolvedValue({ error: { message: "db unavailable" } });
    await expect(subscribeCurrentDevice("user-a")).resolves.toEqual({ ok: false, code: "persistence_failed" });
    expect(environment.subscribe).not.toHaveBeenCalled();
  });

  it("unsubscribes locally and deletes only the matching endpoint", async () => {
    const subscription = fakeSubscription();
    installPushEnvironment(subscription);
    const result = await unsubscribeCurrentDevice("user-a");
    expect(result).toEqual({ ok: true, endpoint: subscription.endpoint });
    expect(subscription.unsubscribe).toHaveBeenCalled();
    expect(deleteEq).toHaveBeenNthCalledWith(1, "user_id", "user-a");
    expect(deleteEq).toHaveBeenNthCalledWith(2, "endpoint", subscription.endpoint);
  });

  it("reports local success when database cleanup fails", async () => {
    const subscription = fakeSubscription();
    installPushEnvironment(subscription);
    deleteEq.mockReturnValueOnce(deleteQuery).mockResolvedValueOnce({ error: { message: "db unavailable" } });
    await expect(unsubscribeCurrentDevice("user-a")).resolves.toEqual({
      ok: false,
      code: "database_cleanup_failed",
      localUnsubscribed: true,
    });
  });
});
