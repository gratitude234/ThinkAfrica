"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Badge from "@/components/ui/Badge";

interface SearchResult {
  id: string;
  title: string;
  slug: string;
  type: string;
  profiles: { full_name: string | null; username: string } | null;
}

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("posts")
      .select(
        "id, title, slug, type, profiles!posts_author_id_fkey(full_name, username)"
      )
      .eq("status", "published")
      .ilike("title", `%${q}%`)
      .limit(6);

    const mapped: SearchResult[] = (data ?? []).map((p) => ({
      ...p,
      profiles: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles,
    }));
    setResults(mapped);
    setLoading(false);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-20 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white max-w-lg w-full rounded-2xl shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <svg
              className="w-5 h-5 text-gray-400 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleChange}
              placeholder="Search posts, essays, research..."
              className="flex-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
              aria-label="Search posts"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery("");
                  setResults([]);
                }}
                aria-label="Clear search"
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {!query && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Search posts, essays, research...
            </div>
          )}
          {query && loading && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              Searching...
            </div>
          )}
          {query && !loading && results.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              No posts found for &ldquo;{query}&rdquo;
            </div>
          )}
          {results.map((result) => (
            <Link
              key={result.id}
              href={`/post/${result.slug}`}
              onClick={onClose}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {result.title}
                </p>
                {result.profiles && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {result.profiles.full_name ?? result.profiles.username}
                  </p>
                )}
              </div>
              <Badge type={result.type} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
