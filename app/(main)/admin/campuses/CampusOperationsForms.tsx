"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CAMPUS_PROGRAM_FORMATS,
  CAMPUS_PROGRAM_RECURRENCES,
  CAMPUS_PROMPT_CADENCES,
  formatCampusProgramValue,
} from "@/lib/campus";
import {
  createCampusCohort,
  createCampusEditorialPrompt,
  createCampusProgram,
} from "./actions";

interface CohortOption {
  id: string;
  university: string;
  status: string;
}

const INPUT_CLASS =
  "min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand";
const LABEL_CLASS = "block text-xs font-semibold text-gray-700";

function FormStatus({ message, error }: { message: string | null; error: boolean }) {
  if (!message) return null;
  return (
    <p className={`text-sm ${error ? "text-red-600" : "text-emerald-700"}`} role={error ? "alert" : "status"}>
      {message}
    </p>
  );
}

export default function CampusOperationsForms({ cohorts }: { cohorts: CohortOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  const run = (task: () => Promise<{ error: string | null }>, success: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await task();
      if (result.error) {
        setHasError(true);
        setMessage(result.error);
        return;
      }
      setHasError(false);
      setMessage(success);
      router.refresh();
    });
  };

  return (
    <section className="space-y-4" aria-labelledby="campus-operations-title">
      <div>
        <h2 id="campus-operations-title" className="text-lg font-semibold text-gray-900">
          Campus operations
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Select campuses first, then give Ambassadors one prompt and a recurring program to operate.
        </p>
      </div>

      <FormStatus message={message} error={hasError} />

      <div className="grid gap-4 xl:grid-cols-3">
        <form
          className="space-y-4 rounded-xl border border-gray-200 bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(
              () =>
                createCampusCohort({
                  university: String(form.get("university") ?? ""),
                  country: String(form.get("country") ?? ""),
                  status: String(form.get("status") ?? "selected") as "selected" | "active",
                  cohortStart: String(form.get("cohortStart") ?? ""),
                  cohortEnd: String(form.get("cohortEnd") ?? ""),
                  d7RetentionTarget: String(form.get("d7Target") ?? ""),
                  d30RetentionTarget: String(form.get("d30Target") ?? ""),
                  secondPublication30dTarget: String(form.get("secondTarget") ?? ""),
                  responseReceived30dTarget: String(form.get("responseTarget") ?? ""),
                }),
              "Campus cohort created."
            );
          }}
        >
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Select a campus</h3>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              Leave targets blank until the operating team approves them.
            </p>
          </div>
          <label className={LABEL_CLASS}>
            University
            <input name="university" required maxLength={160} className={`${INPUT_CLASS} mt-1`} />
          </label>
          <label className={LABEL_CLASS}>
            Country
            <input name="country" maxLength={100} className={`${INPUT_CLASS} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={LABEL_CLASS}>
              Start
              <input name="cohortStart" type="date" required className={`${INPUT_CLASS} mt-1`} />
            </label>
            <label className={LABEL_CLASS}>
              End
              <input name="cohortEnd" type="date" className={`${INPUT_CLASS} mt-1`} />
            </label>
          </div>
          <label className={LABEL_CLASS}>
            Status
            <select name="status" className={`${INPUT_CLASS} mt-1`} defaultValue="selected">
              <option value="selected">Selected</option>
              <option value="active">Active</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["d7Target", "D7 target %"],
              ["d30Target", "D30 target %"],
              ["secondTarget", "Second publication %"],
              ["responseTarget", "Response received %"],
            ].map(([name, label]) => (
              <label key={name} className={LABEL_CLASS}>
                {label}
                <input
                  name={name}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className={`${INPUT_CLASS} mt-1`}
                />
              </label>
            ))}
          </div>
          <button disabled={isPending} className="min-h-11 w-full rounded-lg bg-emerald-brand px-4 text-sm font-semibold text-white disabled:opacity-50">
            {isPending ? "Saving…" : "Create cohort"}
          </button>
        </form>

        <form
          className="space-y-4 rounded-xl border border-gray-200 bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(
              () =>
                createCampusEditorialPrompt({
                  cohortId: String(form.get("cohortId") ?? ""),
                  title: String(form.get("title") ?? ""),
                  promptText: String(form.get("promptText") ?? ""),
                  responseQuestion: String(form.get("responseQuestion") ?? ""),
                  topic: String(form.get("topic") ?? ""),
                  cadence: String(form.get("cadence") ?? "weekly") as "one_off" | "weekly" | "monthly",
                  startsAt: String(form.get("startsAt") ?? ""),
                  endsAt: String(form.get("endsAt") ?? ""),
                }),
              "Editorial prompt created."
            );
          }}
        >
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Publish an editorial prompt</h3>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              Each prompt should invite both an original contribution and a useful response.
            </p>
          </div>
          <label className={LABEL_CLASS}>
            Cohort
            <select name="cohortId" required className={`${INPUT_CLASS} mt-1`} defaultValue="">
              <option value="" disabled>Select campus</option>
              {cohorts.map((cohort) => (
                <option key={cohort.id} value={cohort.id}>{cohort.university}</option>
              ))}
            </select>
          </label>
          <label className={LABEL_CLASS}>
            Title
            <input name="title" required maxLength={120} className={`${INPUT_CLASS} mt-1`} />
          </label>
          <label className={LABEL_CLASS}>
            Prompt
            <textarea name="promptText" required minLength={10} maxLength={1000} rows={4} className={`${INPUT_CLASS} mt-1 resize-y`} />
          </label>
          <label className={LABEL_CLASS}>
            Response question
            <textarea name="responseQuestion" maxLength={500} rows={2} className={`${INPUT_CLASS} mt-1 resize-y`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={LABEL_CLASS}>
              Topic
              <input name="topic" maxLength={80} className={`${INPUT_CLASS} mt-1`} />
            </label>
            <label className={LABEL_CLASS}>
              Cadence
              <select name="cadence" className={`${INPUT_CLASS} mt-1`} defaultValue="weekly">
                {CAMPUS_PROMPT_CADENCES.map((value) => (
                  <option key={value} value={value}>{formatCampusProgramValue(value)}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={LABEL_CLASS}>
              Starts
              <input name="startsAt" type="datetime-local" required className={`${INPUT_CLASS} mt-1`} />
            </label>
            <label className={LABEL_CLASS}>
              Ends
              <input name="endsAt" type="datetime-local" className={`${INPUT_CLASS} mt-1`} />
            </label>
          </div>
          <button disabled={isPending || cohorts.length === 0} className="min-h-11 w-full rounded-lg bg-emerald-brand px-4 text-sm font-semibold text-white disabled:opacity-50">
            {isPending ? "Saving…" : "Create prompt"}
          </button>
        </form>

        <form
          className="space-y-4 rounded-xl border border-gray-200 bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(
              () =>
                createCampusProgram({
                  cohortId: String(form.get("cohortId") ?? ""),
                  title: String(form.get("title") ?? ""),
                  description: String(form.get("description") ?? ""),
                  format: String(form.get("format") ?? "writing_circle") as "writing_circle" | "response_circle" | "publication_clinic" | "debate_night",
                  recurrence: String(form.get("recurrence") ?? "weekly") as "weekly" | "fortnightly" | "monthly" | "one_off",
                  nextSessionAt: String(form.get("nextSessionAt") ?? ""),
                }),
              "Recurring program created."
            );
          }}
        >
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Schedule a recurring program</h3>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              Give Ambassadors a repeatable format instead of isolated events.
            </p>
          </div>
          <label className={LABEL_CLASS}>
            Cohort
            <select name="cohortId" required className={`${INPUT_CLASS} mt-1`} defaultValue="">
              <option value="" disabled>Select campus</option>
              {cohorts.map((cohort) => (
                <option key={cohort.id} value={cohort.id}>{cohort.university}</option>
              ))}
            </select>
          </label>
          <label className={LABEL_CLASS}>
            Title
            <input name="title" required maxLength={120} className={`${INPUT_CLASS} mt-1`} />
          </label>
          <label className={LABEL_CLASS}>
            Description
            <textarea name="description" required minLength={10} maxLength={1000} rows={4} className={`${INPUT_CLASS} mt-1 resize-y`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={LABEL_CLASS}>
              Format
              <select name="format" className={`${INPUT_CLASS} mt-1`} defaultValue="writing_circle">
                {CAMPUS_PROGRAM_FORMATS.map((value) => (
                  <option key={value} value={value}>{formatCampusProgramValue(value)}</option>
                ))}
              </select>
            </label>
            <label className={LABEL_CLASS}>
              Recurrence
              <select name="recurrence" className={`${INPUT_CLASS} mt-1`} defaultValue="weekly">
                {CAMPUS_PROGRAM_RECURRENCES.map((value) => (
                  <option key={value} value={value}>{formatCampusProgramValue(value)}</option>
                ))}
              </select>
            </label>
          </div>
          <label className={LABEL_CLASS}>
            Next session
            <input name="nextSessionAt" type="datetime-local" className={`${INPUT_CLASS} mt-1`} />
          </label>
          <button disabled={isPending || cohorts.length === 0} className="min-h-11 w-full rounded-lg bg-emerald-brand px-4 text-sm font-semibold text-white disabled:opacity-50">
            {isPending ? "Saving…" : "Create program"}
          </button>
        </form>
      </div>
    </section>
  );
}
