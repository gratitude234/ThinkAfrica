"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminActionStatus from "@/components/admin/AdminActionStatus";
import { useAdminActionFeedback } from "@/components/admin/useAdminActionFeedback";
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
  const [reviewNote, setReviewNote] = useState(initialReviewNote ?? "");
  const feedback = useAdminActionFeedback<string>();

  const update = async (status: string) => {
    const statusLabels: Record<string, string> = {
      shortlisted: "Shortlisting application...",
      accepted: "Accepting application...",
      rejected: "Rejecting application...",
    };
    feedback.startAction(status, statusLabels[status] ?? "Saving review note...");
    const result = await updateFellowshipApplicationStatus(
      applicationId,
      status,
      reviewNote
    );
    if (result.error) {
      feedback.failAction(result.error);
      return;
    }
    const successLabels: Record<string, string> = {
      shortlisted: "Application shortlisted.",
      accepted: "Application accepted.",
      rejected: "Application rejected.",
    };
    feedback.finishAction(successLabels[status] ?? "Review note saved.");
    router.refresh();
  };

  const statuses = [
    { label: "Shortlist", value: "shortlisted", style: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
    { label: "Accept", value: "accepted", style: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
    { label: "Reject", value: "rejected", style: "bg-red-50 text-red-600 border-red-200 hover:bg-red-100" },
  ];
  const loadingLabels: Record<string, string> = {
    shortlisted: "Shortlisting...",
    accepted: "Accepting...",
    rejected: "Rejecting...",
  };

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
          disabled={feedback.pendingAction !== null}
          className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:border-emerald-200 hover:text-emerald-700 disabled:opacity-50"
        >
          {feedback.pendingAction === currentStatus ? "Saving note..." : "Save note"}
        </button>
        {statuses.map((s) => (
          currentStatus !== s.value && (
            <button
              key={s.value}
              onClick={() => update(s.value)}
              disabled={feedback.pendingAction !== null}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg border disabled:opacity-50 transition-colors ${s.style}`}
            >
              {feedback.pendingAction === s.value ? loadingLabels[s.value] : s.label}
            </button>
          )
        ))}
      </div>
      <AdminActionStatus
        status={feedback.statusMessage}
        error={feedback.error}
        toastMessage={feedback.toastMessage}
        onToastDone={feedback.clearToast}
        className="mt-1 text-xs"
      />
    </div>
  );
}
