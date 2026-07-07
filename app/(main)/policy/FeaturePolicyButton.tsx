"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminActionStatus from "@/components/admin/AdminActionStatus";
import { useAdminActionFeedback } from "@/components/admin/useAdminActionFeedback";
import { featurePolicyBrief } from "./actions";

interface Props {
  postId: string;
}

export default function FeaturePolicyButton({ postId }: Props) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [institution, setInstitution] = useState("");
  const feedback = useAdminActionFeedback<"feature">();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    feedback.startAction("feature", "Featuring policy brief...");
    const result = await featurePolicyBrief({
      postId,
      institutionTarget: institution,
    });
    if (result.error) {
      feedback.failAction(result.error);
      return;
    }
    setShowModal(false);
    setInstitution("");
    feedback.finishAction("Policy brief featured for institutions.");
    router.refresh();
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-3 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
      >
        Submit to Institutions
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-4">Feature for Institutions</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Institution Target
                </label>
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="e.g. Federal Ministry of Education"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={feedback.pendingAction !== null}
                  className="px-4 py-1.5 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-[#0E4B37] disabled:opacity-50 transition-colors"
                >
                  {feedback.pendingAction === "feature" ? "Featuring..." : "Confirm"}
                </button>
              </div>
              <AdminActionStatus
                status={feedback.statusMessage}
                error={feedback.error}
                toastMessage={feedback.toastMessage}
                onToastDone={feedback.clearToast}
                className="text-sm"
              />
            </form>
          </div>
        </div>
      )}
      {!showModal ? (
        <AdminActionStatus
          status={feedback.statusMessage}
          error={feedback.error}
          toastMessage={feedback.toastMessage}
          onToastDone={feedback.clearToast}
          className="text-sm"
        />
      ) : null}
    </>
  );
}
