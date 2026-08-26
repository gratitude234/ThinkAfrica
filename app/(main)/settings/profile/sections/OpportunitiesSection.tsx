"use client";

import { useState } from "react";
import TagInput from "@/components/ui/TagInput";
import { OPPORTUNITY_LABELS, OPPORTUNITY_TYPES } from "@/lib/opportunities";
import type { ProfileCommandCenterModel } from "@/lib/profileCommandCenter";
import { saveOpportunitiesSection } from "../actions";
import SectionShell from "../SectionShell";
import { useSectionSave } from "../useSectionSave";
import type { CommandCenterDraft } from "../ProfileCommandCenter";
import { ChipToggle, Field, FIELD_INPUT, Toggle } from "./fields";

/**
 * The opportunity signal, edited here but stored where it always was.
 *
 * `talent_profiles` keeps its own table, its own RLS and its own visibility
 * rule. Nothing in this section moves into `public.profiles`: a selector's
 * view of an author and a reader's view of an author are different questions
 * with different audiences, and merging the storage would answer both with
 * one permission.
 */
export default function OpportunitiesSection({
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
  const [skills, setSkills] = useState<string[]>(model.opportunities.skills);
  const [types, setTypes] = useState<string[]>(model.opportunities.opportunityTypes);
  const [cvUrl, setCvUrl] = useState(model.opportunities.cvUrl);
  const [linkedinUrl, setLinkedinUrl] = useState(model.opportunities.linkedinUrl);

  const isDirty =
    draft.openToOpportunities !== model.opportunities.openToOpportunities ||
    draft.opportunityVisibility !== model.opportunities.visibility ||
    skills.join("|") !== model.opportunities.skills.join("|") ||
    types.join("|") !== model.opportunities.opportunityTypes.join("|") ||
    cvUrl !== model.opportunities.cvUrl ||
    linkedinUrl !== model.opportunities.linkedinUrl;

  const { status, error, save } = useSectionSave({
    section: "opportunities",
    profileId: model.identity.id,
    isDirty,
  });

  const publiclyVisible =
    draft.openToOpportunities && draft.opportunityVisibility === "public";

  return (
    <SectionShell
      section="opportunities"
      status={status}
      error={error}
      footnote="Your skills, links and opportunity types are only ever shown to people who can already see your availability. They are never part of your public profile text."
      onSave={() =>
        void save(async () => {
          const result = await saveOpportunitiesSection({
            openToOpportunities: draft.openToOpportunities,
            opportunityTypes: types,
            skills,
            cvUrl,
            linkedinUrl,
            visibility: draft.opportunityVisibility,
          });
          if (result.ok) {
            onSaved({
              openToOpportunities: draft.openToOpportunities,
              opportunityVisibility: draft.opportunityVisibility,
            });
          }
          return result;
        })
      }
    >
      <Toggle
        label="Open to opportunities"
        description="Shows an availability badge on your profile and lets selectors contact you."
        checked={draft.openToOpportunities}
        onChange={(next) =>
          setDraft((current) => ({ ...current, openToOpportunities: next }))
        }
      />

      <Field
        label="Who can see your availability"
        help={
          publiclyVisible
            ? "Anyone visiting your profile sees the badge and can send an inquiry."
            : draft.opportunityVisibility === "partners_only"
              ? "Only signed-in members see the badge."
              : "Nobody sees the badge. Your details stay saved."
        }
      >
        {(props) => (
          <select
            {...props}
            value={draft.opportunityVisibility}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                opportunityVisibility: event.target.value,
              }))
            }
            className={FIELD_INPUT}
          >
            <option value="public">Public: anyone visiting your profile</option>
            <option value="partners_only">Members only: signed-in members</option>
            <option value="private">Private: nobody</option>
          </select>
        )}
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-soft">
          Opportunity types
        </legend>
        <div className="flex flex-wrap gap-2">
          {OPPORTUNITY_TYPES.map((type) => (
            <ChipToggle
              key={type}
              label={OPPORTUNITY_LABELS[type]}
              selected={types.includes(type)}
              onToggle={() =>
                setTypes((current) =>
                  current.includes(type)
                    ? current.filter((item) => item !== type)
                    : [...current, type]
                )
              }
            />
          ))}
        </div>
      </fieldset>

      <div>
        <p className="mb-1 block text-sm font-medium text-ink-soft">Skills</p>
        <TagInput
          value={skills}
          onChange={setSkills}
          placeholder="Add a skill and press Enter"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="CV link" optional>
          {(props) => (
            <input
              {...props}
              type="url"
              value={cvUrl}
              placeholder="https://…"
              onChange={(event) => setCvUrl(event.target.value)}
              className={FIELD_INPUT}
            />
          )}
        </Field>
        <Field label="LinkedIn" optional>
          {(props) => (
            <input
              {...props}
              type="url"
              value={linkedinUrl}
              placeholder="https://linkedin.com/in/…"
              onChange={(event) => setLinkedinUrl(event.target.value)}
              className={FIELD_INPUT}
            />
          )}
        </Field>
      </div>
    </SectionShell>
  );
}
