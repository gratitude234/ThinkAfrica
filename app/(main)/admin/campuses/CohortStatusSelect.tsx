"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CAMPUS_COHORT_STATUSES,
  formatCampusProgramValue,
  type CampusCohortStatus,
} from "@/lib/campus";
import { updateCampusCohortStatus } from "./actions";

export default function CohortStatusSelect({
  cohortId,
  currentStatus,
}: {
  cohortId: string;
  currentStatus: CampusCohortStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(currentStatus);

  return (
    <div>
      <label className="sr-only" htmlFor={`cohort-status-${cohortId}`}>
        Cohort status
      </label>
      <select
        id={`cohort-status-${cohortId}`}
        value={status}
        disabled={isPending}
        className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold capitalize text-gray-700 disabled:opacity-60"
        onChange={(event) => {
          const status = event.target.value as CampusCohortStatus;
          setStatus(status);
          setError(null);
          startTransition(async () => {
            const result = await updateCampusCohortStatus(cohortId, status);
            if (result.error) {
              setStatus(currentStatus);
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {CAMPUS_COHORT_STATUSES.map((status) => (
          <option key={status} value={status}>
            {formatCampusProgramValue(status)}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-xs text-red-600" role="alert">{error}</p> : null}
    </div>
  );
}
