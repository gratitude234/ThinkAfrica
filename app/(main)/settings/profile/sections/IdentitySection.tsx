"use client";

import { useState } from "react";
import AvatarUploader from "@/app/(main)/settings/AvatarUploader";
import CoverImageUploader from "@/components/ui/CoverImageUploader";
import { createClient } from "@/lib/supabase/client";
import type { ProfileCommandCenterModel } from "@/lib/profileCommandCenter";
import {
  PROFILE_TYPE_OPTIONS,
  normalizeSecondaryProfileTypes,
  type ProfileType,
} from "@/lib/profileTypes";
import {
  getProfileUsernameError,
  normalizeProfileUsername,
} from "@/lib/profileUsername";
import { saveIdentitySection } from "../actions";
import SectionShell from "../SectionShell";
import { useSectionSave } from "../useSectionSave";
import type { CommandCenterDraft } from "../ProfileCommandCenter";
import { ChipToggle, Field, FIELD_INPUT } from "./fields";

export default function IdentitySection({
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
  const [profileType, setProfileType] = useState<ProfileType | null>(
    model.identity.profileType as ProfileType | null
  );
  const [secondaryTypes, setSecondaryTypes] = useState<ProfileType[]>(
    model.identity.secondaryProfileTypes as ProfileType[]
  );
  const [avatarUrl, setAvatarUrl] = useState(model.identity.avatarUrl);
  const [coverUrl, setCoverUrl] = useState(model.identity.coverImageUrl);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const isDirty =
    draft.fullName !== model.identity.fullName ||
    draft.username !== model.identity.username ||
    profileType !== model.identity.profileType ||
    secondaryTypes.join(",") !== model.identity.secondaryProfileTypes.join(",");

  const { status, error, save } = useSectionSave({
    section: "identity",
    profileId: model.identity.id,
    isDirty,
  });

  const localUsernameError = getProfileUsernameError(draft.username);

  // Media saves the moment it uploads, unlike every other field on this page.
  // That difference is stated in the section footnote rather than left for an
  // author to discover by navigating away and finding one thing kept.
  const saveMedia = async (column: "avatar_url" | "cover_image_url", value: string | null) => {
    const supabase = createClient();
    await supabase.from("profiles").update({ [column]: value }).eq("id", model.identity.id);
  };

  return (
    <SectionShell
      section="identity"
      status={status}
      error={error ?? usernameError}
      canSave={!localUsernameError}
      footnote="Your cover and profile photos save as soon as they finish uploading. Everything else on this page saves when you choose Save."
      onSave={() =>
        void save(async () => {
          setUsernameError(null);
          const result = await saveIdentitySection({
            fullName: draft.fullName,
            username: draft.username,
            profileType,
            secondaryProfileTypes: secondaryTypes,
          });
          if (result.ok) {
            onSaved({ fullName: draft.fullName, username: draft.username });
            if (result.username && result.username !== model.identity.username) {
              // A changed username changes every URL that points at this
              // profile, so the app reloads rather than leaving stale links
              // in the nav and the preview.
              window.location.href = "/settings/profile";
            }
          }
          return result;
        })
      }
    >
      {/* Anchors the public profile has linked to since before this page
          existed. Bookmarked links land on the right section. */}
      <div id="profile-identity" className="sr-only" aria-hidden="true" />

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="mb-1 block text-sm font-medium text-ink-soft">Cover photo</p>
          <CoverImageUploader
            initialUrl={coverUrl ?? undefined}
            onUpload={(url) => {
              setCoverUrl(url);
              void saveMedia("cover_image_url", url);
            }}
            onRemove={() => {
              setCoverUrl(null);
              void saveMedia("cover_image_url", null);
            }}
            bucket="avatars"
            buildPath={(userId) => `${userId}/cover.webp`}
            emptyTitle="Upload a cover image"
            emptyHint="This appears at the top of your profile."
            previewHeightClass="h-32"
          />
        </div>
        <div>
          <p className="mb-1 block text-sm font-medium text-ink-soft">Profile photo</p>
          <AvatarUploader
            userId={model.identity.id}
            currentUrl={avatarUrl}
            fullName={draft.fullName}
            onUpload={(url) => {
              setAvatarUrl(url);
              void saveMedia("avatar_url", url);
            }}
          />
        </div>
      </div>

      <Field label="Full name">
        {(props) => (
          <input
            {...props}
            type="text"
            value={draft.fullName}
            onChange={(event) =>
              setDraft((current) => ({ ...current, fullName: event.target.value }))
            }
            className={FIELD_INPUT}
          />
        )}
      </Field>

      <Field
        label="Username"
        error={localUsernameError}
        help={`Your profile lives at /${draft.username || model.identity.username}.`}
      >
        {(props) => (
          <input
            {...props}
            type="text"
            value={draft.username}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                username: normalizeProfileUsername(event.target.value),
              }))
            }
            className={FIELD_INPUT}
          />
        )}
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-soft">Profile type</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PROFILE_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={profileType === option.value}
              onClick={() => {
                setProfileType(option.value);
                setSecondaryTypes((current) =>
                  normalizeSecondaryProfileTypes(current, option.value)
                );
              }}
              className={`focus-ring rounded-xl border px-3 py-3 text-left transition-colors ${
                profileType === option.value
                  ? "border-emerald-brand bg-green-tint text-ink"
                  : "border-card-border bg-card text-ink-soft hover:border-emerald-brand/40"
              }`}
            >
              <span className="text-sm font-semibold">{option.label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                {option.description}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {profileType ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-soft">
            Secondary profile types{" "}
            <span className="text-xs font-normal text-ink-muted">
              ({secondaryTypes.length}/3)
            </span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {PROFILE_TYPE_OPTIONS.filter((option) => option.value !== profileType).map(
              (option) => (
                <ChipToggle
                  key={option.value}
                  label={option.label}
                  selected={secondaryTypes.includes(option.value)}
                  disabled={
                    !secondaryTypes.includes(option.value) && secondaryTypes.length >= 3
                  }
                  onToggle={() =>
                    setSecondaryTypes((current) =>
                      current.includes(option.value)
                        ? current.filter((item) => item !== option.value)
                        : current.length >= 3
                          ? current
                          : [...current, option.value]
                    )
                  }
                />
              )
            )}
          </div>
        </fieldset>
      ) : null}
    </SectionShell>
  );
}
