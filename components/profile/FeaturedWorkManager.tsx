"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  loadMyFeaturedWorkOptions,
  updateProfileFeaturedPosts,
} from "@/app/(main)/[username]/actions";
import { formatDate } from "@/lib/utils";
import { getPostMetadataTitle } from "@/lib/postDisplay";

interface FeaturedWorkOption {
  id: string;
  title: string | null;
  slug: string;
  type: string;
  published_at: string | null;
  created_at: string;
  isCoAuthor?: boolean;
}

interface FeaturedWorkManagerProps {
  initialPostIds: string[];
}

export default function FeaturedWorkManager({
  initialPostIds,
}: FeaturedWorkManagerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<FeaturedWorkOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(initialPostIds.slice(0, 3));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const optionsById = useMemo(
    () => new Map(options.map((option) => [option.id, option])),
    [options]
  );

  const selectedPosts = selectedIds
    .map((postId) => optionsById.get(postId))
    .filter((post): post is FeaturedWorkOption => Boolean(post));

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function closeDialog() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function togglePost(postId: string) {
    setError(null);
    setSelectedIds((current) => {
      if (current.includes(postId)) {
        return current.filter((selectedId) => selectedId !== postId);
      }

      if (current.length >= 3) {
        setError("You can feature up to three publications.");
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

  async function handleOpen() {
    setOpen(true);
    if (loaded || loading) return;

    setLoading(true);
    setError(null);
    const result = await loadMyFeaturedWorkOptions();
    if (result.error) {
      setError(result.error);
    } else {
      setOptions(result.options);
      setLoaded(true);
    }
    setLoading(false);
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
    closeDialog();
    router.refresh();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => void handleOpen()}
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-card-border bg-card px-3 text-xs font-semibold text-ink-soft transition-colors hover:border-card-border-hover hover:text-ink"
      >
        {initialPostIds.length > 0 ? "Manage featured work" : "Add featured work"}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="featured-work-manager-title"
            tabIndex={-1}
            className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-card-border bg-card p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="featured-work-manager-title"
                  className="text-lg font-semibold text-ink"
                >
                  Manage featured work
                </h3>
                <p className="mt-1 text-sm text-ink-muted">
                  Choose and order up to three published pieces for the top of your profile.
                </p>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-xl leading-none text-ink-muted hover:bg-canvas hover:text-ink-soft"
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
                      className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">
                          {index + 1}. {getPostMetadataTitle(post)}
                        </p>
                        <p className="text-xs text-ink-muted">Selected work</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => movePost(post.id, -1)}
                          disabled={index === 0}
                          className="min-h-11 rounded border border-card-border px-3 text-xs font-medium text-ink-soft hover:bg-canvas disabled:opacity-40"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => movePost(post.id, 1)}
                          disabled={index === selectedPosts.length - 1}
                          className="min-h-11 rounded border border-card-border px-3 text-xs font-medium text-ink-soft hover:bg-canvas disabled:opacity-40"
                        >
                          Down
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 space-y-2" aria-busy={loading}>
              {loading ? (
                <p role="status" className="rounded-xl border border-dashed border-card-border p-6 text-center text-sm text-ink-muted">
                  Loading your published work...
                </p>
              ) : null}
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
                        : "border-card-border bg-card hover:border-card-border"
                    } ${disabled ? "opacity-50" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-semibold text-ink">
                        {getPostMetadataTitle(post)}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">
                        {formatDate(displayDate)}
                        {post.isCoAuthor ? " · Co-author" : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        selected
                          ? "bg-emerald-600 text-white"
                          : "bg-canvas text-ink-muted"
                      }`}
                    >
                      {selected ? "Selected" : "Add"}
                    </span>
                  </button>
                );
              })}
            </div>

            {loaded && options.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-card-border p-6 text-center text-sm text-ink-muted">
                Publish your first idea before choosing featured work.
              </div>
            ) : null}

            {error ? <p className="mt-4 text-sm text-red-600" role="alert">{error}</p> : null}

            <div className="mt-6 flex justify-end gap-2 border-t border-divider pt-4">
              <button
                type="button"
                onClick={closeDialog}
                className="min-h-11 rounded-lg px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-canvas hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="min-h-11 rounded-lg bg-emerald-brand px-4 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37] disabled:opacity-50"
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
