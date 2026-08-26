"use client";

import { useState } from "react";
import {
  FEATURE_NOTE_EXAMPLE,
  FEATURE_NOTE_MAX_LENGTH,
  FEATURE_NOTE_PROMPT,
  FEATURED_WORK_LIMIT,
  getFeatureNoteError,
  normalizeFeatureNote,
} from "@/lib/featuredWork";
import type { ProfileCommandCenterModel } from "@/lib/profileCommandCenter";
import { trackFeatureNoteSaved } from "@/lib/profileOwnerAnalytics";
import { formatDate } from "@/lib/utils";
import { saveFeaturedWorkSection } from "../actions";
import SectionShell from "../SectionShell";
import { useSectionSave } from "../useSectionSave";
import type { CommandCenterDraft, EligibleWork } from "../ProfileCommandCenter";
import { CharacterCount, FIELD_INPUT } from "./fields";

export default function FeaturedWorkSection({
  model,
  draft,
  setDraft,
  eligibleWork,
  onSaved,
}: {
  model: ProfileCommandCenterModel;
  draft: CommandCenterDraft;
  setDraft: (update: (current: CommandCenterDraft) => CommandCenterDraft) => void;
  eligibleWork: EligibleWork[];
  onSaved: (patch: Partial<CommandCenterDraft>) => void;
}) {
  /**
   * Notes for selections the author removed during this editing session.
   *
   * Removing a piece and adding it back is a normal thing to do while
   * deciding on an order. Dropping the sentence they wrote about it would
   * punish that, so the draft note is parked here and restored on re-add. It
   * is deliberately session-only: a note for a piece that is not selected at
   * save time is never persisted.
   */
  const [parkedNotes, setParkedNotes] = useState<Record<string, string>>({});

  const savedKey = model.featured
    .map((item) => `${item.postId}:${item.note ?? ""}`)
    .join("|");
  const draftKey = draft.featured
    .map((item) => `${item.postId}:${normalizeFeatureNote(item.note) ?? ""}`)
    .join("|");
  const isDirty = savedKey !== draftKey;

  const { status, error, save } = useSectionSave({
    section: "featured",
    profileId: model.identity.id,
    isDirty,
  });

  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const selectedIds = draft.featured.map((item) => item.postId);
  const noteError = draft.featured
    .map((item) => getFeatureNoteError(item.note))
    .find(Boolean);

  const toggle = (postId: string) => {
    setLimitNotice(null);
    setDraft((current) => {
      const existing = current.featured.find((item) => item.postId === postId);
      if (existing) {
        setParkedNotes((parked) => ({ ...parked, [postId]: existing.note }));
        return {
          ...current,
          featured: current.featured.filter((item) => item.postId !== postId),
        };
      }
      if (current.featured.length >= FEATURED_WORK_LIMIT) {
        setLimitNotice(`You can feature up to ${FEATURED_WORK_LIMIT} publications.`);
        return current;
      }
      return {
        ...current,
        featured: [
          ...current.featured,
          { postId, note: parkedNotes[postId] ?? "" },
        ],
      };
    });
  };

  const move = (postId: string, direction: -1 | 1) =>
    setDraft((current) => {
      const index = current.featured.findIndex((item) => item.postId === postId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.featured.length) {
        return current;
      }
      // Notes travel with their selection, because the note belongs to the
      // piece and not to the slot it currently sits in.
      const featured = [...current.featured];
      [featured[index], featured[nextIndex]] = [featured[nextIndex], featured[index]];
      return { ...current, featured };
    });

  const setNote = (postId: string, note: string) =>
    setDraft((current) => ({
      ...current,
      featured: current.featured.map((item) =>
        item.postId === postId ? { ...item, note } : item
      ),
    }));

  return (
    <SectionShell
      section="featured"
      status={status}
      error={error ?? limitNotice}
      canSave={!noteError}
      footnote="Selection, order and explanations save together."
      onSave={() =>
        void save(async () => {
          const selections = draft.featured.map((item) => ({
            postId: item.postId,
            note: item.note,
          }));
          const result = await saveFeaturedWorkSection({ selections });
          if (result.ok) {
            onSaved({ featured: draft.featured });
            trackFeatureNoteSaved({
              profileId: model.identity.id,
              selectionCount: selections.length,
              noteCount: selections.filter((item) => normalizeFeatureNote(item.note))
                .length,
            });
          }
          return result;
        })
      }
    >
      {eligibleWork.length === 0 ? (
        <p className="rounded-lg border border-dashed border-card-border bg-canvas p-5 text-sm leading-6 text-ink-muted">
          Publish something before choosing featured work. Only published pieces
          you authored, or where a co-author credit was accepted, can be
          featured.
        </p>
      ) : (
        <>
          {draft.featured.length > 0 ? (
            <ol className="space-y-3">
              {draft.featured.map((selection, index) => {
                const work = eligibleWork.find((item) => item.id === selection.postId);
                const fieldId = `feature-note-${selection.postId}`;
                const itemError = getFeatureNoteError(selection.note);
                return (
                  <li
                    key={selection.postId}
                    className="rounded-xl border border-card-border bg-canvas p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 text-sm font-semibold text-ink">
                        {index + 1}. {work?.title ?? "Selected work"}
                        {work?.isCoAuthor ? (
                          <span className="ml-2 text-xs font-normal text-ink-muted">
                            Co-author
                          </span>
                        ) : null}
                      </p>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => move(selection.postId, -1)}
                          disabled={index === 0}
                          aria-label={`Move ${work?.title ?? "selection"} up`}
                          className="focus-ring min-h-11 rounded-lg border border-card-border px-3 text-xs font-medium text-ink-soft disabled:opacity-40"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => move(selection.postId, 1)}
                          disabled={index === draft.featured.length - 1}
                          aria-label={`Move ${work?.title ?? "selection"} down`}
                          className="focus-ring min-h-11 rounded-lg border border-card-border px-3 text-xs font-medium text-ink-soft disabled:opacity-40"
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          onClick={() => toggle(selection.postId)}
                          aria-label={`Remove ${work?.title ?? "selection"}`}
                          className="focus-ring min-h-11 rounded-lg border border-card-border px-3 text-xs font-medium text-ink-soft hover:text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <label
                      htmlFor={fieldId}
                      className="mt-3 block text-xs font-medium text-ink-soft"
                    >
                      Why I featured this{" "}
                      <span className="font-normal text-ink-muted">(optional)</span>
                    </label>
                    <div className="relative mt-1">
                      <textarea
                        id={fieldId}
                        rows={2}
                        value={selection.note}
                        placeholder={FEATURE_NOTE_PROMPT}
                        aria-describedby={`${fieldId}-help`}
                        aria-invalid={itemError ? true : undefined}
                        onChange={(event) => setNote(selection.postId, event.target.value)}
                        className={`${FIELD_INPUT} resize-none pb-7`}
                      />
                      <span className="absolute bottom-2 right-3">
                        <CharacterCount
                          value={selection.note}
                          max={FEATURE_NOTE_MAX_LENGTH}
                        />
                      </span>
                    </div>
                    <p id={`${fieldId}-help`} className="mt-1 text-xs leading-5 text-ink-muted">
                      {itemError ? (
                        <span role="alert" className="font-medium text-red-600">
                          {itemError}
                        </span>
                      ) : (
                        <>For example: {FEATURE_NOTE_EXAMPLE}</>
                      )}
                    </p>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="rounded-lg border border-dashed border-card-border bg-canvas p-5 text-sm leading-6 text-ink-muted">
              Choose up to {FEATURED_WORK_LIMIT} pieces a visitor should read first.
            </p>
          )}

          <div>
            <h3 className="text-sm font-medium text-ink-soft">Your published work</h3>
            <ul className="mt-2 space-y-2">
              {eligibleWork.map((work) => {
                const selected = selectedIds.includes(work.id);
                const disabled =
                  !selected && draft.featured.length >= FEATURED_WORK_LIMIT;
                return (
                  <li key={work.id}>
                    <button
                      type="button"
                      onClick={() => toggle(work.id)}
                      disabled={disabled}
                      aria-pressed={selected}
                      className={`focus-ring flex w-full items-start justify-between gap-4 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        selected
                          ? "border-emerald-brand bg-green-tint"
                          : "border-card-border bg-card hover:border-card-border-hover"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="line-clamp-2 block text-sm font-semibold text-ink">
                          {work.title}
                        </span>
                        <span className="mt-1 block text-xs text-ink-muted">
                          {formatDate(work.publishedAt)}
                          {work.isCoAuthor ? " · Co-author" : ""}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          selected
                            ? "bg-emerald-brand text-white"
                            : "bg-canvas text-ink-muted"
                        }`}
                      >
                        {selected ? "Selected" : "Add"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </SectionShell>
  );
}
