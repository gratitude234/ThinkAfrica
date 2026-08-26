"use client";

import { useState } from "react";
import {
  RESEARCH_PROJECT_ROLES,
  formatResearchValue,
  parseResearchList,
} from "@/lib/research";
import type { ProfileCommandCenterModel } from "@/lib/profileCommandCenter";
import { saveResearchSection } from "../actions";
import SectionShell from "../SectionShell";
import { useSectionSave } from "../useSectionSave";
import type { CommandCenterDraft } from "../ProfileCommandCenter";
import { ChipToggle, Field, FIELD_INPUT } from "./fields";

/**
 * Research identity, edited in the same place as everything else a visitor
 * sees.
 *
 * The data stays in `researcher_profiles` and the validation stays in the
 * research domain's own server action: ORCID format, URL safety and the
 * headline limits are its rules, not this page's. What is unified is where an
 * author goes to change them.
 */
export default function ResearchSection({
  model,
  draft,
  setDraft,
  onSaved,
}: {
  model: ProfileCommandCenterModel;
  draft: CommandCenterDraft;
  setDraft: (update: (current: CommandCenterDraft) => CommandCenterDraft) => void;
  onSaved: (patch: Partial<CommandCenterDraft>) => void;
}) {
  const [overview, setOverview] = useState(model.research.overview);
  const [collaborationStatus, setCollaborationStatus] = useState(
    model.research.collaborationStatus
  );
  const [preferredRoles, setPreferredRoles] = useState<string[]>(
    model.research.preferredRoles
  );
  const [interestsText, setInterestsText] = useState(
    model.research.researchInterests.join(", ")
  );
  const [methodsText, setMethodsText] = useState(model.research.methods.join(", "));

  const isDirty =
    draft.researchHeadline !== model.research.headline ||
    overview !== model.research.overview ||
    interestsText !== model.research.researchInterests.join(", ") ||
    methodsText !== model.research.methods.join(", ") ||
    collaborationStatus !== model.research.collaborationStatus ||
    preferredRoles.join("|") !== model.research.preferredRoles.join("|") ||
    draft.orcidUrl !== model.research.orcidUrl ||
    draft.researchWebsiteUrl !== model.research.websiteUrl;

  const { status, error, save } = useSectionSave({
    section: "research",
    profileId: model.identity.id,
    isDirty,
  });

  return (
    <SectionShell
      section="research"
      status={status}
      error={error}
      onSave={() =>
        void save(async () => {
          const researchInterests = parseResearchList(interestsText, 20);
          const methods = parseResearchList(methodsText, 20);
          const result = await saveResearchSection({
            headline: draft.researchHeadline,
            overview,
            researchInterests,
            methods,
            collaborationStatus,
            preferredRoles,
            orcidUrl: draft.orcidUrl,
            websiteUrl: draft.researchWebsiteUrl,
          });
          if (result.ok) {
            onSaved({
              researchHeadline: draft.researchHeadline,
              researchInterests,
              researchMethods: methods,
              orcidUrl: draft.orcidUrl,
              researchWebsiteUrl: draft.researchWebsiteUrl,
            });
            setDraft((current) => ({
              ...current,
              researchInterests,
              researchMethods: methods,
            }));
          }
          return result;
        })
      }
    >
      <Field label="Research headline" optional>
        {(props) => (
          <input
            {...props}
            type="text"
            maxLength={160}
            value={draft.researchHeadline}
            placeholder="Public health researcher studying primary-care access"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                researchHeadline: event.target.value,
              }))
            }
            className={FIELD_INPUT}
          />
        )}
      </Field>

      <Field label="Research overview" optional>
        {(props) => (
          <textarea
            {...props}
            rows={4}
            maxLength={1500}
            value={overview}
            placeholder="Describe the questions, contexts, and contribution that connect your research work."
            onChange={(event) => setOverview(event.target.value)}
            className={`${FIELD_INPUT} resize-none`}
          />
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Research interests" optional help="Separate with commas.">
          {(props) => (
            <input
              {...props}
              type="text"
              value={interestsText}
              placeholder="Health systems, health financing"
              onChange={(event) => setInterestsText(event.target.value)}
              className={FIELD_INPUT}
            />
          )}
        </Field>
        <Field label="Methods" optional help="Separate with commas.">
          {(props) => (
            <input
              {...props}
              type="text"
              value={methodsText}
              placeholder="Interviews, surveys, causal inference"
              onChange={(event) => setMethodsText(event.target.value)}
              className={FIELD_INPUT}
            />
          )}
        </Field>
      </div>

      <Field label="Collaboration status">
        {(props) => (
          <select
            {...props}
            value={collaborationStatus}
            onChange={(event) => setCollaborationStatus(event.target.value)}
            className={FIELD_INPUT}
          >
            <option value="open">Open to requests</option>
            <option value="selective">Selective</option>
            <option value="not_open">Not currently open</option>
          </select>
        )}
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-soft">
          Preferred project roles
        </legend>
        <div className="flex flex-wrap gap-2">
          {RESEARCH_PROJECT_ROLES.filter((role) => role !== "lead").map((role) => (
            <ChipToggle
              key={role}
              label={formatResearchValue(role)}
              selected={preferredRoles.includes(role)}
              onToggle={() =>
                setPreferredRoles((current) =>
                  current.includes(role)
                    ? current.filter((item) => item !== role)
                    : [...current, role]
                )
              }
            />
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="ORCID URL" optional>
          {(props) => (
            <input
              {...props}
              type="url"
              value={draft.orcidUrl}
              placeholder="https://orcid.org/0000-0000-0000-0000"
              onChange={(event) =>
                setDraft((current) => ({ ...current, orcidUrl: event.target.value }))
              }
              className={FIELD_INPUT}
            />
          )}
        </Field>
        <Field label="Research website" optional>
          {(props) => (
            <input
              {...props}
              type="url"
              value={draft.researchWebsiteUrl}
              placeholder="https://example.org"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  researchWebsiteUrl: event.target.value,
                }))
              }
              className={FIELD_INPUT}
            />
          )}
        </Field>
      </div>
    </SectionShell>
  );
}
