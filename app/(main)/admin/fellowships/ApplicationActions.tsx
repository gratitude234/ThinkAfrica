"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  applicationId: string;
  currentStatus: string;
}

export default function ApplicationActions({ applicationId, currentStatus }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const update = async (status: string) => {
    setLoading(status);
    const supabase = createClient();
    await supabase
      .from("fellowship_applications")
      .update({ status })
      .eq("id", applicationId);
    setLoading(null);
    router.refresh();
  };

  const statuses = [
    { label: "Shortlist", value: "shortlisted", style: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
    { label: "Accept", value: "accepted", style: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
    { label: "Reject", value: "rejected", style: "bg-red-50 text-red-600 border-red-200 hover:bg-red-100" },
  ];

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {statuses.map((s) => (
        currentStatus !== s.value && (
          <button
            key={s.value}
            onClick={() => update(s.value)}
            disabled={loading !== null}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border disabled:opacity-50 transition-colors ${s.style}`}
          >
            {loading === s.value ? "..." : s.label}
          </button>
        )
      ))}
    </div>
  );
}
