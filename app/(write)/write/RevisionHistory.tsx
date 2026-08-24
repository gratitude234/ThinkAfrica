"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { contributionText } from "@/lib/contribution";
import { captureRevisionNow } from "./revisionActions";

interface Revision {
  id: string;
  title: string | null;
  excerpt: string;
  content: string;
  word_count: number;
  created_at: string;
}

export interface RestoredRevision {
  title: string;
  excerpt: string;
  content: string;
}

function when(iso: string) {
  const created = new Date(iso);
  const diff = Math.floor((Date.now() - created.getTime()) / 1000);
  if (diff < 90) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return created.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function opening(revision: Revision) {
  const text = contributionText(revision.content);
  if (!text) return "Empty";
  return text.length > 140 ? `${text.slice(0, 140).replace(/\s+\S*$/, "")}…` : text;
}

/**
 * Every writer has cut three paragraphs, kept going, and wanted them back an
 * hour later. Snapshots are taken by record_post_revision() as the draft
 * autosaves, so this list is a record of the session rather than something the
 * writer has to remember to do.
 */
export default function RevisionHistory({
  postId,
  currentSnapshot,
  onRestore,
}: {
  postId: string;
  currentSnapshot: RestoredRevision;
  onRestore: (revision: RestoredRevision) => void;
}) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("post_revisions")
      .select("id, title, excerpt, content, word_count, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: false })
      .limit(40);
    setLoading(false);
    if (loadError) {
      setError("Couldn't load your history.");
      return;
    }
    setRevisions((data ?? []) as Revision[]);
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (revision: Revision) => {
    setRestoringId(revision.id);
    setError(null);
    // Keep what is on the canvas right now, so restoring is never a one-way
    // trade of the new work for the old.
    const captured = await captureRevisionNow({ postId, snapshot: {
      title: currentSnapshot.title,
      content: currentSnapshot.content,
      excerpt: currentSnapshot.excerpt,
      tags: [],
      coverImageUrl: "",
      references: [],
      collaborators: [],
      inResponseToId: null,
      promptId: null,
    } });
    if (captured.error) {
      setRestoringId(null);
      setError(captured.error);
      return;
    }
    onRestore({
      title: revision.title ?? "",
      excerpt: revision.excerpt,
      content: revision.content,
    });
    setRestoringId(null);
    void load();
  };

  if (loading) {
    return <p className="text-sm text-ink-muted">Loading history…</p>;
  }

  if (!revisions.length) {
    return (
      <p className="text-sm text-ink-muted">
        No earlier versions yet. Snapshots are kept as you write, a few minutes apart.
      </p>
    );
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-divider overflow-hidden rounded-xl border border-card-border">
        {revisions.map((revision) => {
          const expanded = expandedId === revision.id;
          return (
            <li key={revision.id} className="bg-surface">
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : revision.id)}
                  aria-expanded={expanded}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium text-ink">
                    {revision.title?.trim() || "Untitled"}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {when(revision.created_at)} ·{" "}
                    {revision.word_count === 1
                      ? "1 word"
                      : `${revision.word_count.toLocaleString()} words`}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => void restore(revision)}
                  disabled={restoringId !== null}
                  className="min-h-9 shrink-0 rounded-lg px-2.5 text-xs font-semibold text-emerald-ink transition-colors hover:bg-green-tint disabled:opacity-50"
                >
                  {restoringId === revision.id ? "Restoring…" : "Restore"}
                </button>
              </div>
              {expanded ? (
                <p className="border-t border-divider bg-canvas px-3 py-2.5 text-xs leading-relaxed text-ink-soft">
                  {opening(revision)}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
