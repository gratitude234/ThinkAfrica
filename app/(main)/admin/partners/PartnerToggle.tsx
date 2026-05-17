"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminActionStatus from "@/components/admin/AdminActionStatus";
import { useAdminActionFeedback } from "@/components/admin/useAdminActionFeedback";
import { togglePartner } from "./actions";

interface Props { partnerId: string; active: boolean; }

export default function PartnerToggle({ partnerId, active }: Props) {
  const router = useRouter();
  const feedback = useAdminActionFeedback<"toggle">();

  const toggle = async () => {
    feedback.startAction(
      "toggle",
      active ? "Deactivating partner..." : "Activating partner..."
    );
    const result = await togglePartner(partnerId, active);
    if (result.error) {
      feedback.failAction(result.error);
      return;
    }
    feedback.finishAction(active ? "Partner deactivated." : "Partner activated.");
    router.refresh();
  };

  return (
    <div>
      <button onClick={toggle} disabled={feedback.pendingAction !== null}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg border disabled:opacity-50 transition-colors ${
          active
            ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
            : "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
        }`}>
        {feedback.pendingAction ? (active ? "Deactivating..." : "Activating...") : active ? "Deactivate" : "Activate"}
      </button>
      <AdminActionStatus
        status={feedback.statusMessage}
        error={feedback.error}
        toastMessage={feedback.toastMessage}
        onToastDone={feedback.clearToast}
        className="mt-1 max-w-40 text-xs"
      />
    </div>
  );
}
