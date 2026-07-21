"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfileFeaturedPosts } from "@/app/(main)/[username]/actions";
import { formatDate } from "@/lib/utils";
import { getPostMetadataTitle } from "@/lib/postDisplay";

interface FeaturedWorkOption {
  id: string;
  title: string | null;
  slug: string;
  type: string;
  published_at: string | null;
  created_at: string;
  view_count?: number | null;
  read_count?: number | null;
  isCoAuthor?: boolean;
}

interface FeaturedWorkManagerProps {
  options: FeaturedWorkOption[];
  initialPostIds: string[];
}

export default function FeaturedWorkManager({
  options,
  initialPostIds,
}: FeaturedWorkManagerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(initialPostIds.slice(0, 3));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const optionsById = useMemo(
    () => new Map(options.map((option) => [option.id, option])),
    [options]
  );

  const selectedPosts = selectedIds
    .map((postId) => optionsById.get(postId))
    .filter((post): post is FeaturedWorkOption => Boolean(post));

  function togglePost(postId: string) {
    setError(null);
    setSelectedIds((current) => {
      if (current.includes(postId)) {
        return current.filter((selectedId) => selectedId !== postId);
      }

      if (current.length >= 3) {
        setError("You can feature up to three posts.");
        return current;
      }

      return [...current, postId];
    });
  }

  function movePost(postId: string, direction: -1 | 1) {
    setSelectedIds((current) => {
      const index = current.indexOf(postId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const result = await updateProfileFeaturedPosts(selectedIds);

    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }

    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:border-gray-400 hover:text-gray-900"
      >
        Manage featured work
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="featured-work-manager-title"
            className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="featured-work-manager-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  Manage featured work
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Choose up to three published pieces for the top of your profile.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-xl leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close featured work manager"
              >
                x
              </button>
            </div>

            {selectedPosts.length > 0 ? (
              <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                  Featured order
                </p>
                <div className="mt-3 space-y-2">
                  {selectedPosts.map((post, index) => (
                    <div
                      key={post.id}
                      className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">
                          {index + 1}. {getPostMetadataTitle(post)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {(post.read_count ?? 0).toLocaleString()} reads
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => movePost(post.id, -1)}
                          disabled={index === 0}
                          className="rounded border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => movePost(post.id, 1)}
                          disabled={index === selectedPosts.length - 1}
                          className="rounded border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                        >
                          Down
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 space-y-2">
              {options.map((post) => {
                const selected = selectedIds.includes(post.id);
                const disabled = !selected && selectedIds.length >= 3;
                const displayDate = post.published_at ?? post.created_at;

                return (
                  <button
                    key={post.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => togglePost(post.id)}
                    className={`flex w-full items-start justify-between gap-4 rounded-xl border p-4 text-left transition-colors ${
                      selected
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    } ${disabled ? "opacity-50" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-semibold text-gray-900">
                        {getPostMetadataTitle(post)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {formatDate(displayDate)} / {(post.read_count ?? 0).toLocaleString()} reads
                        {post.isCoAuthor ? " / Co-author" : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        selected
                          ? "bg-emerald-600 text-white"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {selected ? "Selected" : "Add"}
                    </span>
                  </button>
                );
              })}
            </div>

            {options.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                Publish a post before choosing featured work.
              </div>
            ) : null}

            {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

            <div className="mt-6 flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37] disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save featured work"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
