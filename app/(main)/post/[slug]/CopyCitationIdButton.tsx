"use client";

import { useState } from "react";

export default function CopyCitationIdButton({
  citationId,
}: {
  citationId: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(citationId);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex items-center justify-center rounded-lg border border-purple-200 bg-white px-4 py-2 text-sm font-semibold text-purple-700 transition-colors hover:bg-purple-50"
    >
      {copied ? "Citation copied" : "Copy citation ID"}
    </button>
  );
}
