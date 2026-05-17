"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminActionStatus from "@/components/admin/AdminActionStatus";
import { useAdminActionFeedback } from "@/components/admin/useAdminActionFeedback";
import { updateVerificationStatus } from "./actions";
import type { AppRole, VerificationType } from "@/lib/types";

interface Props {
  userId: string;
  verified: boolean;
  verifiedType: string | null;
  currentRole: AppRole;
}

const VERIFIED_OPTIONS: VerificationType[] = [
  "student",
  "researcher",
  "faculty",
  "institution",
];

export default function VerificationActions({
  userId,
  verified,
  verifiedType,
  currentRole,
}: Props) {
  const router = useRouter();
  const [type, setType] = useState<VerificationType>(
    (verifiedType as VerificationType | null) ?? "student"
  );
  const [role, setRole] = useState<AppRole>(currentRole ?? "student");
  const feedback = useAdminActionFeedback<"verify" | "revoke">();

  const elevatedRoleAllowed = type === "faculty" || type === "institution";
  const roleOptions: AppRole[] = elevatedRoleAllowed
    ? ["student", "reviewer", "editor"]
    : ["student"];

  const update = async (nextVerified: boolean) => {
    const action = nextVerified ? "verify" : "revoke";
    feedback.startAction(
      action,
      nextVerified ? "Verifying contributor..." : "Revoking verification..."
    );
    const { error } = await updateVerificationStatus({
      userId,
      verified: nextVerified,
      verifiedType: nextVerified ? type : null,
      role: nextVerified && elevatedRoleAllowed ? role : "student",
    });

    if (error) {
      feedback.failAction(error);
      return;
    }

    feedback.finishAction(
      nextVerified ? "Contributor verified." : "Verification revoked."
    );
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2">
      {!verified ? (
        <>
          <select
            value={type}
            onChange={(event) => {
              const nextType = event.target.value as VerificationType;
              setType(nextType);
              if (nextType !== "faculty" && nextType !== "institution") {
                setRole("student");
              }
            }}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-brand"
          >
            {VERIFIED_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>

          <select
            value={elevatedRoleAllowed ? role : "student"}
            onChange={(event) => setRole(event.target.value as AppRole)}
            disabled={!elevatedRoleAllowed}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-brand disabled:bg-gray-100 disabled:text-gray-400"
          >
            {roleOptions.map((option) => (
              <option key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>
        </>
      ) : null}

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
