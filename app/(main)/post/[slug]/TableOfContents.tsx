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
    <div className="sticky top-24 rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
        Contents
      </h3>
      <nav className="relative">
        {/* Background rail */}
        <div className="absolute bottom-0 left-0 top-0 w-[2px] rounded-full bg-gray-100" />

        <div className="space-y-0.5">
          {headings.map((heading) => {
            const isActive = activeId === heading.id;
            return (
              <a
                key={heading.id}
                href={`#${heading.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .getElementById(heading.id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  setActiveId(heading.id);
                }}
                className={`relative block py-1 text-[12px] leading-snug transition-colors ${
                  heading.level === 3 ? "pl-6" : "pl-4"
                } ${
                  isActive
                    ? "font-semibold text-emerald-600"
                    : "font-normal text-gray-400 hover:text-gray-700"
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
