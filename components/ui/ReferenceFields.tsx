"use client";

import type { PostReferenceRecord, ReferenceType } from "@/lib/types";

interface ReferenceFieldsProps {
  reference: PostReferenceRecord;
  onChange: (reference: PostReferenceRecord) => void;
}

const inputClasses =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand";

export default function ReferenceFields({ reference, onChange }: ReferenceFieldsProps) {
  return (
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
          onChange={(event) => onChange({ ...reference, authors: event.target.value })}
          className={`${inputClasses} mt-1`}
        />
      </label>
      <label className="text-xs font-medium text-gray-600 md:col-span-2">
        Title
        <input
          type="text"
          value={reference.title}
          onChange={(event) => onChange({ ...reference, title: event.target.value })}
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
          onChange={(event) => onChange({ ...reference, source: event.target.value })}
          className={`${inputClasses} mt-1`}
        />
      </label>
      <label className="text-xs font-medium text-gray-600">
        URL
        <input
          type="url"
          value={reference.url ?? ""}
          onChange={(event) => onChange({ ...reference, url: event.target.value })}
          className={`${inputClasses} mt-1`}
        />
      </label>
      <label className="text-xs font-medium text-gray-600">
        DOI
        <input
          type="text"
          value={reference.doi ?? ""}
          onChange={(event) => onChange({ ...reference, doi: event.target.value })}
          className={`${inputClasses} mt-1`}
        />
      </label>
      <label className="text-xs font-medium text-gray-600 md:col-span-2">
        Note
        <textarea
          value={reference.raw ?? ""}
          onChange={(event) => onChange({ ...reference, raw: event.target.value })}
          rows={2}
          className={`${inputClasses} mt-1 resize-none`}
          placeholder="Optional note for edition, page range, archive details, or context."
        />
      </label>
    </div>
  );
}
