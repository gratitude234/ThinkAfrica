"use client";

import { useState } from "react";
import type { ProfileSettingsModel } from "@/lib/profileSettings";
import { formatDate } from "@/lib/utils";
import { saveSelectedWorkSection } from "../actions";
import SectionShell from "../SectionShell";
import { useSectionSave, useUnsavedChangesWarning } from "../useSectionSave";

export default function SelectedWorkSection({ model }: { model: ProfileSettingsModel }) {
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(model.selectedWorkId);
  const [saved, setSaved] = useState<string | null>(model.selectedWorkId);
  const isDirty = selectedWorkId !== saved;
  useUnsavedChangesWarning(isDirty);

  const { status, error, save } = useSectionSave({
    section: "selected-work",
    profileId: model.id,
    isDirty,
  });

  return (
    <SectionShell
      section="selected-work"
      status={status}
      error={error}
      onSave={() =>
        void save(async () => {
          const result = await saveSelectedWorkSection({ postId: selectedWorkId });
          if (result.ok) setSaved(selectedWorkId);
          return result;
        })
      }
      canSave={isDirty}
      footnote="Only one work is selected. You can change or clear it at any time."
    >
      {model.selectedWorkOptions.length ? (
        <fieldset>
          <legend className="sr-only">Select work for your profile</legend>
          <div className="divide-y divide-card-border border-y border-card-border">
            <label className="flex cursor-pointer items-start gap-3 py-4">
              <input
                type="radio"
                name="selected-work"
                checked={selectedWorkId === null}
                onChange={() => setSelectedWorkId(null)}
                className="mt-1 h-4 w-4 accent-emerald-brand"
              />
              <span>
                <span className="block text-sm font-semibold text-ink">No selected work</span>
                <span className="mt-1 block text-xs leading-5 text-ink-muted">
                  Your profile will begin with your Intellectual Record and Recent Work.
                </span>
              </span>
            </label>
            {model.selectedWorkOptions.map((work) => (
              <label key={work.id} className="flex cursor-pointer items-start gap-3 py-4">
                <input
                  type="radio"
                  name="selected-work"
                  value={work.id}
                  checked={selectedWorkId === work.id}
                  onChange={() => setSelectedWorkId(work.id)}
                  className="mt-1 h-4 w-4 accent-emerald-brand"
                />
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    {work.kind === "article" ? "Article" : "Post"}
                  </span>
                  <span className="mt-1 block text-sm font-semibold leading-6 text-ink">
                    {work.title}
                  </span>
                  {work.publishedAt ? (
                    <span className="mt-1 block text-xs text-ink-muted">
                      {formatDate(work.publishedAt)}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <div className="text-sm leading-6 text-ink-muted">
          Publish a Post or Article first. Once you do, it can be selected here to represent your work.
        </div>
      )}
    </SectionShell>
  );
}
