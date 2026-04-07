"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const EXPLORE_ITEMS = [
  {
    href: "/leaderboard",
    label: "Leaderboard",
    description: "Top contributors",
  },
  { href: "/webinars", label: "Webinars", description: "Live sessions" },
  {
    href: "/policy",
    label: "Policy",
    description: "Policy briefs & analysis",
  },
  {
    href: "/fellowships",
    label: "Fellowships",
    description: "Funding opportunities",
  },
];

export default function ExploreDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const isActive = EXPLORE_ITEMS.some((item) =>
    pathname.startsWith(item.href)
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-1 ${
          isActive
            ? "text-emerald-brand"
            : "text-gray-600 hover:text-emerald-brand hover:bg-gray-50"
        }`}
      >
        Explore
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-60 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
          {EXPLORE_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 hover:bg-gray-50 transition-colors"
              >
                <p
                  className={`text-sm ${active ? "font-bold text-emerald-brand" : "font-medium text-gray-800"}`}
                >
                  {item.label}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {item.description}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
