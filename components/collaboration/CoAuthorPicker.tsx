"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { trackActivationEvent } from "@/lib/activationEvents";

export interface CoAuthorProfile {
  id: string;
  username: string;
  full_name: string | null;
  university?: string | null;
  field_of_study?: string | null;
}

export default function CoAuthorPicker({
  userId,
  value,
  onChange,
  source,
  max = 5,
}: {
  userId: string;
  value: CoAuthorProfile[];
  onChange: (next: CoAuthorProfile[]) => void;
  source: "write" | "publish_drawer";
  max?: number;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CoAuthorProfile[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || value.length >= max) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const supabase = createClient();
    const timer = setTimeout(() => {
      supabase
        .from("profiles")
        .select("id, username, full_name, university, field_of_study")
        .ilike("username", `%${trimmed}%`)
        .neq("id", userId)
        .limit(6)
        .then(({ data }) => {
          const selected = new Set(value.map((coAuthor) => coAuthor.id));
          const nextResults = ((data as CoAuthorProfile[] | null) ?? []).filter(
            (profile) => !selected.has(profile.id)
          );
          setResults(nextResults);
          setSearching(false);
          trackActivationEvent({
            event: "coauthor_search_performed",
            metadata: {
              source,
              queryLength: trimmed.length,
              resultCount: nextResults.length,
            },
          });
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [max, query, source, userId, value]);

  const addCoAuthor = (profile: CoAuthorProfile) => {
    if (value.some((item) => item.id === profile.id) || value.length >= max) return;
    onChange([...value, profile]);
    setQuery("");
    setResults([]);
  };

  const removeCoAuthor = (profileId: string) => {
    onChange(value.filter((item) => item.id !== profileId));
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3">
        <p className="text-sm font-semibold text-gray-900">Collaborators</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          Invite credible classmates or researchers before publishing. They can
          accept from notifications.
        </p>
      </div>

      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        disabled={value.length >= max}
        placeholder={
          value.length >= max
            ? "Maximum collaborators reached"
            : "Search by username"
        }
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand disabled:bg-gray-50 disabled:text-gray-400"
      />

      {searching ? (
        <p className="mt-2 text-xs text-gray-400">Searching...</p>
      ) : null}

      {results.length > 0 ? (
        <div className="mt-2 space-y-2 rounded-lg border border-gray-100 bg-canvas p-2">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => addCoAuthor(result)}
              className="flex w-full items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-left text-sm transition-colors hover:bg-emerald-50"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-gray-900">
                  @{result.username}
                </span>
                <span className="block truncate text-xs text-gray-500">
                  {[result.full_name, result.university].filter(Boolean).join(" / ")}
                </span>
              </span>
              <span className="text-xs font-semibold text-emerald-700">Add</span>
            </button>
          ))}
        </div>
      ) : null}

      {value.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {value.map((coAuthor) => (
            <span
              key={coAuthor.id}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
            >
              @{coAuthor.username}
              <button
                type="button"
                onClick={() => removeCoAuthor(coAuthor.id)}
                className="text-emerald-600 hover:text-emerald-900"
                aria-label={`Remove ${coAuthor.username}`}
              >
                remove
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-gray-400">
          No collaborators selected yet.
        </p>
      )}
    </div>
  );
}
