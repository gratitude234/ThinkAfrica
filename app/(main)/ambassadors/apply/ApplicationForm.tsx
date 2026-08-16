"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { submitAmbassadorApplication } from "./actions";

export default function ApplicationForm({ university }: { university: string }) {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [motivation, setMotivation] = useState("");
  const [outreachPlan, setOutreachPlan] = useState("");

  if (submitted) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <h2 className="text-xl font-semibold text-gray-950">Application submitted</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          The team will review your plan for {university}. If approved, your Ambassador dashboard will contain the active prompt, recurring program, and activity log.
        </p>
        <Link href="/ambassadors" className="mt-5 inline-flex min-h-11 items-center font-semibold text-emerald-700">
          Back to Ambassadors →
        </Link>
      </div>
    );
  }

  return (
    <form
      className="space-y-5 rounded-xl border border-gray-200 bg-white p-6"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await submitAmbassadorApplication({ motivation, outreachPlan });
          if (result.error) {
            setError(result.error);
            return;
          }
          setSubmitted(true);
        });
      }}
    >
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600" role="alert">{error}</p> : null}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Selected campus</p>
        <p className="mt-1 text-base font-semibold text-gray-950">{university}</p>
      </div>
      <label className="block text-sm font-medium text-gray-700">
        Why do you want to lead this campus cohort?
        <textarea
          required
          minLength={40}
          maxLength={1500}
          rows={5}
          value={motivation}
          onChange={(event) => setMotivation(event.target.value)}
          className="mt-1 min-h-32 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
        />
      </label>
      <label className="block text-sm font-medium text-gray-700">
        How will you run prompts, response loops, and recurring programs?
        <textarea
          required
          minLength={40}
          maxLength={1500}
          rows={5}
          value={outreachPlan}
          onChange={(event) => setOutreachPlan(event.target.value)}
          className="mt-1 min-h-32 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="min-h-11 rounded-lg bg-emerald-brand px-6 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isPending ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}
