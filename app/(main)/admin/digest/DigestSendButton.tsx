"use client";

import { useState, useTransition } from "react";
import { trackActivationEvent } from "@/lib/activationEvents";
import { sendWeeklyDigestEmails } from "./actions";

export default function DigestSendButton() {
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => {
          startTransition(() => {
            setResultMessage(null);
            void (async () => {
              const result = await sendWeeklyDigestEmails();
              if (result.error) {
                setResultMessage(result.error);
                return;
              }

              trackActivationEvent({
                event: "weekly_digest_previewed",
                metadata: {
                  source: "admin_digest_button",
                  sent: result.sent,
                  skipped: result.skipped,
                  failed: result.failed,
                },
              });
              setResultMessage(
                `Sent ${result.sent}, skipped ${result.skipped}, failed ${result.failed}.`
              );
            })();
          });
        }}
        disabled={isPending}
        className="px-5 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-[#0E4B37] disabled:opacity-70 transition-colors"
      >
        {isPending ? "Sending..." : "Send digest"}
      </button>
      {resultMessage ? (
        <p className="max-w-xs text-right text-xs text-gray-500">{resultMessage}</p>
      ) : null}
    </div>
  );
}
