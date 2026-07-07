"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminActionStatus from "@/components/admin/AdminActionStatus";
import { useAdminActionFeedback } from "@/components/admin/useAdminActionFeedback";
import { submitEditorialDecision } from "./actions";
import type { EditorDecision } from "@/lib/types";

interface ReviewActionsProps {
  postId: string;
  requiresEditorialWorkflow: boolean;
  readyForDecision: boolean;
  blockingReason: string | null;
  currentRound: number;
  reviewSummary?: string | null;
}

const DECISION_LABELS: Record<EditorDecision, string> = {
  accept: "Accept for Publication",
  request_revision: "Request Revision",
  reject: "Reject",
};

const DECISION_LOADING_LABELS: Record<EditorDecision, string> = {
  accept: "Publishing...",
  request_revision: "Requesting revision...",
  reject: "Rejecting...",
};

const DECISION_SUCCESS_MESSAGES: Record<EditorDecision, string> = {
  accept: "Submission accepted.",
  request_revision: "Revision requested.",
  reject: "Submission rejected.",
};

export default function ReviewActions({
  postId,
  requiresEditorialWorkflow,
  readyForDecision,
  blockingReason,
  currentRound,
  reviewSummary,
}: ReviewActionsProps) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const feedback = useAdminActionFeedback<EditorDecision>();

  const handleDecision = async (decision: EditorDecision) => {
    feedback.startAction(decision, DECISION_LOADING_LABELS[decision]);

    try {
      const { error: actionError } = await submitEditorialDecision({
        postId,
        decision,
        notes,
      });

      if (actionError) {
        feedback.failAction(actionError);
        return;
      }

      setNotes("");
      feedback.finishAction(DECISION_SUCCESS_MESSAGES[decision]);
      router.refresh();
    } catch {
      feedback.failAction("Unable to record this editorial decision right now.");
    }
  };

  const disableDecision = requiresEditorialWorkflow && !readyForDecision;
  const loading = feedback.pendingAction;

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">
          {requiresEditorialWorkflow ? "Editorial decision" : "Publication decision"}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Round {currentRound}
          {reviewSummary ? ` · ${reviewSummary}` : ""}
        </p>
      </div>

      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder={
          requiresEditorialWorkflow
            ? "Decision note for the author and editorial record..."
            : "Optional note for the author..."
        }
        rows={3}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-emerald-brand focus:outline-none focus:ring-2 focus:ring-emerald-100"
      />

      <div className="grid gap-2">
        {(["accept", "request_revision", "reject"] as EditorDecision[]).map((decision) => (
          <button
            key={decision}
            type="button"
            onClick={() => handleDecision(decision)}
            disabled={Boolean(loading) || disableDecision}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              decision === "accept"
                ? "bg-emerald-brand text-white hover:bg-[#0E4B37]"
                : decision === "request_revision"
                  ? "border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                  : "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
            }`}
          >
            {loading === decision ? DECISION_LOADING_LABELS[decision] : DECISION_LABELS[decision]}
          </button>
        ))}
      </div>

      <AdminActionStatus
        status={feedback.statusMessage}
        error={feedback.error}
        toastMessage={feedback.toastMessage}
        onToastDone={feedback.clearToast}
      />

      {disableDecision ? (
        <p className="text-xs text-amber-700">
          {blockingReason ?? "Complete reviewer assignments and submitted recommendations first."}
        </p>
      ) : null}
    </div>
  );
}
