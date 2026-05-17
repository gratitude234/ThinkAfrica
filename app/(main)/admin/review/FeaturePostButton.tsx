"use client";

import { useState } from "react";
import AdminActionStatus from "@/components/admin/AdminActionStatus";
import { useAdminActionFeedback } from "@/components/admin/useAdminActionFeedback";
import { toggleFeaturedPost } from "./actions";

interface Props {
  postId: string;
  initialFeatured: boolean;
}

export default function FeaturePostButton({ postId, initialFeatured }: Props) {
  const [featured, setFeatured] = useState(initialFeatured);
  const feedback = useAdminActionFeedback<"toggle">();

  const handleToggle = async () => {
    const nextFeatured = !featured;
    feedback.startAction(
      "toggle",
      nextFeatured ? "Featuring post..." : "Removing featured status..."
    );

    try {
      const result = await toggleFeaturedPost(postId, nextFeatured);

      if (result.error) {
        throw new Error(result.error);
      }

      setFeatured(result.featured);
      feedback.finishAction(result.featured ? "Post featured." : "Featured status removed.");
    } catch (err) {
      feedback.failAction(
        err instanceof Error ? err.message : "Failed to update featured post."
      );
    }
  };

  const loading = feedback.pendingAction !== null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleToggle}
        disabled={loading}
        aria-label={featured ? "Remove featured status" : "Set as featured post"}
        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
          featured
            ? "border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-200"
            : "border-gray-200 bg-white text-gray-600 hover:border-amber-300 hover:text-amber-700"
        }`}
      >
        {loading ? (featured ? "Removing..." : "Featuring...") : featured ? "Featured" : "Feature post"}
      </button>
      <AdminActionStatus
        status={feedback.statusMessage}
        error={feedback.error}
        toastMessage={feedback.toastMessage}
        onToastDone={feedback.clearToast}
      />
    </div>
  );
}
