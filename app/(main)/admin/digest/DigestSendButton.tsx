"use client";

import { useState } from "react";

export default function DigestSendButton() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1200));
    setLoading(false);
    setSent(true);
    setTimeout(() => setSent(false), 4000);
  };

  return (
    <button
      onClick={handleSend}
      disabled={loading || sent}
      className="px-5 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-70 transition-colors"
    >
      {sent ? "✓ Digest queued!" : loading ? "Sending..." : "Send Digest"}
    </button>
  );
}
