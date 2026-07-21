"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface TagInputProps {
  label?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  helperText?: string;
  maxTags?: number;
  showLabel?: boolean;
  disabled?: boolean;
}

interface TagRow {
  tags: string[] | null;
}

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase().replace(/\s+/g, " ");
}

export default function TagInput({
  label = "Tags",
  value,
  onChange,
  placeholder = "Type a topic and press Enter",
  helperText,
  maxTags = 5,
  showLabel = true,
  disabled = false,
}: TagInputProps) {
  const [query, setQuery] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [focused, setFocused] = useState(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const loadTags = async () => {
    if (loaded || loadingTags) return;

    setLoadingTags(true);

    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("posts")
        .select("tags")
        .eq("status", "published")
        .limit(500);

      const uniqueTags = Array.from(
        new Set(
          ((data ?? []) as TagRow[])
            .flatMap((post) => post.tags ?? [])
            .map((tag) => normalizeTag(tag))
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b));

      setAllTags(uniqueTags);
      setLoaded(true);
    } catch {
      setAllTags([]);
      setLoaded(true);
    } finally {
      setLoadingTags(false);
    }
  };

  const addTag = (tag: string) => {
    const normalized = normalizeTag(tag);

    if (!normalized || value.includes(normalized) || value.length >= maxTags) {
      return;
    }

    onChange([...value, normalized]);
    setQuery("");
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove));
  };

  const suggestions = useMemo(() => {
    const normalizedQuery = normalizeTag(query);

    if (!normalizedQuery) {
      return [];
    }

    return allTags
      .filter(
        (tag) =>
          tag.includes(normalizedQuery) &&
          !value.includes(tag) &&
          tag !== normalizedQuery
      )
      .slice(0, 6);
  }, [allTags, query, value]);

  const showDropdown =
    focused && query.trim().length > 0 && (loadingTags || suggestions.length > 0);

  return (
    <div>
      {showLabel ? (
        <>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {label}
          </label>
          {helperText ? (
            <p className="mb-2 text-xs text-gray-400">{helperText}</p>
          ) : null}
        </>
      ) : null}

      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
            >
              <span>#{tag}</span>
              <button
                type="button"
                onClick={() => removeTag(tag)}
                disabled={disabled}
                className="text-emerald-500 transition-colors hover:text-emerald-700 disabled:pointer-events-none disabled:opacity-40"
                aria-label={`Remove ${tag}`}
              >
                x
              </button>
            </span>
          ))}

          {value.length < maxTags && !disabled ? (
            <div className="relative min-w-[180px] flex-1">
              <input
                type="text"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  void loadTags();
                }}
                onFocus={() => {
                  setFocused(true);
                  void loadTags();
                }}
                onBlur={() => {
                  blurTimeoutRef.current = setTimeout(() => setFocused(false), 120);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && query.trim()) {
                    event.preventDefault();
                    addTag(query);
                  }
                }}
                placeholder={placeholder}
                className="w-full border-0 px-0 py-1 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-0"
              />

              {showDropdown ? (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-gray-200 bg-white shadow-sm">
                  {loadingTags ? (
                    <div className="px-3 py-2 text-xs text-gray-400">
                      Loading tags...
                    </div>
                  ) : (
                    suggestions.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => addTag(tag)}
                        className="block w-full px-3 py-2 text-left text-sm text-gray-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        #{tag}
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {value.length >= maxTags ? (
        <p className="mt-2 text-xs text-gray-400">Max 5 tags reached</p>
      ) : (
        <p className="mt-2 text-xs text-gray-400">
          {value.length} / {maxTags} tags selected
        </p>
      )}
    </div>
  );
}
