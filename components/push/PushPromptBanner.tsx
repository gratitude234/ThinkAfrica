"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trackActivationEvent } from "@/lib/activationEvents";
import {
  getPushOperationErrorMessage,
  requestPushPermission,
  subscribeCurrentDevice,
} from "@/lib/pushClient";
import type { LegacyPushPromptSeed } from "@/lib/pushPromptPolicy";
import { usePushNudge } from "@/components/push/usePushNudge";

interface Props {
  userId: string;
  legacySeed: LegacyPushPromptSeed;
}

export default function PushPromptBanner({ userId, legacySeed }: Props) {
  const router = useRouter();
  const { status, offerNumber, permission, hide, notePermission } = usePushNudge({
    userId,
    surface: "home",
    legacySeed,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function trackAction(action: string) {
    trackActivationEvent({
      event: "push_nudge_action",
      source: "home",
      metadata: { surface: "home", mode: status, action, offerNumber, permission },
    });
  }

  const dismiss = () => {
    trackAction(error ? "continue_without" : "not_now");
    hide();
  };

  const goToSettings = () => {
    trackAction("open_settings");
    hide();
    router.push("/settings?tab=notifications");
  };

  const handleEnable = async () => {
    setBusy(true);
    setError(null);
    trackAction(error ? "retry" : "enable");
    try {
      let nextPermission = permission;
      if (nextPermission === "default") {
        nextPermission = await requestPushPermission();
        notePermission(nextPermission);
        trackActivationEvent({
          event: "push_permission_resolved",
          source: "home",
          metadata: { surface: "home", result: nextPermission, offerNumber },
        });
      }

      if (nextPermission !== "granted") {
        hide();
        return;
      }

      const result = await subscribeCurrentDevice(userId);
      trackActivationEvent({
        event: "push_device_operation",
        source: "home",
        metadata: {
          surface: "home",
          operation: "subscribe",
          result: result.ok ? "success" : "failure",
          errorCode: result.ok ? null : result.code,
        },
      });
      if (!result.ok) {
        setError(getPushOperationErrorMessage(result.code));
        return;
      }
      hide();
    } catch {
      setError("Could not enable push notifications. Please try again.");
      trackActivationEvent({
        event: "push_device_operation",
        source: "home",
        metadata: { surface: "home", operation: "subscribe", result: "failure", errorCode: "unexpected" },
      });
    } finally {
      setBusy(false);
    }
  };

  if (status === "checking" || status === "hidden") return null;

  if (status === "denied-recovery") {
    return (
      <section className="mb-6 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">Notifications are off</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-500">
            Your browser blocked notifications. You can review the recovery steps in Settings.
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={() => {
              trackAction("dismiss_recovery");
              hide();
            }}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-canvas"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={goToSettings}
            className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37]"
          >
            Recovery steps
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
        {error ? (
          <p className="mt-2 text-sm text-red-600" role="alert" aria-live="assertive">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-3">
        <button
          type="button"
          onClick={dismiss}
          disabled={busy}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-canvas disabled:opacity-40"
        >
          {error ? "Continue without notifications" : "Not now"}
        </button>
        <button
          type="button"
          onClick={handleEnable}
          disabled={busy}
          className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37] disabled:opacity-60"
        >
          {busy ? "Enabling..." : error ? "Try again" : permission === "granted" ? "Restore notifications" : "Enable notifications"}
        </button>
      </div>
    </section>
  );
}
