"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/utils";

interface Draft {
  id: string;
  title: string | null;
  updated_at: string;
}

interface ContinueDraftBannerProps {
  activeDraftId: string | null;
}

export default function ContinueDraftBanner({
  activeDraftId,
}: ContinueDraftBannerProps) {
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (activeDraftId) return;

    const supabase = createClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;

      supabase
        .from("posts")
        .select("id, title, updated_at")
        .eq("author_id", user.id)
        .eq("status", "draft")
        .order("updated_at", { ascending: false })
        .limit(5)
        .then(({ data }) => {
          const recentDraft =
            (data ?? []).find((item) => {
              if (item.id === activeDraftId) return false;

              const age = Date.now() - new Date(item.updated_at).getTime();
              return age <= 7 * 24 * 60 * 60 * 1000;
            }) ?? null;

          setDraft(recentDraft);
        });
    });
  }, [activeDraftId]);

  if (!draft || activeDraftId) return null;

  return (
    <Link
      href={`/write?draft=${draft.id}`}
      className="mb-6 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 transition-colors hover:bg-emerald-100"
    >
      <div className="min-w-0">
        <p className="mb-0.5 text-xs font-semibold uppercase text-emerald-700">
          Continue writing
        </p>
        <p className="truncate text-sm font-medium text-gray-900">
          {draft.title?.trim() || "Untitled draft"}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          Last edited {formatRelativeTime(draft.updated_at)}
        </p>
      </div>
      <span className="ml-4 shrink-0 text-sm font-medium text-emerald-700">
        Resume →
      </span>
    </Link>
  );
}
