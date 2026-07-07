"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminActionStatus from "@/components/admin/AdminActionStatus";
import { useAdminActionFeedback } from "@/components/admin/useAdminActionFeedback";
import { updateAmbassadorStatus } from "./actions";

interface Props {
  ambassadorId: string;
  currentStatus: string;
}

export default function AmbassadorActions({ ambassadorId, currentStatus }: Props) {
  const router = useRouter();
  const feedback = useAdminActionFeedback<"approve" | "reject">();

  const update = async (status: "active" | "inactive") => {
    const action = status === "active" ? "approve" : "reject";
    feedback.startAction(
      action,
      status === "active" ? "Approving ambassador..." : "Declining ambassador..."
    );
    const result = await updateAmbassadorStatus(ambassadorId, status);
    if (result.error) {
      feedback.failAction(result.error);
      return;
    }
    feedback.finishAction(
      status === "active" ? "Ambassador approved." : "Ambassador declined."
    );
    router.refresh();
  };

  const loading = feedback.pendingAction;

  return (
    <div>
      <div className="flex items-center gap-2">
        {currentStatus !== "active" && (
          <button
            onClick={() => update("active")}
            disabled={loading !== null}
            className="px-3 py-1.5 bg-emerald-brand text-white text-xs font-medium rounded-lg hover:bg-[#0E4B37] disabled:opacity-50 transition-colors"
          >
            {loading === "approve" ? "Approving..." : "Approve"}
          </button>
        )}
        {currentStatus !== "inactive" && (
          <button
            onClick={() => update("inactive")}
            disabled={loading !== null}
            className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-xs font-medium rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            {loading === "reject" ? "Rejecting..." : "Reject"}
          </button>
        )}
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
