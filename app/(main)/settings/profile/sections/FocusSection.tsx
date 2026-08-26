"use client";

import Link from "next/link";
import type { ProfileCommandCenterModel } from "@/lib/profileCommandCenter";
import {
  getPositioningStatementError,
  POSITIONING_STATEMENT_EXAMPLE,
  POSITIONING_STATEMENT_HELPER,
  POSITIONING_STATEMENT_LABEL,
  POSITIONING_STATEMENT_MAX_LENGTH,
  POSITIONING_STATEMENT_PROMPT,
} from "@/lib/profileIdentity";
import { saveFocusSection } from "../actions";
import SectionShell from "../SectionShell";
import { useSectionSave } from "../useSectionSave";
import type { CommandCenterDraft } from "../ProfileCommandCenter";
import { CharacterCount, Field, FIELD_INPUT } from "./fields";

const BIO_MAX_LENGTH = 300;

export default function FocusSection({
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
  const isDirty =
    draft.positioningStatement !== model.focus.positioningStatement ||
    draft.bio !== model.focus.bio;

  const { status, error, save } = useSectionSave({
    section: "focus",
    profileId: model.identity.id,
    isDirty,
  });

  const positioningError = getPositioningStatementError(draft.positioningStatement);
  const bioError =
    draft.bio.length > BIO_MAX_LENGTH
      ? `Keep your biography to ${BIO_MAX_LENGTH} characters or fewer.`
      : null;

  return (
    <SectionShell
      section="focus"
      status={status}
      error={error}
      canSave={!positioningError && !bioError}
      onSave={() =>
        void save(async () => {
          const result = await saveFocusSection({
            positioningStatement: draft.positioningStatement,
            bio: draft.bio,
          });
          if (result.ok) {
            onSaved({
              positioningStatement: draft.positioningStatement,
              bio: draft.bio,
            });
          }
          return result;
        })
      }
    >
      {/* Legacy anchor from the public profile's "Edit" links. */}
      <div id="profile-about" className="sr-only" aria-hidden="true" />

      {model.positioningEnabled ? (
        <Field
          label={POSITIONING_STATEMENT_LABEL}
          optional
          error={positioningError}
          help={
            <>
              {POSITIONING_STATEMENT_HELPER} It appears under your name. For example:{" "}
              {POSITIONING_STATEMENT_EXAMPLE}
            </>
          }
        >
          {(props) => (
            <div className="relative">
              <textarea
                {...props}
                rows={2}
                value={draft.positioningStatement}
                placeholder={POSITIONING_STATEMENT_PROMPT}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    positioningStatement: event.target.value,
                  }))
                }
                className={`${FIELD_INPUT} resize-none pb-7`}
              />
              <span className="absolute bottom-2 right-3">
                <CharacterCount
                  value={draft.positioningStatement}
                  max={POSITIONING_STATEMENT_MAX_LENGTH}
                />
              </span>
            </div>
          )}
        </Field>
      ) : (
        <p className="rounded-lg border border-dashed border-card-border bg-canvas p-4 text-sm leading-6 text-ink-muted">
          Intellectual focus is not available on this deployment yet.
        </p>
      )}

      <Field
        label="About"
        optional
        error={bioError}
        help="A longer note on your work and what you write about."
      >
        {(props) => (
          <div className="relative">
            <textarea
              {...props}
              rows={4}
              value={draft.bio}
              placeholder="Tell the community about your work and research interests"
              onChange={(event) =>
                setDraft((current) => ({ ...current, bio: event.target.value }))
              }
              className={`${FIELD_INPUT} resize-none pb-7`}
            />
            <span className="absolute bottom-2 right-3">
              <CharacterCount value={draft.bio} max={BIO_MAX_LENGTH} />
            </span>
          </div>
        )}
      </Field>

      <p className="text-xs leading-5 text-ink-muted">
        Your intellectual focus is one sentence on what you are trying to
        understand. About is the longer version. See how both read on{" "}
        <Link
          href={`/${model.identity.username}`}
          className="focus-ring font-semibold text-emerald-ink"
        >
          your public profile
        </Link>
        .
      </p>
    </SectionShell>
  );
}
