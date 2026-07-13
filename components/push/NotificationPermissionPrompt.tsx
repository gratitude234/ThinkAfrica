"use client";

import { useEffect, useState } from "react";
import { subscribeToPush } from "@/lib/pushClient";

const SUBSCRIBE_TIMEOUT_MS = 8000;

interface Props {
  userId: string;
  onContinue: () => void;
}

export default function NotificationPermissionPrompt({ userId, onContinue }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  useEffect(() => {
    if (!supported) {
      onContinue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  if (!supported) {
    return null;
  }

  const handleEnable = async () => {
    setLoading(true);
    setError(null);

    const work = (async () => {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      await subscribeToPush(userId);
    })();

    try {
      await Promise.race([
        work,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Notification setup is taking too long.")), SUBSCRIBE_TIMEOUT_MS)
        ),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable notifications.");
    } finally {
      setLoading(false);
      onContinue();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 sm:rounded-2xl">
        <h2 className="font-display text-lg font-semibold text-ink">Stay in the loop</h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          Get notified the moment your submission is published, rejected, or sent back for
          revision — even when Indegenius isn&apos;t open in your browser.
        </p>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onContinue}
            disabled={loading}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-ink-muted disabled:opacity-40"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={handleEnable}
            disabled={loading}
            className="flex-1 rounded-xl bg-emerald-brand py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Enabling..." : "Enable notifications"}
          </button>
        </div>
      </div>
    </div>
  );
}
