"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  hasActivePushSubscription,
  isPushSupported,
  markPushPromptShown,
  recordPushPromptDismissed,
  recordPushPromptTerminal,
  subscribeToPush,
} from "@/lib/pushClient";

interface Props {
  userId: string;
  mode: "cta" | "terminal";
  attemptCount: number;
}

export default function PushPromptBanner({ userId, mode, attemptCount }: Props) {
  const router = useRouter();
  const [display, setDisplay] = useState<"cta" | "cta-final" | "blocked" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPushSupported()) {
      void recordPushPromptTerminal(userId);
      return;
    }

    if (Notification.permission === "denied") {
      // Browser-level block — JS can't re-trigger the permission dialog once
      // denied, so pointing to Settings is the only path that actually works.
      setDisplay("blocked");
      return;
    }

    if (Notification.permission === "granted") {
      void (async () => {
        const subscribed = await hasActivePushSubscription(userId);
        if (subscribed) {
          // Permission and subscription both check out — nothing left to prompt for.
          void recordPushPromptTerminal(userId);
          return;
        }
        // Permission already granted but no live subscription (revoked,
        // deleted, or granted on a different device/session) — recreate it
        // directly, no browser prompt needed.
        await subscribeToPush(userId);
        void markPushPromptShown(userId);
      })();
      return;
    }

    // Permission is still "default" — a direct prompt still works even once
    // retries are exhausted, so there's no need to detour through Settings.
    setDisplay(mode === "terminal" ? "cta-final" : "cta");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissRetry = () => {
    void recordPushPromptDismissed(userId, attemptCount + 1);
    setDisplay(null);
  };

  const dismissFinal = () => {
    void recordPushPromptTerminal(userId);
    setDisplay(null);
  };

  const dismissBlocked = () => {
    void recordPushPromptTerminal(userId);
    setDisplay(null);
  };

  const goToSettings = () => {
    void recordPushPromptTerminal(userId);
    router.push("/settings?tab=notifications");
  };

  const handleEnable = async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        const ok = await subscribeToPush(userId);
        if (!ok) setError("Could not finish enabling push notifications.");
        await recordPushPromptTerminal(userId);
        setDisplay(null);
        return;
      }
      // Denied right now, or dismissed without choosing — either way this
      // counts as one used attempt toward the retry cap.
      await recordPushPromptDismissed(userId, attemptCount + 1);
      setDisplay(null);
    } catch {
      setError("Could not enable push notifications.");
    } finally {
      setBusy(false);
    }
  };

  if (!display) return null;

  if (display === "blocked") {
    return (
      <section className="mb-6 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">Notifications are off</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-500">
            You can turn on push notifications any time from your notification settings.
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={dismissBlocked}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-canvas"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={goToSettings}
            className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37]"
          >
            Manage in Settings
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6 flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Stay in the loop
        </p>
        <h2 className="mt-1 text-sm font-semibold text-gray-900">Turn on push notifications</h2>
        <p className="mt-1 max-w-xl text-sm text-gray-500">
          Get notified when your submissions are published, someone messages you, or comments
          on your post — even when Indegenius isn&apos;t open in your browser.
        </p>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>
      <div className="flex shrink-0 gap-3">
        <button
          type="button"
          onClick={display === "cta-final" ? dismissFinal : dismissRetry}
          disabled={busy}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-canvas disabled:opacity-40"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={handleEnable}
          disabled={busy}
          className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37] disabled:opacity-60"
        >
          {busy ? "Enabling..." : "Enable notifications"}
        </button>
      </div>
    </section>
  );
}
