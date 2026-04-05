"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props { sponsorId: string; active: boolean; }

export default function SponsorToggle({ sponsorId, active }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.from("sponsor_placements").update({ active: !active }).eq("id", sponsorId);
    setLoading(false);
    router.refresh();
  };

  return (
    <button onClick={toggle} disabled={loading}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg border disabled:opacity-50 transition-colors ${
        active
          ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
          : "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
      }`}>
      {loading ? "..." : active ? "Deactivate" : "Activate"}
    </button>
  );
}
