"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleSponsorPlacement } from "./actions";

interface Props { sponsorId: string; active: boolean; }

export default function SponsorToggle({ sponsorId, active }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setLoading(true);
    setError(null);
    const result = await toggleSponsorPlacement(sponsorId, active);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div>
      <button onClick={toggle} disabled={loading}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg border disabled:opacity-50 transition-colors ${
          active
            ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
            : "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
        }`}>
        {loading ? "..." : active ? "Deactivate" : "Activate"}
      </button>
      {error ? <p className="mt-1 max-w-40 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
