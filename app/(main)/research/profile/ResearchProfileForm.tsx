"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  RESEARCH_PROJECT_ROLES,
  formatResearchValue,
  parseResearchList,
  type ResearchCollaborationStatus,
} from "@/lib/research";
import { updateResearcherProfile } from "../actions";

interface ResearchProfileFormProps {
  initialProfile: {
    headline: string | null;
    overview: string | null;
    research_interests: string[];
    methods: string[];
    collaboration_status: ResearchCollaborationStatus;
    preferred_roles: string[];
    orcid_url: string | null;
    website_url: string | null;
  } | null;
}

const INPUT =
  "mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100";

export default function ResearchProfileForm({ initialProfile }: ResearchProfileFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const initialRoles = new Set(initialProfile?.preferred_roles ?? []);

  return (
    <form
      className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setNotice(null);
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await updateResearcherProfile({
            headline: String(form.get("headline") ?? ""),
            overview: String(form.get("overview") ?? ""),
            researchInterests: parseResearchList(String(form.get("interests") ?? ""), 20),
            methods: parseResearchList(String(form.get("methods") ?? ""), 20),
            collaborationStatus: String(form.get("collaborationStatus") ?? "selective") as ResearchCollaborationStatus,
            preferredRoles: form.getAll("preferredRoles").map(String),
            orcidUrl: String(form.get("orcidUrl") ?? ""),
            websiteUrl: String(form.get("websiteUrl") ?? ""),
          });
          if (result.error) {
            setError(result.error);
            return;
          }
          setNotice("Research profile updated.");
          router.refresh();
        });
      }}
    >
      <label className="block text-sm font-semibold text-gray-800" htmlFor="research-headline">
        Research headline
        <input
          id="research-headline"
          name="headline"
          minLength={3}
          maxLength={160}
          defaultValue={initialProfile?.headline ?? ""}
          className={INPUT}
          placeholder="Public health researcher studying primary-care access"
        />
      </label>
      <label className="block text-sm font-semibold text-gray-800" htmlFor="research-overview">
        Research overview
        <textarea
          id="research-overview"
          name="overview"
          maxLength={1500}
          rows={5}
          defaultValue={initialProfile?.overview ?? ""}
          className={INPUT}
          placeholder="Describe the questions, contexts, and contribution that connect your research work."
        />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-gray-800" htmlFor="research-interests">
          Research interests
          <input
            id="research-interests"
            name="interests"
            defaultValue={(initialProfile?.research_interests ?? []).join(", ")}
            className={INPUT}
            placeholder="Health systems, health financing"
          />
        </label>
        <label className="block text-sm font-semibold text-gray-800" htmlFor="research-methods">
          Methods
          <input
            id="research-methods"
            name="methods"
            defaultValue={(initialProfile?.methods ?? []).join(", ")}
            className={INPUT}
            placeholder="Interviews, surveys, causal inference"
          />
        </label>
      </div>
      <label className="block text-sm font-semibold text-gray-800" htmlFor="research-collaboration-status">
        Collaboration status
        <select
          id="research-collaboration-status"
          name="collaborationStatus"
          defaultValue={initialProfile?.collaboration_status ?? "selective"}
          className={INPUT}
        >
          <option value="open">Open to requests</option>
          <option value="selective">Selective</option>
          <option value="not_open">Not currently open</option>
        </select>
      </label>
      <fieldset>
        <legend className="text-sm font-semibold text-gray-800">Preferred project roles</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {RESEARCH_PROJECT_ROLES.filter((role) => role !== "lead").map((role) => (
            <label key={role} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="preferredRoles"
                value={role}
                defaultChecked={initialRoles.has(role)}
                className="h-4 w-4 accent-emerald-700"
              />
              {formatResearchValue(role)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-gray-800" htmlFor="research-orcid">
          ORCID URL
          <input id="research-orcid" name="orcidUrl" type="url" defaultValue={initialProfile?.orcid_url ?? ""} className={INPUT} placeholder="https://orcid.org/0000-0000-0000-0000" />
        </label>
        <label className="block text-sm font-semibold text-gray-800" htmlFor="research-website">
          Research website
          <input id="research-website" name="websiteUrl" type="url" defaultValue={initialProfile?.website_url ?? ""} className={INPUT} placeholder="https://…" />
        </label>
      </div>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
      <button type="submit" disabled={isPending} className="min-h-11 rounded-xl bg-emerald-brand px-5 text-sm font-semibold text-white disabled:opacity-60">
        {isPending ? "Saving…" : "Save research profile"}
      </button>
    </form>
  );
}
