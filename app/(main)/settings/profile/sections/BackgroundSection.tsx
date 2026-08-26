"use client";

import { useState } from "react";
import UniversitySelect from "@/components/ui/UniversitySelect";
import { AFRICAN_COUNTRIES } from "@/lib/academicIdentity";
import type { ProfileCommandCenterModel } from "@/lib/profileCommandCenter";
import { saveBackgroundSection } from "../actions";
import SectionShell from "../SectionShell";
import { useSectionSave } from "../useSectionSave";
import type { CommandCenterDraft } from "../ProfileCommandCenter";
import { Field, FIELD_INPUT, Toggle } from "./fields";

export default function BackgroundSection({
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
  const [graduationYear, setGraduationYear] = useState(model.background.graduationYear);
  const [openToMentoring, setOpenToMentoring] = useState(
    model.background.openToMentoring
  );

  const isDirty =
    draft.country !== model.background.country ||
    draft.university !== model.background.university ||
    draft.fieldOfStudy !== model.background.fieldOfStudy ||
    draft.professionalTitle !== model.background.professionalTitle ||
    draft.organizationName !== model.background.organizationName ||
    draft.organizationWebsite !== model.background.organizationWebsite ||
    graduationYear !== model.background.graduationYear ||
    openToMentoring !== model.background.openToMentoring;

  const { status, error, save } = useSectionSave({
    section: "background",
    profileId: model.identity.id,
    isDirty,
  });

  // Which fields this profile needs follows the onboarding path, not the
  // public profile type: a researcher on the non-student path is not missing
  // a university.
  const isStudentPath = model.isStudentPath;
  const yearError =
    graduationYear && !/^\d{4}$/.test(graduationYear)
      ? "Enter a four-digit year."
      : graduationYear && (Number(graduationYear) < 2015 || Number(graduationYear) > 2040)
        ? "Enter a year between 2015 and 2040."
        : null;

  return (
    <SectionShell
      section="background"
      status={status}
      error={error}
      canSave={!yearError}
      onSave={() =>
        void save(async () => {
          const result = await saveBackgroundSection({
            country: draft.country,
            university: draft.university,
            fieldOfStudy: draft.fieldOfStudy,
            graduationYear,
            professionalTitle: draft.professionalTitle,
            organizationName: draft.organizationName,
            organizationWebsite: draft.organizationWebsite,
            openToMentoring,
          });
          if (result.ok) {
            onSaved({
              country: draft.country,
              university: draft.university,
              fieldOfStudy: draft.fieldOfStudy,
              professionalTitle: draft.professionalTitle,
              organizationName: draft.organizationName,
              organizationWebsite: draft.organizationWebsite,
            });
          }
          return result;
        })
      }
    >
      <Field label="Country">
        {(props) => (
          <select
            {...props}
            value={draft.country}
            onChange={(event) => {
              const country = event.target.value;
              setDraft((current) => ({
                ...current,
                country,
                university: country !== current.country ? "" : current.university,
              }));
            }}
            className={FIELD_INPUT}
          >
            <option value="">Select country</option>
            {AFRICAN_COUNTRIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        )}
      </Field>

      <div>
        <p className="mb-1 block text-sm font-medium text-ink-soft">
          University{" "}
          {!isStudentPath ? (
            <span className="text-xs font-normal text-ink-muted">(optional)</span>
          ) : null}
        </p>
        <UniversitySelect
          value={draft.university}
          onChange={(university) =>
            setDraft((current) => ({ ...current, university }))
          }
          country={draft.country}
          disabled={!draft.country}
        />
      </div>

      <Field label="Field of study" optional={!isStudentPath}>
        {(props) => (
          <input
            {...props}
            type="text"
            value={draft.fieldOfStudy}
            placeholder="e.g. Computer Science, Law, Economics"
            onChange={(event) =>
              setDraft((current) => ({ ...current, fieldOfStudy: event.target.value }))
            }
            className={FIELD_INPUT}
          />
        )}
      </Field>

      <Field
        label="Graduation year"
        optional
        error={yearError}
        help="Your profile stays active after you graduate."
      >
        {(props) => (
          <input
            {...props}
            type="number"
            min={2015}
            max={2040}
            value={graduationYear}
            placeholder="e.g. 2027"
            onChange={(event) => setGraduationYear(event.target.value)}
            className={FIELD_INPUT}
          />
        )}
      </Field>

      <Field
        label="Professional headline"
        optional={isStudentPath}
        help="The line readers see under your name when you are not a student."
      >
        {(props) => (
          <input
            {...props}
            type="text"
            value={draft.professionalTitle}
            placeholder="e.g. Program manager, founder, policy analyst"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                professionalTitle: event.target.value,
              }))
            }
            className={FIELD_INPUT}
          />
        )}
      </Field>

      <Field label="Organization" optional>
        {(props) => (
          <input
            {...props}
            type="text"
            value={draft.organizationName}
            placeholder="e.g. Indegenius, ministry, newsroom, company"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                organizationName: event.target.value,
              }))
            }
            className={FIELD_INPUT}
          />
        )}
      </Field>

      <Field label="Organization website" optional>
        {(props) => (
          <input
            {...props}
            type="url"
            value={draft.organizationWebsite}
            placeholder="https://example.org"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                organizationWebsite: event.target.value,
              }))
            }
            className={FIELD_INPUT}
          />
        )}
      </Field>

      {model.identity.isAlumni || graduationYear ? (
        <Toggle
          label="Open to mentoring"
          description="Students can find you in the alumni directory and reach out."
          checked={openToMentoring}
          onChange={setOpenToMentoring}
        />
      ) : null}
    </SectionShell>
  );
}
