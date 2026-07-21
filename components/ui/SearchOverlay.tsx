"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Badge from "@/components/ui/Badge";
import { isFormallyReviewed } from "@/lib/contentModel";

interface SearchResult {
  id: string;
  title: string;
  slug: string;
  type: string;
  content_kind?: string | null;
  article_format?: string | null;
  citation_id?: string | null;
  published_version_id?: string | null;
  url: string;
  profiles: { full_name: string | null; username: string } | null;
}

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setFocusedIndex(null);
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
      setFocusedIndex(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("posts")
      .select(
        "id, title, slug, type, content_kind, article_format, citation_id, published_version_id, profiles!posts_author_id_fkey(full_name, username)"
      )
      .eq("status", "published")
      .ilike("title", `%${q}%`)
      .limit(6);

    const mapped: SearchResult[] = (data ?? []).map((post) => ({
      ...post,
      url: `/post/${post.slug}`,
      profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
    }));
    setResults(mapped);
    setFocusedIndex(mapped.length > 0 ? 0 : null);
    setLoading(false);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void search(val);
    }, 300);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      onClose();
      return;
    }

    if (results.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFocusedIndex((current) => {
        if (current === null) {
          return 0;
        }

        return current === results.length - 1 ? 0 : current + 1;
      });
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setFocusedIndex((current) => {
        if (current === null) {
          return results.length - 1;
        }

        return current === 0 ? results.length - 1 : current - 1;
      });
    }

    if (event.key === "Enter" && focusedIndex !== null) {
      event.preventDefault();
      const focusedResult = results[focusedIndex];
      if (focusedResult) {
        router.push(focusedResult.url);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-20"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-overlay-title"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-100 p-4">
          <h2 id="search-overlay-title" className="sr-only">
            Search Indegenius
          </h2>
          <div className="flex items-center gap-3">
            <svg
              className="h-5 w-5 flex-shrink-0 text-gray-400"
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
              onKeyDown={handleInputKeyDown}
              placeholder="Search posts, essays, research..."
              className="flex-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
              aria-label="Search posts"
            />
            {query ? (
              <button
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  setFocusedIndex(null);
                }}
                aria-label="Clear search"
                className="text-gray-400 transition-colors hover:text-gray-600"
              >
                <svg
                  className="h-4 w-4"
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
            ) : null}
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {!query ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Search posts, essays, research...
            </div>
          ) : null}
          {query && loading ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              Searching...
            </div>
          ) : null}
          {query && !loading && results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              No posts found for &ldquo;{query}&rdquo;
            </div>
          ) : null}
          {results.map((result, index) => (
            <Link
              key={result.id}
              href={result.url}
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                focusedIndex === index
                  ? "bg-emerald-50 ring-1 ring-emerald-200"
                  : "hover:bg-canvas"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {result.title}
                </p>
                {result.profiles ? (
                  <p className="mt-0.5 text-xs text-gray-400">
                    {result.profiles.full_name ?? result.profiles.username}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge
                  type={result.type}
                  content_kind={result.content_kind}
                  article_format={result.article_format}
                />
                {result.citation_id || isFormallyReviewed(result) ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    {result.citation_id ? "Citable" : "Reviewed"}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
