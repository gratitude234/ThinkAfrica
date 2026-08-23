"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { resolveContentKind } from "@/lib/contentModel";
import { isAbandonedScrap } from "@/lib/contribution";

interface Draft {
  id: string;
  title: string | null;
  excerpt?: string | null;
  word_count?: number | null;
  type: string;
  content_kind?: string | null;
  article_format?: string | null;
  updated_at: string;
}

/** Rows shown before the list defers to the dashboard. */
const VISIBLE_LIMIT = 5;

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * An untitled draft has no name of its own, and a list of identical "Untitled
 * draft" rows is unreadable. Its own opening words name it instead.
 */
function draftName(draft: Draft) {
  const title = draft.title?.trim();
  if (title) return title;
  const opening = draft.excerpt?.trim();
  if (opening) return opening.length > 60 ? `${opening.slice(0, 60).replace(/\s+\S*$/, "")}…` : opening;
  return "Untitled draft";
}

function draftMeta(draft: Draft) {
  const words = draft.word_count ?? 0;
  const length = words === 1 ? "1 word" : `${words.toLocaleString()} words`;
  return `${length} · ${timeAgo(draft.updated_at)}`;
}

export default function MyDrafts({
  activeDraftId,
  variant = "default",
}: {
  activeDraftId: string | null;
  variant?: "default" | "panel";
}) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [confirmingSweep, setConfirmingSweep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("posts")
        .select("id, title, excerpt, word_count, type, content_kind, article_format, updated_at")
        .eq("author_id", user.id)
        .eq("status", "draft")
        .order("updated_at", { ascending: false })
        .limit(30)
        .then(({ data }) => setDrafts((data ?? []) as Draft[]));
    });
  }, []);

  const filtered = useMemo(
    () => drafts.filter((draft) => draft.id !== activeDraftId && resolveContentKind(draft) !== "research"),
    [activeDraftId, drafts]
  );
  const scraps = useMemo(() => filtered.filter((draft) => isAbandonedScrap(draft)), [filtered]);

  /**
   * Deleting a draft is a plain row delete: guard_locked_post_write in the
   * database is what actually permits it, and only ever for an author's own
   * draft. A row that changed status in another tab is rejected there.
   */
  const remove = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("posts").delete().in("id", ids);
    setBusy(false);
    if (deleteError) {
      setError(deleteError.message || "Couldn't delete that. Try again.");
      return;
    }
    const removed = new Set(ids);
    setDrafts((current) => current.filter((draft) => !removed.has(draft.id)));
    setConfirmingSweep(false);
  }, []);

  if (filtered.length === 0) return null;
  const compact = variant === "panel";
  const visible = showAll ? filtered : filtered.slice(0, VISIBLE_LIMIT);
  const hidden = filtered.length - visible.length;

  return (
    <div className={`overflow-hidden rounded-xl border border-card-border bg-surface ${compact ? "" : "mb-6 bg-canvas"}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between text-sm font-medium text-ink-soft transition-colors hover:bg-canvas ${compact ? "px-3 py-2.5" : "px-4 py-3"}`}
      >
        <span className="flex items-center gap-2">
          <svg className="h-4 w-4 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          My Drafts
          <span className="rounded-full bg-canvas px-1.5 py-0.5 text-xs text-ink-muted">{filtered.length}</span>
        </span>
        <svg
          className={`h-4 w-4 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open ? (
        <>
          {/* The sweep is offered, never taken. Two taps, and only ever for
              untitled scraps nobody has opened in a week. */}
          {scraps.length > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider bg-gold-tint px-3 py-2.5">
              {confirmingSweep ? (
                <>
                  <p className="text-xs text-gold-ink">Delete {scraps.length} permanently?</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirmingSweep(false)} disabled={busy} className="min-h-9 rounded-lg px-2.5 text-xs font-semibold text-gold-ink">
                      Cancel
                    </button>
                    <button type="button" onClick={() => void remove(scraps.map((draft) => draft.id))} disabled={busy} className="min-h-9 rounded-lg bg-gold-ink px-3 text-xs font-semibold text-white disabled:opacity-60">
                      {busy ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-gold-ink">{scraps.length} empty drafts you never came back to.</p>
                  <button type="button" onClick={() => setConfirmingSweep(true)} className="min-h-9 rounded-lg px-2.5 text-xs font-semibold text-gold-ink underline underline-offset-2">
                    Clear them
                  </button>
                </>
              )}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="border-t border-divider bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          ) : null}

          <ul className="divide-y divide-divider border-t border-divider">
            {visible.map((draft) => (
              <li key={draft.id} className="flex items-center transition-colors hover:bg-canvas">
                <Link
                  href={`/write?draft=${draft.id}`}
                  className={`min-w-0 flex-1 ${compact ? "px-3 py-2.5" : "px-4 py-3"}`}
                >
                  <p className="truncate text-sm font-medium text-ink">{draftName(draft)}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{draftMeta(draft)}</p>
                </Link>
                <span className="flex-shrink-0 text-xs font-medium text-emerald-ink">Resume</span>
                <button
                  type="button"
                  onClick={() => void remove([draft.id])}
                  disabled={busy}
                  aria-label={`Delete draft: ${draftName(draft)}`}
                  className="ml-1 mr-1.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-red-600 disabled:opacity-50"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>

          {hidden > 0 ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full border-t border-divider px-3 py-2.5 text-xs font-semibold text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
            >
              Show {hidden} more
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
