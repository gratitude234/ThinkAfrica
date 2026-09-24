"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  title: string;
  slug: string;
  excerpt?: string | null;
  authorName?: string | null;
  flat?: boolean;
}

export default function ShareButtons({
  title,
  slug,
  excerpt,
  authorName,
  flat = false,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [url, setUrl] = useState(`/post/${slug}`);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setUrl(`${window.location.origin}/post/${slug}`);
  }, [slug]);

  useEffect(() => {
    if (!menuOpen) return;
    firstItemRef.current?.focus();

    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  const shareText = [
    title,
    authorName ? `by ${authorName}` : null,
    excerpt ? `${excerpt.slice(0, 120)}${excerpt.length > 120 ? "…" : ""}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const copyLink = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setMenuOpen(false);
    triggerRef.current?.focus();
    window.setTimeout(() => setCopied(false), 1800);
  };

  const shareVia = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: authorName ? `${title} by ${authorName}` : title,
          url,
        });
        setMenuOpen(false);
        triggerRef.current?.focus();
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    // Desktop browsers without Web Share still get a useful share path rather
    // than a dead control. WhatsApp accepts the same text+URL payload and lets
    // the user choose the destination chat in its own UI.
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${shareText}\nRead on Indegenius: ${url}`)}`,
      "_blank",
      "noopener,noreferrer"
    );
    setMenuOpen(false);
  };

  const triggerClass = flat
    ? "inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1.5 text-[13.5px] font-semibold text-ink-muted transition-colors hover:text-emerald-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    : "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-card-border bg-surface px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-emerald-brand/30 hover:text-emerald-brand";

  return (
    <div ref={rootRef} className="relative font-public-sans">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setMenuOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={triggerClass}
      >
        <svg className="h-[19px] w-[19px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
        </svg>
        {copied ? "Copied" : "Share"}
      </button>

      {menuOpen ? (
        <div
          role="menu"
          aria-label="Share publication"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setMenuOpen(false);
              triggerRef.current?.focus();
            }
          }}
          className="absolute left-0 top-[calc(100%+8px)] z-40 w-[240px] rounded-[10px] border border-[#E4DFD4] bg-surface p-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)] sm:left-auto sm:right-0"
        >
          <p className="mb-2 text-[12.5px] font-semibold text-[#1B2420]">Share</p>
          <button
            ref={firstItemRef}
            type="button"
            role="menuitem"
            onClick={() => void copyLink()}
            className="flex w-full items-center gap-2.5 border-t border-[#EDE8DD] py-2.5 text-left text-[13px] text-[#3F4A44] hover:text-emerald-brand focus-visible:outline-none focus-visible:text-emerald-brand"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.5-1.5m-1.328-6.828a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.5 1.5" />
            </svg>
            Copy link
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void shareVia()}
            className="flex w-full items-center gap-2.5 border-t border-[#EDE8DD] py-2.5 text-left text-[13px] text-[#3F4A44] hover:text-emerald-brand focus-visible:outline-none focus-visible:text-emerald-brand"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
            </svg>
            Share via…
          </button>
        </div>
      ) : null}
    </div>
  );
}
