"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCampusCohortTargets } from "./actions";

type TargetKey = "d7" | "d30" | "second" | "response";

const TARGETS: Array<{ key: TargetKey; label: string }> = [
  { key: "d7", label: "D7 %" },
  { key: "d30", label: "D30 %" },
  { key: "second", label: "Second publication %" },
  { key: "response", label: "Response received %" },
];

export default function CohortTargetsForm({
  cohortId,
  initialTargets,
}: {
  cohortId: string;
  initialTargets: Record<TargetKey, number | null>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  return (
    <form
      className="mt-4 border-t border-gray-100 pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setMessage(null);
        startTransition(async () => {
          const result = await updateCampusCohortTargets({
            cohortId,
            d7RetentionTarget: String(form.get("d7") ?? ""),
            d30RetentionTarget: String(form.get("d30") ?? ""),
            secondPublication30dTarget: String(form.get("second") ?? ""),
            responseReceived30dTarget: String(form.get("response") ?? ""),
          });
          if (result.error) {
            setError(true);
            setMessage(result.error);
            return;
          }
          setError(false);
          setMessage("Targets updated.");
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {TARGETS.map((target) => (
            <label key={target.key} className="text-[11px] font-semibold text-gray-600">
              {target.label}
              <input
                name={target.key}
                type="number"
                min="0"
                max="100"
                step="0.01"
                defaultValue={initialTargets[target.key] ?? ""}
                placeholder="Not set"
                className="mt-1 min-h-11 w-full rounded-lg border border-gray-200 px-3 text-sm"
              />
            </label>
          ))}
        </div>
        <button disabled={isPending} className="min-h-11 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 disabled:opacity-50">
          {isPending ? "Saving…" : "Save targets"}
        </button>
      </div>
      {message ? <p className={`mt-2 text-xs ${error ? "text-red-600" : "text-emerald-700"}`} role={error ? "alert" : "status"}>{message}</p> : null}
    </form>
  );
}
