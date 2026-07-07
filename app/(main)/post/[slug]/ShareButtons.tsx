"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  title: string;
  slug: string;
  excerpt?: string | null;
  authorName?: string | null;
}

export default function ShareButtons({
  title,
  slug,
  excerpt,
  authorName,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const relativeUrl = `/post/${slug}`;
  const [url, setUrl] = useState(relativeUrl);
  const menuRef = useRef<HTMLDivElement>(null);

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
      setMenuOpen(false);
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
    <div ref={menuRef} className="relative w-full sm:w-auto">
      <button
        type="button"
        onClick={sharePost}
        className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-emerald-200 hover:text-emerald-700 sm:w-auto"
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
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-full min-w-[220px] overflow-hidden rounded-lg border border-gray-200 bg-white p-2 shadow-xl sm:w-[240px]"
        >
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            onClick={() => setMenuOpen(false)}
          >
            WhatsApp
          </a>
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            onClick={() => setMenuOpen(false)}
          >
            X
          </a>
          <a
            href={linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            onClick={() => setMenuOpen(false)}
          >
            LinkedIn
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={copyLink}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Copy link
          </button>
        </div>
      ) : null}
    </div>
  );
}
