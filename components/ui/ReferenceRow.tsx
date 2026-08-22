"use client";

import type { PostReferenceRecord } from "@/lib/types";
import ReferenceFields from "./ReferenceFields";

interface ReferenceRowProps {
  index: number;
  reference: PostReferenceRecord;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: "up" | "down") => void;
  onChange: (reference: PostReferenceRecord) => void;
  onRemove: () => void;
  onCite?: () => void;
  disabled?: boolean;
}

export default function ReferenceRow({
  index,
  reference,
  canMoveUp,
  canMoveDown,
  onMove,
  onChange,
  onRemove,
  onCite,
  disabled = false,
}: ReferenceRowProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">Reference {index + 1}</p>
        <div className="flex items-center gap-2">
          {onCite ? (
            <button
              type="button"
              onClick={onCite}
              disabled={disabled}
              className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-40"
              aria-label={`Cite reference ${index + 1} at the cursor`}
            >
              Cite
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onMove("up")}
            disabled={disabled || !canMoveUp}
            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 disabled:opacity-40"
            aria-label={`Move reference ${index + 1} up`}
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove("down")}
            disabled={disabled || !canMoveDown}
            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 disabled:opacity-40"
            aria-label={`Move reference ${index + 1} down`}
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 disabled:opacity-40"
            aria-label={`Remove reference ${index + 1}`}
          >
            Remove
          </button>
        </div>
      </div>

      <ReferenceFields reference={reference} onChange={onChange} disabled={disabled} />
    </div>
  );
}
