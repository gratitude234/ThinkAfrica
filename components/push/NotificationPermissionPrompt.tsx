"use client";

import { useEffect, useRef, useState } from "react";
import { trackActivationEvent } from "@/lib/activationEvents";
import {
  getPushOperationErrorMessage,
  requestPushPermission,
  subscribeCurrentDevice,
} from "@/lib/pushClient";
import { usePushNudge } from "@/components/push/usePushNudge";

interface Props {
  userId: string;
  onContinue: () => void;
}

export default function NotificationPermissionPrompt({ userId, onContinue }: Props) {
  const { status, offerNumber, permission, hide, notePermission } = usePushNudge({
    userId,
    surface: "onboarding",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const continuedRef = useRef(false);

  useEffect(() => {
    if (status !== "hidden" || continuedRef.current) return;
    continuedRef.current = true;
    onContinue();
  }, [onContinue, status]);

  useEffect(() => {
    if (status === "offer") primaryButtonRef.current?.focus();
  }, [status]);

  function trackAction(action: string) {
    trackActivationEvent({
      event: "push_nudge_action",
      source: "onboarding",
      metadata: { surface: "onboarding", mode: "offer", action, offerNumber, permission },
    });
  }

  const continueWithout = () => {
    trackAction(error ? "continue_without" : "not_now");
    hide();
  };

  const handleEnable = async () => {
    setLoading(true);
    setError(null);
    trackAction(error ? "retry" : "enable");
    try {
      let nextPermission = permission;
      if (nextPermission === "default") {
        nextPermission = await requestPushPermission();
        notePermission(nextPermission);
        trackActivationEvent({
          event: "push_permission_resolved",
          source: "onboarding",
          metadata: { surface: "onboarding", result: nextPermission, offerNumber },
        });
      }
      if (nextPermission !== "granted") {
        hide();
        return;
      }

      const result = await subscribeCurrentDevice(userId);
      trackActivationEvent({
        event: "push_device_operation",
        source: "onboarding",
        metadata: {
          surface: "onboarding",
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
        source: "onboarding",
        metadata: { surface: "onboarding", operation: "subscribe", result: "failure", errorCode: "unexpected" },
      });
    } finally {
      setLoading(false);
    }
  };

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !loading) {
      event.preventDefault();
      continueWithout();
      return;
    }
    if (event.key !== "Tab") return;
    const buttons = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []
    );
    if (buttons.length === 0) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (status !== "offer") return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-prompt-title"
        aria-describedby="push-prompt-description"
        onKeyDown={handleDialogKeyDown}
        className="w-full max-w-sm rounded-t-2xl bg-white p-6 sm:rounded-2xl"
      >
        <h2 id="push-prompt-title" className="font-display text-lg font-semibold text-ink">
          Stay in the loop
        </h2>
        <p id="push-prompt-description" className="mt-1.5 text-sm text-ink-muted">
          Get notified the moment your submission is published, rejected, or sent back for
          revision — even when Indegenius isn&apos;t open in your browser.
        </p>
        {error ? (
          <p className="mt-3 text-sm text-red-600" role="alert" aria-live="assertive">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={continueWithout}
            disabled={loading}
            className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-ink-muted disabled:opacity-40"
          >
            {error ? "Continue without notifications" : "Not now"}
          </button>
          <button
            ref={primaryButtonRef}
            type="button"
            onClick={handleEnable}
            disabled={loading}
            className="flex-1 rounded-xl bg-emerald-brand px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Enabling..." : error ? "Try again" : permission === "granted" ? "Restore notifications" : "Enable notifications"}
          </button>
        </div>
      </div>
    </div>
  );
}
