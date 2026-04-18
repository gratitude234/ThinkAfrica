"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approvePost, rejectPost } from "./actions";

interface ReviewActionsProps {
  postId: string;
}

export default function ReviewActions({ postId }: ReviewActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isRejectHovered, setIsRejectHovered] = useState(false);

  const showRejectionReason = isRejectHovered || rejectionReason.trim().length > 0;

  const handleApprove = async () => {
    setLoading("approve");
    setError(null);

    try {
      const { error: actionError } = await approvePost(postId);

      if (actionError) {
        setError(actionError);
        return;
      }

      router.refresh();
    } catch {
      setError("Unable to approve this post right now.");
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async () => {
    setLoading("reject");
    setError(null);

    try {
      const { error: actionError } = await rejectPost(postId, rejectionReason);

      if (actionError) {
        setError(actionError);
        return;
      }

      setRejectionReason("");
      router.refresh();
    } catch {
      setError("Unable to reject this post right now.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleApprove}
        disabled={!!loading}
        className="rounded-lg bg-emerald-brand px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
      >
        {loading === "approve" ? "Publishing..." : "Approve"}
      </button>

      <div
        className="flex flex-col gap-2"
        onMouseEnter={() => setIsRejectHovered(true)}
        onMouseLeave={() => setIsRejectHovered(false)}
      >
        <button
          onClick={handleReject}
          disabled={!!loading}
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
        >
          {loading === "reject" ? "Rejecting..." : "Reject"}
        </button>

        {showRejectionReason ? (
          <textarea
            value={rejectionReason}
            onChange={(event) => setRejectionReason(event.target.value)}
            placeholder="Reason for rejection (shown to author)..."
            rows={2}
            disabled={!!loading}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 placeholder:text-gray-400 focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-50"
          />
        ) : null}
      </div>

      {error ? <p className="text-xs text-red-500 mt-1">{error}</p> : null}
    </div>
  );
}
