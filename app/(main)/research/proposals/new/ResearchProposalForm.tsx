"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseResearchList } from "@/lib/research";
import { createResearchProposal } from "../../actions";

const INPUT =
  "mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100";
const LABEL = "block text-sm font-semibold text-gray-800";

export default function ResearchProposalForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await createResearchProposal({
            title: String(form.get("title") ?? ""),
            summary: String(form.get("summary") ?? ""),
            researchQuestion: String(form.get("researchQuestion") ?? ""),
            methodology: String(form.get("methodology") ?? ""),
            expectedOutput: String(form.get("expectedOutput") ?? ""),
            disciplines: parseResearchList(String(form.get("disciplines") ?? ""), 10),
            skillsNeeded: parseResearchList(String(form.get("skillsNeeded") ?? ""), 12),
            targetCompletionDate: String(form.get("targetCompletionDate") ?? ""),
            visibility: String(form.get("visibility") ?? "public") as
              | "public"
              | "members"
              | "private",
            recruitCollaborators: form.get("recruitCollaborators") === "on",
          });
          if (result.error || !result.slug) {
            setError(result.error ?? "Unable to create the proposal.");
            return;
          }
          router.push(`/research/projects/${result.slug}`);
        });
      }}
    >
      <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Inquiry
        </p>
        <h2 className="mt-1 text-lg font-semibold text-gray-950">Frame the research</h2>
        <div className="mt-5 space-y-5">
          <label className={LABEL} htmlFor="research-project-title">
            Project title
            <input
              id="research-project-title"
              name="title"
              required
              minLength={5}
              maxLength={160}
              className={INPUT}
              placeholder="How informal transit shapes access to work"
            />
          </label>
          <label className={LABEL} htmlFor="research-project-summary">
            Proposal summary
            <textarea
              id="research-project-summary"
              name="summary"
              required
              minLength={30}
              maxLength={1000}
              rows={4}
              className={INPUT}
              placeholder="Describe the problem, its context, and why this inquiry matters."
            />
          </label>
          <label className={LABEL} htmlFor="research-question">
            Research question
            <textarea
              id="research-question"
              name="researchQuestion"
              required
              minLength={10}
              maxLength={500}
              rows={3}
              className={INPUT}
              placeholder="State the question this project will be able to answer."
            />
          </label>
          <label className={LABEL} htmlFor="research-methodology">
            Proposed method
            <textarea
              id="research-methodology"
              name="methodology"
              required
              minLength={10}
              maxLength={1500}
              rows={5}
              className={INPUT}
              placeholder="Explain the data, fieldwork, interviews, analysis, or review you plan to use."
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Delivery
        </p>
        <h2 className="mt-1 text-lg font-semibold text-gray-950">Define the work around it</h2>
        <div className="mt-5 space-y-5">
          <label className={LABEL} htmlFor="research-expected-output">
            Expected output
            <input
              id="research-expected-output"
              name="expectedOutput"
              required
              minLength={5}
              maxLength={300}
              className={INPUT}
              placeholder="Reviewed paper, dataset, field report, documentary…"
            />
          </label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className={LABEL} htmlFor="research-disciplines">
              Disciplines
              <input
                id="research-disciplines"
                name="disciplines"
                required
                className={INPUT}
                placeholder="Urban studies, economics"
              />
              <span className="mt-1 block text-xs font-normal text-gray-500">Comma separated.</span>
            </label>
            <label className={LABEL} htmlFor="research-skills">
              Skills needed
              <input
                id="research-skills"
                name="skillsNeeded"
                className={INPUT}
                placeholder="Interviewing, GIS, data analysis"
              />
              <span className="mt-1 block text-xs font-normal text-gray-500">Used to make collaborator needs concrete.</span>
            </label>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className={LABEL} htmlFor="research-target-date">
              Target completion
              <input id="research-target-date" name="targetCompletionDate" type="date" className={INPUT} />
            </label>
            <label className={LABEL} htmlFor="research-visibility">
              Visibility
              <select id="research-visibility" name="visibility" defaultValue="public" className={INPUT}>
                <option value="public">Public</option>
                <option value="members">Signed-in members</option>
                <option value="private">Project participants</option>
              </select>
            </label>
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-gray-700">
            <input name="recruitCollaborators" type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-700" />
            <span>
              <span className="block font-semibold text-gray-900">Open collaborator requests now</span>
              Move the proposal directly into recruiting so researchers can request a role.
            </span>
          </label>
        </div>
      </section>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="min-h-12 w-full rounded-xl bg-emerald-brand px-5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
      >
        {isPending ? "Creating proposal…" : "Create research proposal"}
      </button>
    </form>
  );
}
