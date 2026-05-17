"use client";

import type { PostReferenceRecord, ReferenceType } from "@/lib/types";

interface ReferenceRowProps {
  index: number;
  reference: PostReferenceRecord;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: "up" | "down") => void;
  onChange: (reference: PostReferenceRecord) => void;
  onRemove: () => void;
}

const inputClasses =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand";

export default function ReferenceRow({
  index,
  reference,
  canMoveUp,
  canMoveDown,
  onMove,
  onChange,
  onRemove,
}: ReferenceRowProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">Reference {index + 1}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onMove("up")}
            disabled={!canMoveUp}
            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 disabled:opacity-40"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove("down")}
            disabled={!canMoveDown}
            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 disabled:opacity-40"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded border border-red-200 px-2 py-1 text-xs text-red-600"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-medium text-gray-600">
          Type
          <select
            value={reference.ref_type ?? "other"}
            onChange={(event) =>
              onChange({
                ...reference,
                ref_type: event.target.value as ReferenceType,
              })
            }
            className={`${inputClasses} mt-1`}
          >
            {["journal", "book", "website", "report", "other"].map((option) => (
              <option key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-gray-600">
          Authors
          <input
            type="text"
            value={reference.authors ?? ""}
            onChange={(event) =>
              onChange({ ...reference, authors: event.target.value })
            }
            className={`${inputClasses} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-gray-600 md:col-span-2">
          Title
          <input
            type="text"
            value={reference.title}
            onChange={(event) =>
              onChange({ ...reference, title: event.target.value })
            }
            className={`${inputClasses} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-gray-600">
          Year
          <input
            type="number"
            value={reference.year ?? ""}
            onChange={(event) =>
              onChange({
                ...reference,
                year: event.target.value ? Number(event.target.value) : null,
              })
            }
            className={`${inputClasses} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-gray-600">
          Source
          <input
            type="text"
            value={reference.source ?? ""}
            onChange={(event) =>
              onChange({ ...reference, source: event.target.value })
            }
            className={`${inputClasses} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-gray-600">
          URL
          <input
            type="url"
            value={reference.url ?? ""}
            onChange={(event) =>
              onChange({ ...reference, url: event.target.value })
            }
            className={`${inputClasses} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-gray-600">
          DOI
          <input
            type="text"
            value={reference.doi ?? ""}
            onChange={(event) =>
              onChange({ ...reference, doi: event.target.value })
            }
            className={`${inputClasses} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-gray-600 md:col-span-2">
          Note
          <textarea
            value={reference.raw ?? ""}
            onChange={(event) =>
              onChange({ ...reference, raw: event.target.value })
            }
            rows={2}
            className={`${inputClasses} mt-1 resize-none`}
            placeholder="Optional note for edition, page range, archive details, or context."
          />
        </label>
      </div>
    </div>
  );
}
