"use client";

import Link from "next/link";
import { useState } from "react";

interface Item {
  label: string;
  done: boolean;
  href: string;
}

interface Props {
  pct: number;
  items: Item[];
}

export default function ProfileCompletionCard({ pct, items }: Props) {
  const [expanded, setExpanded] = useState(false);
  const incomplete = items.filter((item) => !item.done);

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Complete your profile</p>
          <p className="mt-0.5 text-xs text-gray-400">
            {pct}% complete - {incomplete.length} items left
          </p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-medium text-emerald-600 hover:underline"
        >
          {expanded ? "Hide" : "Show tasks"}
        </button>
      </div>

      <div className="mb-4 h-2 w-full rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {expanded ? (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.label} className="flex items-center gap-3">
              <span
                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                  item.done ? "bg-emerald-100" : "border-2 border-gray-200"
                }`}
              >
                {item.done ? (
                  <svg className="h-3 w-3 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : null}
              </span>
              {item.done ? (
                <span className="text-sm text-gray-400 line-through">{item.label}</span>
              ) : (
                <Link
                  href={item.href}
                  className="text-sm text-gray-700 transition-colors hover:text-emerald-600"
                >
                  {item.label} {"->"}
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
