"use client";

import { useState } from "react";
import { trackActivationEvent } from "@/lib/activationEvents";

export default function DigestSendButton() {
  const [reviewed, setReviewed] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        setReviewed(true);
        trackActivationEvent({
          event: "weekly_digest_previewed",
          metadata: { source: "admin_digest_button", reviewed: true },
        });
      }}
      disabled={reviewed}
      className="px-5 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-70 transition-colors"
    >
      {reviewed ? "Preview reviewed" : "Review preview"}
    </button>
  );
}
