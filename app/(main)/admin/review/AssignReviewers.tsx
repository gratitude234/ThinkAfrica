"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminActionStatus from "@/components/admin/AdminActionStatus";
import { useAdminActionFeedback } from "@/components/admin/useAdminActionFeedback";
import { assignReviewer, removeReviewer } from "./actions";

interface ReviewerOption {
  id: string;
  username: string;
  full_name: string | null;
  university?: string | null;
  field_of_study?: string | null;
}

interface Props {
  postId: string;
  round: number;
  minReviewers: number;
  reviewers: ReviewerOption[];
  assignments: Array<{
    reviewer_id: string;
    submitted_at: string | null;
    recommendation: string | null;
    notes?: string | null;
    reviewer: ReviewerOption | null;
  }>;
  authorFieldOfStudy?: string | null;
  authorUniversity?: string | null;
}

// Purely a "surface relevant people first" grouping - not a scoring system.
// Returns null (no tag, falls back to the default flat list) when there's
// nothing to meaningfully match on.
function getReviewerMatchLabel(
  reviewer: ReviewerOption,
  authorFieldOfStudy?: string | null,
  authorUniversity?: string | null
): string | null {
  const sameField =
    Boolean(authorFieldOfStudy) && reviewer.field_of_study === authorFieldOfStudy;
  const sameUniversity =
    Boolean(authorUniversity) && reviewer.university === authorUniversity;

  if (sameField && sameUniversity) return "Same field & university";
  if (sameField) return "Same field";
  if (sameUniversity) return "Same university";
  return null;
}

export default function AssignReviewers({
  postId,
  round,
  minReviewers,
  reviewers,
  assignments,
  authorFieldOfStudy,
  authorUniversity,
}: Props) {
  const router = useRouter();
  const suggestedReviewers = reviewers.filter(
    (reviewer) => getReviewerMatchLabel(reviewer, authorFieldOfStudy, authorUniversity) !== null
  );
  const otherReviewers = reviewers.filter(
    (reviewer) => getReviewerMatchLabel(reviewer, authorFieldOfStudy, authorUniversity) === null
  );
  // Only group when there's a real, partial split to show - if everyone
  // matches, or no one does (e.g. missing field_of_study/university data),
  // grouping wouldn't add information, so fall back to the plain list.
  const hasSuggestions = suggestedReviewers.length > 0 && otherReviewers.length > 0;

  const [selectedReviewer, setSelectedReviewer] = useState(
    (suggestedReviewers[0] ?? reviewers[0])?.id ?? ""
  );
  const feedback = useAdminActionFeedback<"assign" | `remove:${string}`>();

  const handleAssign = async () => {
    if (!selectedReviewer) return;
    feedback.startAction("assign", "Assigning reviewer...");
    const result = await assignReviewer(postId, selectedReviewer, round);

    if (result.error) {
      feedback.failAction(result.error);
      return;
    }

    feedback.finishAction("Reviewer assigned.");
    router.refresh();
  };

  const handleRemove = async (reviewerId: string) => {
    const actionKey = `remove:${reviewerId}` as const;
    feedback.startAction(actionKey, "Removing reviewer...");
    const result = await removeReviewer(postId, reviewerId, round);

    if (result.error) {
      feedback.failAction(result.error);
      return;
    }

    feedback.finishAction("Reviewer removed.");
    router.refresh();
  };

  return (
    <div className="space-y-3 rounded-xl border border-purple-200 bg-purple-50/50 p-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">Assign reviewers</p>
        <p className="mt-1 text-xs text-gray-500">
          Round {round} · {assignments.filter((assignment) => assignment.submitted_at).length}/
          {Math.max(minReviewers, assignments.length)} completed
        </p>
      </div>

      {reviewers.length > 0 ? (
        <div className="flex items-center gap-2">
          <select
            value={selectedReviewer}
            onChange={(event) => setSelectedReviewer(event.target.value)}
            className="flex-1 rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-purple-300"
          >
            {hasSuggestions ? (
              <>
                <optgroup label="Suggested — shared background with author">
                  {suggestedReviewers.map((reviewer) => (
                    <option key={reviewer.id} value={reviewer.id}>
                      {reviewer.full_name ?? reviewer.username} —{" "}
                      {getReviewerMatchLabel(reviewer, authorFieldOfStudy, authorUniversity)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Other reviewers">
                  {otherReviewers.map((reviewer) => (
                    <option key={reviewer.id} value={reviewer.id}>
                      {reviewer.full_name ?? reviewer.username}
                    </option>
                  ))}
                </optgroup>
              </>
            ) : (
              reviewers.map((reviewer) => (
                <option key={reviewer.id} value={reviewer.id}>
                  {reviewer.full_name ?? reviewer.username}
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            onClick={handleAssign}
            disabled={feedback.pendingAction !== null}
            className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {feedback.pendingAction === "assign" ? "Assigning..." : "Assign"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-500">No reviewers available.</p>
      )}

      {assignments.length > 0 ? (
        <div className="space-y-2">
          {assignments.map((assignment) => (
            <div
              key={assignment.reviewer_id}
              className="space-y-2 rounded-lg bg-white px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-gray-800">
                  {assignment.reviewer?.full_name ?? assignment.reviewer?.username}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium ${
                      assignment.submitted_at ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {assignment.submitted_at
                      ? assignment.recommendation ?? "Submitted"
                      : "Awaiting review"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemove(assignment.reviewer_id)}
                    disabled={feedback.pendingAction !== null}
                    className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    {feedback.pendingAction === `remove:${assignment.reviewer_id}`
                      ? "Removing..."
                      : "Remove"}
                  </button>
                </div>
              </div>
              {assignment.notes ? (
                <p className="whitespace-pre-line text-xs leading-relaxed text-gray-500">
                  {assignment.notes}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <AdminActionStatus
        status={feedback.statusMessage}
        error={feedback.error}
        toastMessage={feedback.toastMessage}
        onToastDone={feedback.clearToast}
      />
    </div>
  );
}
