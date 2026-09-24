"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ReportButton from "@/components/moderation/ReportButton";
import { deleteOwnDraftPosts } from "@/app/(write)/write/deleteActions";

interface PublicationMoreMenuProps {
  postId: string;
  slug: string;
  title: string;
  status: string;
  isOwner: boolean;
  viewerId: string | null;
  ownerUsername?: string | null;
  compact?: boolean;
}

export default function PublicationMoreMenu({
  postId,
  slug,
  title,
  status,
  isOwner,
  viewerId,
  ownerUsername,
  compact = false,
}: PublicationMoreMenuProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const canDeleteDraft = isOwner && status === "draft";

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"], [role="menu"] button')?.focus();
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const deleteDraft = () => {
    if (!canDeleteDraft || pending) return;
    if (!window.confirm("Delete this draft? This cannot be undone.")) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteOwnDraftPosts({ postIds: [postId] });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push(ownerUsername ? `/${ownerUsername}` : "/");
      router.refresh();
    });
  };

  return (
    <div ref={rootRef} className="relative shrink-0 font-public-sans" onKeyDown={(event) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="More publication actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center justify-center rounded-lg border border-[#D8D2C4] text-[#6B7570] transition-colors hover:border-[#BEB7AA] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
          compact ? "h-8 w-8 text-[13px]" : "h-9 w-9 text-[15px]"
        }`}
      >
        <span aria-hidden="true" className="-mt-1 tracking-[2px]">•••</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+7px)] z-40 min-w-[150px] rounded-[10px] border border-[#E4DFD4] bg-surface p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
        >
          {isOwner ? (
            <>
              <Link
                href={`/edit/${slug}`}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-md px-2.5 py-2 text-[13px] text-[#3F4A44] hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none"
              >
                Edit
              </Link>
              {canDeleteDraft ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={pending}
                  onClick={deleteDraft}
                  className="block w-full rounded-md px-2.5 py-2 text-left text-[13px] text-[#B3453A] hover:bg-red-50 disabled:opacity-60 focus-visible:bg-red-50 focus-visible:outline-none"
                >
                  {pending ? "Deleting…" : "Delete draft"}
                </button>
              ) : null}
            </>
          ) : viewerId ? (
            <div role="none" className="px-0.5 py-0.5">
              <ReportButton
                targetType="post"
                targetId={postId}
                targetLabel={`\"${title}\"`}
                variant="text"
                className="block w-full rounded-md px-2 py-2 text-left !text-[13px] !text-[#3F4A44] hover:bg-canvas hover:!text-red-600"
              />
            </div>
          ) : (
            <Link role="menuitem" href={`/login?redirectTo=${encodeURIComponent(`/post/${slug}`)}`} className="block rounded-md px-2.5 py-2 text-[13px] text-ink-muted hover:bg-canvas">Sign in to report</Link>
          )}
          {error ? <p className="max-w-[220px] px-2.5 py-2 text-xs text-red-600">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
