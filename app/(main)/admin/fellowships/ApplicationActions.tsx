"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateFellowshipApplicationStatus } from "./actions";

interface Props {
  applicationId: string;
  currentStatus: string;
  initialReviewNote?: string | null;
}

export default function ApplicationActions({
  applicationId,
  currentStatus,
  initialReviewNote,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState(initialReviewNote ?? "");

  const update = async (status: string) => {
    setLoading(status);
    setError(null);
    const result = await updateFellowshipApplicationStatus(
      applicationId,
      status,
      reviewNote
    );
    setLoading(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  const statuses = [
    { label: "Shortlist", value: "shortlisted", style: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
    { label: "Accept", value: "accepted", style: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
    { label: "Reject", value: "rejected", style: "bg-red-50 text-red-600 border-red-200 hover:bg-red-100" },
  ];

  return (
    <div className="space-y-2">
      <textarea
        value={reviewNote}
        onChange={(event) => setReviewNote(event.target.value)}
        rows={3}
        placeholder="Internal review note"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
      />
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => update(currentStatus)}
          disabled={loading !== null}
          className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:border-emerald-200 hover:text-emerald-700 disabled:opacity-50"
        >
          {loading === currentStatus ? "Saving..." : "Save note"}
        </button>
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
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
