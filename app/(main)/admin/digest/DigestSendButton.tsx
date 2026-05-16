"use client";

import { useState, useTransition } from "react";
import { trackActivationEvent } from "@/lib/activationEvents";
import { recordDigestPreviewReviewed } from "./actions";

export default function DigestSendButton() {
  const [reviewed, setReviewed] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => {
        startTransition(() => {
          setReviewed(true);
          trackActivationEvent({
            event: "weekly_digest_previewed",
            metadata: { source: "admin_digest_button", reviewed: true },
          });
          void recordDigestPreviewReviewed();
        });
      }}
      disabled={reviewed || isPending}
      className="px-5 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-70 transition-colors"
    >
      {reviewed ? "Preview reviewed" : isPending ? "Recording..." : "Review preview"}
    </button>
  );
}
