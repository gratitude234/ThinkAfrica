"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  title: string;
  slug: string;
  excerpt?: string | null;
  authorName?: string | null;
  /** Borderless icon+label styling for inline action rows (post conversation view). */
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
  const relativeUrl = `/post/${slug}`;
  const [url, setUrl] = useState(relativeUrl);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeMenu = (returnFocus = true) => {
    setMenuOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  /**
   * The keyboard model the `role="menu"` was already promising.
   *
   * The element announced itself as a menu with no arrow keys, no Escape, no
   * focus move on open and no focus return on close, so a screen reader was
   * told about a widget that did not behave like one.
   */
  const moveFocus = (delta: number) => {
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = (current + delta + items.length) % items.length;
    items[current === -1 && delta < 0 ? items.length - 1 : next]?.focus();
  };

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(-1);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const items = Array.from(
        listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
      );
      (event.key === "Home" ? items[0] : items[items.length - 1])?.focus();
    }
  };

  // Focus the first item when the menu opens, so a keyboard user lands inside
  // it rather than having to tab past the trigger to reach it.
  useEffect(() => {
    if (!menuOpen) return;
    listRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menuOpen]);

  useEffect(() => {
    setUrl(`${window.location.origin}${relativeUrl}`);
  }, [relativeUrl]);

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const shareText = [
    title,
    authorName ? `by ${authorName}` : null,
    excerpt
      ? `${excerpt.slice(0, 120)}${excerpt.length > 120 ? "..." : ""}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
    `${shareText}\nRead on Indegenius: ${url}`
  )}`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

  const copyLink = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      // Copying keeps the reader here, so focus goes back to the trigger that
      // now reads "Copied" rather than being dropped on the document.
      closeMenu();
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const sharePost = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: authorName ? `${title} by ${authorName}` : title,
          url,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    setMenuOpen((current) => !current);
  };

  return (
    <div ref={menuRef} className={flat ? "relative" : "relative w-full sm:w-auto"}>
      <button
        ref={triggerRef}
        type="button"
        onClick={sharePost}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && menuOpen) {
            event.preventDefault();
            moveFocus(1);
          }
        }}
        className={
          flat
            ? "inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-excerpt font-medium text-ink-soft transition-colors hover:text-emerald-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
            : "inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-card-border bg-surface px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-emerald-200 hover:text-emerald-ink sm:w-auto"
        }
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"
          />
        </svg>
        {copied ? "Copied" : "Share"}
      </button>

      {menuOpen ? (
        <div
          ref={listRef}
          role="menu"
          aria-label="Share this post"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-full min-w-[220px] overflow-hidden rounded-lg border border-card-border bg-surface p-2 shadow-xl sm:w-[240px]"
        >
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className="block rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-inset"
            onClick={() => closeMenu(false)}
          >
            WhatsApp
          </a>
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className="block rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-inset"
            onClick={() => closeMenu(false)}
          >
            X
          </a>
          <a
            href={linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className="block rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-inset"
            onClick={() => closeMenu(false)}
          >
            LinkedIn
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={copyLink}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-soft transition-colors hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-inset"
          >
            Copy link
          </button>
        </div>
      ) : null}
    </div>
  );
}
