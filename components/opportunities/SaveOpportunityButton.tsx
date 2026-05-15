"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { trackActivationEvent } from "@/lib/activationEvents";

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
    const supabase = createClient();
    if (saved) {
      const { error } = await supabase
        .from("saved_opportunities")
        .delete()
        .eq("user_id", userId)
        .eq("fellowship_id", fellowshipId);
      if (!error) {
        setSaved(false);
        trackActivationEvent({
          event: "opportunity_unsaved",
          metadata: { fellowshipId, source },
        });
      }
    } else {
      const { error } = await supabase.from("saved_opportunities").upsert(
        {
          user_id: userId,
          fellowship_id: fellowshipId,
        },
        { onConflict: "user_id,fellowship_id" }
      );
      if (!error) {
        setSaved(true);
        trackActivationEvent({
          event: "opportunity_saved",
          metadata: { fellowshipId, source },
        });
      }
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
