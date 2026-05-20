"use client";

import { useState, useTransition } from "react";
import { sendProfileCompletionReminders } from "./actions";

export default function ProfileReminderButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          startTransition(() => {
            setMessage(null);
            void (async () => {
              const result = await sendProfileCompletionReminders();
              if (result.error) {
                setMessage(result.error);
                return;
              }

              setMessage(
                `Sent ${result.sent}, skipped ${result.skipped}, failed ${result.failed}.`
              );
            })();
          });
        }}
        className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-70"
      >
        {isPending ? "Sending..." : "Send profile reminders"}
      </button>
      {message ? (
        <p className="max-w-xs text-left text-xs text-gray-500 sm:text-right">
          {message}
        </p>
      ) : null}
    </div>
  );
}
