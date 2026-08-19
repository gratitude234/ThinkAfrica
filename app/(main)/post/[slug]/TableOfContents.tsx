"use client";

import { useEffect, useState } from "react";

interface Heading {
  id: string;
  text: string;
  level: number;
}

interface Props {
  headings: Heading[];
}

export default function TableOfContents({ headings }: Props) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (headings.length > 0) {
      setActiveId(headings[0].id);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);

        if (visible.length > 0) {
          const topmost = visible.reduce((a, b) =>
            a.boundingClientRect.top < b.boundingClientRect.top ? a : b
          );
          setActiveId(topmost.target.id);
        }
      },
      { rootMargin: "0px 0px -60% 0px", threshold: 0 }
    );

    headings.forEach((heading) => {
      const element = document.getElementById(heading.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <div className="sticky top-[var(--app-sticky-offset)] rounded-lg border border-card-border bg-surface p-4">
      <h3 className="mb-3 text-kicker font-bold uppercase text-ink-muted">
        Contents
      </h3>
      <nav className="relative">
        {/* Background rail */}
        <div className="absolute bottom-0 left-0 top-0 w-[2px] rounded-full bg-canvas" />

        <div className="space-y-0.5">
          {headings.map((heading) => {
            const isActive = activeId === heading.id;
            return (
              <a
                key={heading.id}
                href={`#${heading.id}`}
                /* No preventDefault. Scrolling by hand left the URL hash
                   untouched, so no section was linkable and Back could not
                   undo a jump. `scroll-margin-top` on the targets keeps them
                   clear of the sticky nav. */
                onClick={() => setActiveId(heading.id)}
                className={`relative block py-1 text-meta leading-snug transition-colors ${
                  heading.level === 3 ? "pl-6" : "pl-4"
                } ${
                  isActive
                    ? "font-semibold text-emerald-ink"
                    : "font-normal text-ink-muted hover:text-ink-soft"
                }`}
              >
                {isActive ? (
                  <span className="absolute bottom-0 left-0 top-0 w-[2px] rounded-full bg-emerald-500 transition-all" />
                ) : null}
                {heading.text}
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
