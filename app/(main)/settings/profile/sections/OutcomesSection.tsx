"use client";

import { useState } from "react";
import { trackActivationEvent } from "@/lib/activationEvents";
import { formatDate } from "@/lib/utils";
import {
  disputeMyOutcome,
  setMyOutcomeVisibility,
  submitMyOpportunityOutcome,
  type OwnerOutcome,
} from "../outcomeActions";
import SectionShell from "../SectionShell";
import { useSectionSave } from "../useSectionSave";
import { Field, FIELD_INPUT } from "./fields";

/**
 * Outcomes and recognition, from the owner's side.
 *
 * Every state is visible here and almost none of them are visible anywhere
 * else. The section's job is to make the three gates legible: an outcome is
 * private until someone else verifies it, and stays private until the owner
 * separately decides to publish it.
 */
const STATUS_COPY: Record<string, { label: string; detail: string }> = {
  contacted: { label: "Contacted", detail: "Private. Contact is not an outcome." },
  shortlisted: { label: "Shortlisted", detail: "Private, always." },
  selected: { label: "Selected", detail: "Can be public once verified." },
  completed: { label: "Completed", detail: "Can be public once verified." },
  declined: { label: "Declined", detail: "Private, always." },
  disputed: { label: "Disputed", detail: "Private while the dispute stands." },
  revoked: { label: "Revoked", detail: "Removed from your public profile." },
};

function verificationLine(outcome: OwnerOutcome) {
  if (outcome.revokedAt) return "Revoked. This cannot be shown publicly.";
  if (!outcome.verifiedAt) {
    return outcome.submittedRole === "owner"
      ? "Waiting for verification. You recorded this, so someone else has to confirm it before it can be public."
      : "Recorded by a provider. Confirm it below if it is accurate.";
  }
  const who =
    outcome.verificationSource === "admin"
      ? "an Indegenius administrator"
      : outcome.verificationSource === "inquiry_sender"
        ? "the organisation that contacted you"
        : "the provider";
  return `Verified by ${who}.`;
}

export default function OutcomesSection({
  profileId,
  outcomes,
  enabled,
}: {
  profileId: string;
  outcomes: OwnerOutcome[];
  enabled: boolean;
}) {
  const [draft, setDraft] = useState({
    status: "selected",
    opportunityTitle: "",
    organizationName: "",
    occurredOn: "",
    evidenceUrl: "",
    privateEvidenceNote: "",
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const isDirty = draft.opportunityTitle.trim().length > 0;
  const { status, error, save } = useSectionSave({
    section: "outcomes",
    profileId,
    isDirty,
  });

  const changeVisibility = async (
    outcome: OwnerOutcome,
    confirm: boolean,
    isPublic: boolean
  ) => {
    setBusyId(outcome.id);
    setRowError(null);
    const result = await setMyOutcomeVisibility({
      outcomeId: outcome.id,
      confirm,
      isPublic,
    });
    setBusyId(null);
    if (!result.ok) {
      setRowError(result.error ?? "Could not update this outcome.");
      return;
    }
    // After persistence, never on the click: an attempted change that the
    // database refused is not a visibility change.
    trackActivationEvent({
      event: "opportunity_outcome_visibility_changed",
      source: "command_center",
      metadata: { profileId, outcomeId: outcome.id, isPublic, confirmed: confirm },
    });
  };

  if (!enabled) {
    return (
      <SectionShell section="outcomes" status="idle" error={null}>
        <p className="text-sm leading-6 text-ink-muted">
          Verified opportunity outcomes are not available on this deployment yet.
        </p>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      section="outcomes"
      status={status}
      error={error ?? rowError}
      saveLabel="Record outcome"
      canSave={draft.opportunityTitle.trim().length >= 2}
      footnote="Recording an outcome does not publish it. Someone other than you has to verify it first, and then you choose whether it appears on your profile."
      onSave={() =>
        void save(async () => {
          const result = await submitMyOpportunityOutcome(draft);
          if (result.ok) {
            trackActivationEvent({
              event: "opportunity_outcome_submitted",
              source: "command_center",
              metadata: { profileId, status: draft.status, sourceType: "external" },
            });
            setDraft({
              status: "selected",
              opportunityTitle: "",
              organizationName: "",
              occurredOn: "",
              evidenceUrl: "",
              privateEvidenceNote: "",
            });
          }
          return result;
        })
      }
    >
      {outcomes.length > 0 ? (
        <ul className="space-y-3">
          {outcomes.map((outcome) => {
            const copy = STATUS_COPY[outcome.status] ?? {
              label: outcome.status,
              detail: "Private.",
            };
            const publishable =
              Boolean(outcome.verifiedAt) &&
              !outcome.revokedAt &&
              (outcome.status === "selected" || outcome.status === "completed");

            return (
              <li
                key={outcome.id}
                className="rounded-xl border border-card-border bg-canvas p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {outcome.opportunityTitle}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {outcome.organizationName ? `${outcome.organizationName} · ` : ""}
                      {copy.label}
                      {outcome.occurredOn ? ` · ${formatDate(outcome.occurredOn)}` : ""}
                    </p>
                  </div>
                  {/* State in words, not a colour: "Public" and "Private" are
                      the two things an owner needs to read at a glance. */}
                  <span className="shrink-0 rounded-full border border-card-border bg-card px-2.5 py-1 text-xs font-semibold text-ink-soft">
                    {outcome.isPublic ? "Public" : "Private"}
                  </span>
                </div>

                <p className="mt-2 text-xs leading-5 text-ink-muted">
                  {verificationLine(outcome)} {copy.detail}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {!outcome.ownerConfirmedAt && !outcome.revokedAt ? (
                    <button
                      type="button"
                      disabled={busyId === outcome.id}
                      onClick={() => void changeVisibility(outcome, true, false)}
                      className="focus-ring min-h-11 rounded-lg border border-card-border bg-card px-3 text-xs font-semibold text-ink-soft disabled:opacity-50"
                    >
                      Confirm this is accurate
                    </button>
                  ) : null}

                  {publishable && outcome.ownerConfirmedAt ? (
                    <button
                      type="button"
                      disabled={busyId === outcome.id}
                      onClick={() =>
                        void changeVisibility(outcome, true, !outcome.isPublic)
                      }
                      className="focus-ring min-h-11 rounded-lg border border-emerald-brand bg-green-tint px-3 text-xs font-semibold text-emerald-ink disabled:opacity-50"
                    >
                      {outcome.isPublic
                        ? "Remove from my public profile"
                        : "Show on my public profile"}
                    </button>
                  ) : null}

                  {!outcome.revokedAt && outcome.status !== "disputed" ? (
                    <button
                      type="button"
                      disabled={busyId === outcome.id}
                      onClick={() =>
                        void (async () => {
                          setBusyId(outcome.id);
                          const result = await disputeMyOutcome({
                            outcomeId: outcome.id,
                            reason: "",
                          });
                          setBusyId(null);
                          if (!result.ok) {
                            setRowError(result.error ?? "Could not dispute this.");
                          }
                        })()
                      }
                      className="focus-ring min-h-11 rounded-lg border border-card-border bg-card px-3 text-xs font-semibold text-ink-soft hover:text-red-600 disabled:opacity-50"
                    >
                      This is not accurate
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-card-border bg-canvas p-5 text-sm leading-6 text-ink-muted">
          Nothing recorded yet. Outcomes appear here when a provider records one
          for you, or when you record one below and ask for it to be verified.
        </p>
      )}

      <div className="border-t border-card-border pt-5">
        <h3 className="text-sm font-medium text-ink-soft">Record an outcome</h3>
        <p className="mt-1 text-xs leading-5 text-ink-muted">
          For opportunities that happened off the platform. An administrator has
          to verify it before it can appear publicly.
        </p>

        <div className="mt-4 space-y-4">
          <Field label="Stage">
            {(props) => (
              <select
                {...props}
                value={draft.status}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, status: event.target.value }))
                }
                className={FIELD_INPUT}
              >
                <option value="selected">Selected</option>
                <option value="completed">Completed</option>
              </select>
            )}
          </Field>

          <Field label="Opportunity">
            {(props) => (
              <input
                {...props}
                type="text"
                value={draft.opportunityTitle}
                placeholder="e.g. Mandela Rhodes Scholarship"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    opportunityTitle: event.target.value,
                  }))
                }
                className={FIELD_INPUT}
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Organisation" optional>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  value={draft.organizationName}
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
            <Field label="Date" optional>
              {(props) => (
                <input
                  {...props}
                  type="date"
                  value={draft.occurredOn}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      occurredOn: event.target.value,
                    }))
                  }
                  className={FIELD_INPUT}
                />
              )}
            </Field>
          </div>

          <Field
            label="Evidence link"
            optional
            help="A public announcement or listing. This may be shown beside the outcome."
          >
            {(props) => (
              <input
                {...props}
                type="url"
                value={draft.evidenceUrl}
                placeholder="https://…"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, evidenceUrl: event.target.value }))
                }
                className={FIELD_INPUT}
              />
            )}
          </Field>

          <Field
            label="Private note for the verifier"
            optional
            help="Only an administrator reviewing this sees it. It is never public and never enters analytics."
          >
            {(props) => (
              <textarea
                {...props}
                rows={2}
                value={draft.privateEvidenceNote}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    privateEvidenceNote: event.target.value,
                  }))
                }
                className={`${FIELD_INPUT} resize-none`}
              />
            )}
          </Field>
        </div>
      </div>
    </SectionShell>
  );
}
