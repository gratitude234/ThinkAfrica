"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { resolveContentKind, type ContentKind } from "@/lib/contentModel";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/utils";

interface ContinueDraftRowProps {
  userId: string | null;
  onNavigate: () => void;
  /** Lets the chooser reposition itself once this row changes its height. */
  onResolved?: (found: boolean) => void;
}

interface ResumableDraft {
  id: string;
  title: string | null;
  kindLabel: string;
  href: string;
  updatedAt: string;
}

const RESUME_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Only kinds with a real resume route can be offered. A Post publishes
 * immediately and has no server draft to return to, so a stray post-kind
 * draft row is skipped rather than pointed at a composer that cannot load it.
 */
function getResumeHref(kind: ContentKind | null, draftId: string) {
  if (kind === "article") return `/write?draft=${draftId}`;
  if (kind === "research" && FEATURE_FLAGS.research) {
    return `/submit/research?draft=${draftId}`;
  }
  return null;
}

/**
 * The "pick up where you left off" row above the contribution formats. It
 * lives in its own component so the chooser itself stays presentational and
 * testable without a Supabase client.
 *
 * Everything here is best-effort: this is a shortcut to work that is already
 * safely saved and still reachable from the dashboard, so a failed lookup
 * hides the row rather than taking the create menu down with it.
 */
export default function ContinueDraftRow({
  userId,
  onNavigate,
  onResolved,
}: ContinueDraftRowProps) {
  const [draft, setDraft] = useState<ResumableDraft | null>(null);
  // Held in a ref so a caller passing an inline arrow cannot turn every
  // parent render into another lookup. Synced in its own effect, declared
  // first so it lands before the lookup below can report a result.
  const onResolvedRef = useRef(onResolved);
  useEffect(() => {
    onResolvedRef.current = onResolved;
  }, [onResolved]);

  useEffect(() => {
    if (!userId) {
      setDraft(null);
      return;
    }

    let cancelled = false;

    const resolve = (next: ResumableDraft | null) => {
      if (cancelled) return;
      setDraft(next);
      onResolvedRef.current?.(Boolean(next));
    };

    // Matches the seven-day window the write page's own resume prompt uses:
    // older work belongs in My Drafts, not in the create menu.
    const findResumable = (rows: Array<Record<string, unknown>>) => {
      for (const row of rows) {
        const updatedAt = String(row.updated_at ?? "");
        if (Date.now() - new Date(updatedAt).getTime() > RESUME_MAX_AGE_MS) {
          continue;
        }

        const kind = resolveContentKind(row);
        const href = getResumeHref(kind, String(row.id));
        if (!href) continue;

        return {
          id: String(row.id),
          title: typeof row.title === "string" ? row.title : null,
          kindLabel: kind === "research" ? "Research" : "Article",
          href,
          updatedAt,
        };
      }

      return null;
    };

    try {
      void createClient()
        .from("posts")
        .select("id, title, type, content_kind, updated_at")
        .eq("author_id", userId)
        .eq("status", "draft")
        .order("updated_at", { ascending: false })
        .limit(5)
        .then(({ data, error }) => {
          resolve(
            error ? null : findResumable((data ?? []) as Array<Record<string, unknown>>)
          );
        }, () => resolve(null));
    } catch {
      resolve(null);
    }

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!draft) return null;

  return (
    <div className="mt-4">
      <Link
        href={draft.href}
        onClick={onNavigate}
        className="flex w-full items-center gap-3 rounded-xl border border-emerald-brand/30 bg-green-wash px-3 py-3 text-left transition-[border-color,background-color,transform] hover:border-emerald-brand/50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-1 motion-reduce:transition-none"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-tint text-emerald-brand">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 12a8.5 8.5 0 1 0 2.2-5.7M4 4v3.2h3.2" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-brand">
            Continue latest draft
          </span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-ink">
            {draft.title?.trim() || "Untitled draft"}
          </span>
          <span className="mt-0.5 block text-[11px] font-medium leading-4 text-ink-muted">
            {draft.kindLabel} · edited {formatRelativeTime(draft.updatedAt)}
          </span>
        </span>
        <svg className="h-4 w-4 shrink-0 text-emerald-brand/60" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
        </svg>
      </Link>
      <p className="mt-3 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        Or start something new
      </p>
    </div>
  );
}
