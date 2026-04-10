"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { POST_TYPE_LABELS } from "@/lib/utils";

interface Draft {
  id: string;
  title: string;
  type: string;
  updated_at: string;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function MyDrafts({ activeDraftId }: { activeDraftId: string | null }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("posts")
        .select("id, title, type, updated_at")
        .eq("author_id", user.id)
        .eq("status", "draft")
        .order("updated_at", { ascending: false })
        .limit(10)
        .then(({ data }) => setDrafts(data ?? []));
    });
  }, []);

  const filtered = drafts.filter((d) => d.id !== activeDraftId);
  if (filtered.length === 0) return null;

  return (
    <div className="mb-6 border border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          My Drafts
          <span className="px-1.5 py-0.5 rounded-full text-xs bg-gray-200 text-gray-600">
            {filtered.length}
          </span>
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <ul className="divide-y divide-gray-200 border-t border-gray-200">
          {filtered.map((draft) => (
            <li key={draft.id}>
              <Link
                href={`/write?draft=${draft.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-white transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {draft.title || "Untitled draft"}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {POST_TYPE_LABELS[draft.type as keyof typeof POST_TYPE_LABELS] ?? draft.type} · saved {timeAgo(draft.updated_at)}
                  </p>
                </div>
                <span className="ml-3 text-xs text-emerald-600 font-medium flex-shrink-0">
                  Resume →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
