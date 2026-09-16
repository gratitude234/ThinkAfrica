import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The row is written on the server now, so the stubs are the two actions
 * rather than a Supabase query builder.
 *
 * What the assertions check has changed with it, and deliberately: the old
 * ones asserted that a `user_id` the caller supplied reached the upsert. That
 * argument no longer exists. The viewer comes from the session, which is the
 * whole point of the move, so what is asserted now is that the browser sends
 * the subscription's own fields and nothing about who owns it.
 */
const persist = vi.fn();
const forget = vi.fn();

vi.mock("@/lib/pushSubscriptionActions", () => ({
  persistPushSubscription: (keys: unknown) => persist(keys),
  forgetPushSubscription: (endpoint: string) => forget(endpoint),
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
    persist.mockResolvedValue({ ok: true });
    forget.mockResolvedValue({ ok: true });
  });

  it("reuses and repairs an existing browser subscription", async () => {
    const subscription = fakeSubscription();
    const environment = installPushEnvironment(subscription);
    const result = await subscribeCurrentDevice("user-a");
    expect(result).toMatchObject({ ok: true, created: false, endpoint: subscription.endpoint });
    expect(environment.subscribe).not.toHaveBeenCalled();
    // The endpoint and keys travel; the owner does not. An id in this payload
    // would be an identity the browser chose.
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: subscription.endpoint })
    );
    expect(persist.mock.calls[0][0]).not.toHaveProperty("user_id");
  });

  it("reports persistence failure without creating another subscription", async () => {
    const subscription = fakeSubscription();
    const environment = installPushEnvironment(subscription);
    persist.mockResolvedValue({ ok: false, reason: "persistence_failed" });
    await expect(subscribeCurrentDevice("user-a")).resolves.toEqual({ ok: false, code: "persistence_failed" });
    expect(environment.subscribe).not.toHaveBeenCalled();
  });

  it("unsubscribes locally and deletes only the matching endpoint", async () => {
    const subscription = fakeSubscription();
    installPushEnvironment(subscription);
    const result = await unsubscribeCurrentDevice("user-a");
    expect(result).toEqual({ ok: true, endpoint: subscription.endpoint });
    expect(subscription.unsubscribe).toHaveBeenCalled();
    // Scoped to the viewer as well as the endpoint, on the server. An
    // endpoint identifies a device, never a person.
    expect(forget).toHaveBeenCalledWith(subscription.endpoint);
  });

  it("reports local success when database cleanup fails", async () => {
    const subscription = fakeSubscription();
    installPushEnvironment(subscription);
    forget.mockResolvedValue({ ok: false, reason: "database_cleanup_failed" });
    await expect(unsubscribeCurrentDevice("user-a")).resolves.toEqual({
      ok: false,
      code: "database_cleanup_failed",
      localUnsubscribed: true,
    });
  });
});
