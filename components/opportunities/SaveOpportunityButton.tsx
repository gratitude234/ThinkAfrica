"use client";

import { useState } from "react";
import { trackActivationEvent } from "@/lib/activationEvents";
import { toggleSavedOpportunity } from "./opportunityActions";

interface SaveOpportunityButtonProps {
  fellowshipId: string;
  initialSaved: boolean;
  userId: string | null;
  source: string;
  className?: string;
}

export default function SaveOpportunityButton({
  fellowshipId,
  initialSaved,
  userId,
  source,
  className,
}: SaveOpportunityButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (!userId) {
      window.location.href = `/login?redirectTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return;
    }

    setLoading(true);
    // The saved row belongs to whoever is signed in, which the server decides.
    // This component still takes `userId`, but only to know whether to send
    // the visitor to the sign-in page first.
    const result = await toggleSavedOpportunity({
      fellowshipId,
      save: !saved,
    });
    if (result.ok) {
      setSaved(result.data.saved);
      trackActivationEvent({
        event: result.data.saved ? "opportunity_saved" : "opportunity_unsaved",
        metadata: { fellowshipId, source },
      });
    }
    setLoading(false);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className={
        className ??
        "inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:border-emerald-200 hover:text-emerald-700 disabled:opacity-60"
      }
      aria-pressed={saved}
    >
      {loading ? "Saving..." : saved ? "Saved" : "Save"}
    </button>
  );
}
