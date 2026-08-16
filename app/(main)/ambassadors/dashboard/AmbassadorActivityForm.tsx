"use client";

import { useState, useTransition } from "react";
import {
  CAMPUS_ACTIVITY_TYPES,
  formatCampusProgramValue,
  type CampusActivityType,
} from "@/lib/campus";
import { recordAmbassadorActivity } from "./actions";

export default function AmbassadorActivityForm() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  return (
    <form
      className="space-y-4 rounded-xl border border-gray-200 bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        setMessage(null);
        startTransition(async () => {
          const result = await recordAmbassadorActivity({
            activityType: String(form.get("activityType")) as CampusActivityType,
            happenedOn: String(form.get("happenedOn") ?? ""),
            participantCount: Number(form.get("participantCount") ?? 0),
            notes: String(form.get("notes") ?? ""),
          });
          if (result.error) {
            setError(true);
            setMessage(result.error);
            return;
          }
          setError(false);
          setMessage("Campus activity recorded.");
          formElement.reset();
        });
      }}
    >
      <div>
        <h2 className="text-base font-semibold text-gray-950">Log completed activity</h2>
        <p className="mt-1 text-xs leading-5 text-gray-500">
          Record real operating activity, not projections. This helps the team understand what supports retention.
        </p>
      </div>
      {message ? <p className={`text-sm ${error ? "text-red-600" : "text-emerald-700"}`} role={error ? "alert" : "status"}>{message}</p> : null}
      <label className="block text-xs font-semibold text-gray-700">
        Activity
        <select name="activityType" className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm" defaultValue="prompt_shared">
          {CAMPUS_ACTIVITY_TYPES.map((type) => <option key={type} value={type}>{formatCampusProgramValue(type)}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-gray-700">
          Date
          <input name="happenedOn" type="date" required className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm" />
        </label>
        <label className="block text-xs font-semibold text-gray-700">
          Participants
          <input name="participantCount" type="number" min="0" max="10000" step="1" required className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm" />
        </label>
      </div>
      <label className="block text-xs font-semibold text-gray-700">
        Notes
        <textarea name="notes" rows={3} maxLength={1000} className="mt-1 min-h-24 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </label>
      <button disabled={isPending} className="min-h-11 rounded-lg bg-emerald-brand px-4 text-sm font-semibold text-white disabled:opacity-50">
        {isPending ? "Recording…" : "Record activity"}
      </button>
    </form>
  );
}
