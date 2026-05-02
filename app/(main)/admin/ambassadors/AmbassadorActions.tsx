"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateAmbassadorStatus } from "./actions";

interface Props {
  ambassadorId: string;
  currentStatus: string;
}

export default function AmbassadorActions({ ambassadorId, currentStatus }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = async (status: "active" | "inactive") => {
    setLoading(status === "active" ? "approve" : "reject");
    setError(null);
    const result = await updateAmbassadorStatus(ambassadorId, status);
    setLoading(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        {currentStatus !== "active" && (
          <button
            onClick={() => update("active")}
            disabled={loading !== null}
            className="px-3 py-1.5 bg-emerald-brand text-white text-xs font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
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
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
