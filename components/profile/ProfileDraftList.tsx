"use client";

import Link from "next/link";
import { useState } from "react";
import { deleteOwnDraftPosts } from "@/app/(write)/write/deleteActions";
import type { ProfileDraft } from "@/lib/profileViewData";
import { formatDate } from "@/lib/utils";

export default function ProfileDraftList({ initialDrafts }: { initialDrafts: ProfileDraft[] }) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function draftLabel(draft: ProfileDraft) {
    return draft.kind === "article" ? draft.title?.trim() || "Untitled Article" : draft.excerpt || "Post draft";
  }

  async function removeDraft(draft: ProfileDraft) {
    if (!window.confirm(`Delete "${draftLabel(draft)}"? This cannot be undone.`)) return;

    setDeletingId(draft.id);
    setError(null);
    try {
      const result = await deleteOwnDraftPosts({ postIds: [draft.id] });
      if (!result.ok) { setError(result.error); return; }
      setDrafts(current => current.filter(item => !result.data.deleted.includes(item.id)));
    } catch {
      setError("Could not delete the draft. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  if (drafts.length === 0) {
    return (
      <div className="profile-empty">
        <p className="text-sm text-ink-muted">No drafts yet.</p>
        <Link href="/write" className="focus-ring mt-3 inline-block text-sm font-semibold text-emerald-ink">Start writing</Link>
      </div>
    );
  }

  return (
    <section aria-label="Drafts">
      {error ? <p role="alert" className="mb-3 text-sm text-red-600">{error}</p> : null}
      <ul className="divide-y divide-card-border">
        {drafts.map((draft) => (
          <li key={draft.id} className="flex flex-wrap items-center gap-3 py-4 sm:flex-nowrap">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{draftLabel(draft)}</p>
              <p className="mt-1 text-xs text-ink-muted">
                {draft.kind === "article" ? "Article" : "Post"} · Updated {formatDate(draft.updatedAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/write?draft=${draft.id}`} className="focus-ring inline-flex min-h-10 items-center rounded-lg border border-card-border px-3 text-sm font-semibold text-ink-soft hover:text-ink">Edit</Link>
              <button
                type="button"
                onClick={() => void removeDraft(draft)}
                disabled={deletingId !== null}
                className="focus-ring inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {deletingId === draft.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

