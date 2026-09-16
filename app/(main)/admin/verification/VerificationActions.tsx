"use client";

import { useRouter } from "next/navigation";
import AdminActionStatus from "@/components/admin/AdminActionStatus";
import { useAdminActionFeedback } from "@/components/admin/useAdminActionFeedback";
import { updateVerificationStatus } from "./actions";

interface Props {
  userId: string;
  verified: boolean;
}

export default function VerificationActions({ userId, verified }: Props) {
  const router = useRouter();
  const feedback = useAdminActionFeedback<"verify" | "revoke">();

  const update = async (nextVerified: boolean) => {
    const action = nextVerified ? "verify" : "revoke";
    feedback.startAction(
      action,
      nextVerified ? "Recording verification..." : "Revoking verification..."
    );

    const { error } = await updateVerificationStatus({
      userId,
      verified: nextVerified,
    });

    if (error) {
      feedback.failAction(error);
      return;
    }

    feedback.finishAction(
      nextVerified ? "Account verified." : "Verification revoked."
    );
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2">
      {verified ? (
        <button
          onClick={() => update(false)}
          disabled={feedback.pendingAction !== null}
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
        >
          {feedback.pendingAction === "revoke" ? "Revoking..." : "Revoke"}
        </button>
      ) : (
        <button
          onClick={() => update(true)}
          disabled={feedback.pendingAction !== null}
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-100 disabled:opacity-50"
        >
          {feedback.pendingAction === "verify" ? "Verifying..." : "Verify"}
        </button>
      )}
      <AdminActionStatus
        status={feedback.statusMessage}
        error={feedback.error}
        toastMessage={feedback.toastMessage}
        onToastDone={feedback.clearToast}
      />
    </div>
  );
}
