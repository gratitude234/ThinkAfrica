"use client";

import { useState } from "react";
import type { PostReferenceRecord } from "@/lib/types";
import ReferenceRow from "@/components/ui/ReferenceRow";
import ReferenceFields from "@/components/ui/ReferenceFields";

interface ReferencesPanelProps {
  references: PostReferenceRecord[];
  onChange: (references: PostReferenceRecord[]) => void;
  alwaysExpanded?: boolean;
  className?: string;
}

function emptyReference(nextIndex: number): PostReferenceRecord {
  return {
    id: `temp-${Date.now()}-${nextIndex}`,
    post_id: "",
    display_order: nextIndex,
    ref_type: "other",
    authors: "",
    title: "",
    year: null,
    source: "",
    url: "",
    doi: "",
    raw: "",
  };
}

export default function ReferencesPanel({
  references,
  onChange,
  alwaysExpanded = false,
  className = "",
}: ReferencesPanelProps) {
  const [open, setOpen] = useState(false);
  const [addingReference, setAddingReference] = useState(false);
  const [draftReference, setDraftReference] = useState<PostReferenceRecord | null>(null);

  const expanded = alwaysExpanded || open;

  const startAddReference = () => {
    setDraftReference(emptyReference(references.length));
    setAddingReference(true);
    setOpen(true);
  };

  const cancelAddReference = () => {
    setAddingReference(false);
    setDraftReference(null);
  };

  const saveReference = () => {
    if (!draftReference) return;
    if (!draftReference.title.trim()) {
      setAddingReference(false);
      setDraftReference(null);
      return;
    }
    onChange([...references, draftReference]);
    setAddingReference(false);
    setDraftReference(null);
  };

  return (
    <div
      className={`overflow-hidden rounded-xl border border-gray-200 bg-white ${className}`}
    >
      <div
        onClick={() => setOpen((prev) => !prev)}
        role={alwaysExpanded ? undefined : "button"}
        tabIndex={alwaysExpanded ? undefined : 0}
        aria-expanded={alwaysExpanded ? undefined : expanded}
        aria-label={alwaysExpanded ? undefined : `${expanded ? "Collapse" : "Expand"} references`}
        onKeyDown={
          alwaysExpanded
            ? undefined
            : (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setOpen((prev) => !prev);
                }
              }
        }
        className={`flex min-h-[52px] items-center justify-between gap-3 px-4 py-3.5 transition-colors ${
          alwaysExpanded
            ? ""
            : `cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-brand/40 ${expanded ? "bg-gray-50/70" : "hover:bg-gray-50/60"}`
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">References</span>
          {references.length > 0 ? (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
              {references.length}
            </span>
          ) : null}
        </div>
        {!alwaysExpanded ? (
          <svg
            aria-hidden="true"
            className={`h-[18px] w-[18px] shrink-0 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9.5l6 6 6-6" />
          </svg>
        ) : null}
      </div>

      {expanded ? (
        <div className="space-y-3 px-4 pb-4">
          <p className="-mt-1 text-xs text-gray-500">
            Use structured source data here and cite it inline with `[ref:1]`, `[ref:2]`, and so on in the body.
          </p>

          {references.length === 0 && !addingReference ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-5 text-sm text-gray-500">
              No references yet.
            </div>
          ) : (
            references.map((reference, index) => (
              <ReferenceRow
                key={reference.id || `reference-${index}`}
                index={index}
                reference={reference}
                canMoveUp={index > 0}
                canMoveDown={index < references.length - 1}
                onMove={(direction) => {
                  const next = [...references];
                  const targetIndex = direction === "up" ? index - 1 : index + 1;
                  const [item] = next.splice(index, 1);
                  next.splice(targetIndex, 0, item);
                  onChange(next.map((row, rowIndex) => ({ ...row, display_order: rowIndex })));
                }}
                onChange={(nextReference) => {
                  const next = references.map((row, rowIndex) =>
                    rowIndex === index ? { ...nextReference, display_order: index } : row
                  );
                  onChange(next);
                }}
                onRemove={() => {
                  onChange(
                    references
                      .filter((_, rowIndex) => rowIndex !== index)
                      .map((row, rowIndex) => ({ ...row, display_order: rowIndex }))
                  );
                }}
              />
            ))
          )}

          {addingReference && draftReference ? (
            <div className="rounded-xl border border-emerald-200 bg-white p-4">
              <p className="mb-3 text-sm font-medium text-gray-900">New reference</p>
              <ReferenceFields
                reference={draftReference}
                onChange={(next) => setDraftReference(next)}
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelAddReference}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveReference}
                  className="rounded-lg bg-emerald-brand px-3.5 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={startAddReference}
              className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
              </svg>
              Add reference
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
