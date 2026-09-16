"use client";

import { useState } from "react";
import AvatarUploader from "@/app/(main)/settings/AvatarUploader";
import { saveProfileMedia } from "@/app/(main)/settings/profileActions";
import UniversitySelect from "@/components/ui/UniversitySelect";
import { AFRICAN_COUNTRIES } from "@/lib/academicIdentity";
import {
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_HEADLINE_MAX_LENGTH,
  PROFILE_NAME_MAX_LENGTH,
} from "@/lib/profileIdentity";
import {
  getGraduationYearError,
  getProfileDetailsError,
  GRADUATION_YEAR_MAX,
  GRADUATION_YEAR_MIN,
  type ProfileDetailsDraft,
  type ProfileSettingsModel,
} from "@/lib/profileSettings";
import {
  getProfileUsernameError,
  normalizeProfileUsername,
} from "@/lib/profileUsername";
import { saveProfileSection } from "../actions";
import SectionShell from "../SectionShell";
import { useSectionSave, useUnsavedChangesWarning } from "../useSectionSave";
import { CharacterCount, Field, FIELD_INPUT } from "./fields";

function draftFrom(model: ProfileSettingsModel): ProfileDetailsDraft {
  return {
    fullName: model.fullName,
    username: model.username,
    headline: model.headline,
    bio: model.bio,
    country: model.country,
    university: model.university,
    fieldOfStudy: model.fieldOfStudy,
    graduationYear: model.graduationYear,
  };
}

/**
 * Photo, name, username, headline and bio, then location and education.
 *
 * The headline is free text in the member's own words, which is what replaced
 * the persona picker. Location and education are ordinary optional facts:
 * nothing requires them and nothing is derived from them.
 */
export default function ProfileSection({ model }: { model: ProfileSettingsModel }) {
  const [draft, setDraft] = useState<ProfileDetailsDraft>(() => draftFrom(model));
  const [saved, setSaved] = useState<ProfileDetailsDraft>(() => draftFrom(model));
  const [avatarUrl, setAvatarUrl] = useState(model.avatarUrl);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useUnsavedChangesWarning(isDirty);

  const { status, error, save } = useSectionSave({
    section: "profile",
    profileId: model.id,
    isDirty,
  });

  const normalizedUsername = normalizeProfileUsername(draft.username);
  const usernameError = getProfileUsernameError(normalizedUsername);
  const yearError = getGraduationYearError(draft.graduationYear);
  const problem = getProfileDetailsError(draft);

  const update = (patch: Partial<ProfileDetailsDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  // A stored country from an older signup may not be in the list. It stays
  // an option, so opening this page and saving never clears it.
  const knownCountries: readonly string[] = AFRICAN_COUNTRIES;
  const countries =
    draft.country && !knownCountries.includes(draft.country)
      ? [draft.country, ...knownCountries]
      : knownCountries;

  return (
    <SectionShell
      section="profile"
      status={status}
      error={error}
      canSave={!problem}
      footnote="Your photo saves as soon as it finishes uploading. Everything else saves when you choose Save."
      onSave={() =>
        void save(async () => {
          const result = await saveProfileSection(draft);
          if (result.ok) {
            const next = { ...draft, username: result.username ?? normalizedUsername };
            setSaved(next);
            setDraft(next);
            if (result.username && result.username !== model.username) {
              // A new username changes every URL that points at this profile,
              // so the page reloads rather than keeping stale links.
              window.location.href = "/settings/profile";
            }
          }
          return result;
        })
      }
    >
      <div>
        <p className="mb-1 block text-sm font-medium text-ink-soft">Photo</p>
        <AvatarUploader
          userId={model.id}
          currentUrl={avatarUrl}
          fullName={draft.fullName || null}
          onUpload={(url) => {
            setAvatarUrl(url);
            void saveProfileMedia({ avatarUrl: url });
          }}
        />
      </div>

      <Field label="Name" error={draft.fullName.trim() ? null : "Add your name."}>
        {(props) => (
          <input
            {...props}
            type="text"
            value={draft.fullName}
            maxLength={PROFILE_NAME_MAX_LENGTH}
            autoComplete="name"
            onChange={(event) => update({ fullName: event.target.value })}
            className={FIELD_INPUT}
          />
        )}
      </Field>

      <Field
        label="Username"
        error={usernameError}
        help={`Your profile lives at /${normalizedUsername || model.username}.`}
      >
        {(props) => (
          <input
            {...props}
            type="text"
            value={draft.username}
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) =>
              update({ username: normalizeProfileUsername(event.target.value) })
            }
            className={FIELD_INPUT}
          />
        )}
      </Field>

      <Field
        label="Headline"
        optional
        help="One line under your name, in your own words."
      >
        {(props) => (
          <div className="relative">
            <input
              {...props}
              type="text"
              value={draft.headline}
              maxLength={PROFILE_HEADLINE_MAX_LENGTH}
              placeholder="e.g. Writing about public health in West Africa"
              onChange={(event) => update({ headline: event.target.value })}
              className={`${FIELD_INPUT} pr-16`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <CharacterCount value={draft.headline} max={PROFILE_HEADLINE_MAX_LENGTH} />
            </span>
          </div>
        )}
      </Field>

      <Field label="Bio" optional>
        {(props) => (
          <div className="relative">
            <textarea
              {...props}
              rows={4}
              value={draft.bio}
              placeholder="A little about you and what you write about"
              onChange={(event) => update({ bio: event.target.value })}
              className={`${FIELD_INPUT} resize-none pb-7`}
            />
            <span className="absolute bottom-2 right-3">
              <CharacterCount value={draft.bio} max={PROFILE_BIO_MAX_LENGTH} />
            </span>
          </div>
        )}
      </Field>

      <Field label="Location" optional>
        {(props) => (
          <select
            {...props}
            value={draft.country}
            onChange={(event) => update({ country: event.target.value })}
            className={FIELD_INPUT}
          >
            <option value="">No location</option>
            {countries.map((item) => (
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
          <span className="text-xs font-normal text-ink-muted">(optional)</span>
        </p>
        <UniversitySelect
          value={draft.university}
          onChange={(university) => update({ university })}
          country={draft.country}
        />
      </div>

      <Field label="Field of study" optional>
        {(props) => (
          <input
            {...props}
            type="text"
            value={draft.fieldOfStudy}
            placeholder="e.g. Economics"
            onChange={(event) => update({ fieldOfStudy: event.target.value })}
            className={FIELD_INPUT}
          />
        )}
      </Field>

      <Field label="Graduation year" optional error={yearError}>
        {(props) => (
          <input
            {...props}
            type="number"
            inputMode="numeric"
            min={GRADUATION_YEAR_MIN}
            max={GRADUATION_YEAR_MAX}
            value={draft.graduationYear}
            onChange={(event) => update({ graduationYear: event.target.value })}
            className={FIELD_INPUT}
          />
        )}
      </Field>
    </SectionShell>
  );
}
