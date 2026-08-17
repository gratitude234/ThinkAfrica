"use client";

import { useState, useTransition } from "react";
import { RESEARCH_EXIT_METRICS } from "@/lib/research";
import { updateResearchExpansionTargets } from "./actions";

interface TargetValues {
  proposalsCreated: number | null;
  activeProjects: number | null;
  acceptedCollaborations: number | null;
  completedProjects: number | null;
  publicUpdates: number | null;
  multimediaAssets: number | null;
}

const INPUT =
  "mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100";

export default function ResearchTargetsForm({
  windowDays,
  targets,
}: {
  windowDays: number;
  targets: TargetValues;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <form
      className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setNotice(null);
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await updateResearchExpansionTargets({
            windowDays: String(form.get("windowDays") ?? ""),
            proposalsCreated: String(form.get("proposalsCreated") ?? ""),
            activeProjects: String(form.get("activeProjects") ?? ""),
            acceptedCollaborations: String(
              form.get("acceptedCollaborations") ?? ""
            ),
            completedProjects: String(form.get("completedProjects") ?? ""),
            publicUpdates: String(form.get("publicUpdates") ?? ""),
            multimediaAssets: String(form.get("multimediaAssets") ?? ""),
          });
          if (result.error) {
            setError(result.error);
            return;
          }
          setNotice("Targets saved. A new measurement window has started.");
        });
      }}
    >
      <div>
        <h2 className="text-lg font-semibold text-gray-950">Approve the exit gate</h2>
        <p className="mt-1 text-sm leading-6 text-gray-500">
          Blank targets stay visibly unset. Saving starts a fresh measurement
          window so prior activity is not presented as evidence against a new goal.
        </p>
      </div>
      <label htmlFor="research-window-days" className="mt-5 block text-sm font-semibold text-gray-800">
        Measurement window (days)
        <input
          id="research-window-days"
          name="windowDays"
          type="number"
          min={30}
          max={365}
          required
          defaultValue={windowDays}
          className={INPUT}
        />
      </label>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RESEARCH_EXIT_METRICS.map((metric) => (
          <label key={metric.key} htmlFor={`research-target-${metric.key}`} className="block text-sm font-semibold text-gray-800">
            {metric.label}
            <input
              id={`research-target-${metric.key}`}
              name={metric.key}
              type="number"
              min={1}
              step={1}
              defaultValue={targets[metric.key] ?? ""}
              className={INPUT}
              placeholder="Not set"
            />
            <span className="mt-1 block text-[11px] font-normal leading-4 text-gray-400">
              {metric.definition}
            </span>
          </label>
        ))}
      </div>
      {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mt-4 text-sm text-emerald-700">{notice}</p> : null}
      <button
        type="submit"
        disabled={isPending}
        className="mt-5 min-h-11 rounded-lg bg-emerald-brand px-5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save targets and restart window"}
      </button>
    </form>
  );
}
