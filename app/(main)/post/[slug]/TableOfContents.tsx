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
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <div className="sticky top-24">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Contents
      </h3>
      <nav className="space-y-1">
        {headings.map((heading) => (
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
            className={`block text-sm leading-snug transition-colors ${
              heading.level === 3 ? "pl-3" : ""
            } ${
              activeId === heading.id
                ? "font-medium text-emerald-600"
                : "text-gray-400 hover:text-gray-700"
            }`}
          >
            {heading.text}
          </a>
        ))}
      </nav>
    </div>
  );
}
