"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { resolveContentKind } from "@/lib/contentModel";

interface Draft {
  id: string;
  title: string | null;
  type: string;
  content_kind?: string | null;
  article_format?: string | null;
  updated_at: string;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
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

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("posts")
        .select("id, title, type, content_kind, article_format, updated_at")
        .eq("author_id", user.id)
        .eq("status", "draft")
        .order("updated_at", { ascending: false })
        .limit(10)
        .then(({ data }) => setDrafts(data ?? []));
    });
  }, []);

  const filtered = drafts.filter(
    (draft) => draft.id !== activeDraftId && resolveContentKind(draft) !== "research"
  );
  if (filtered.length === 0) return null;
  const compact = variant === "panel";

  return (
    <div
      className={`overflow-hidden rounded-xl border border-card-border bg-surface ${
        compact ? "" : "mb-6 bg-canvas"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between text-sm font-medium text-ink-soft transition-colors hover:bg-canvas ${
          compact ? "px-3 py-2.5" : "px-4 py-3"
        }`}
      >
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          My Drafts
          <span className="px-1.5 py-0.5 rounded-full text-xs bg-canvas text-ink-muted">
            {filtered.length}
          </span>
        </span>
        <svg
          className={`w-4 h-4 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <ul className="divide-y divide-divider border-t border-divider">
          {filtered.map((draft) => {
            return (
              <li key={draft.id}>
                <Link
                  href={`/write?draft=${draft.id}`}
                  className={`flex items-center justify-between transition-colors hover:bg-canvas ${
                    compact ? "px-3 py-2.5" : "px-4 py-3 hover:bg-white"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {draft.title || "Untitled draft"}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Saved {timeAgo(draft.updated_at)}
                    </p>
                  </div>
                  <span className="ml-3 text-xs text-emerald-ink font-medium flex-shrink-0">
                    Resume
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
