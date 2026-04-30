"use client";

import { useEffect, useState } from "react";

export default function WelcomeBanner({ firstName }: { firstName: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("welcome") === "1") {
      url.searchParams.delete("welcome");
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(null, "", nextUrl || "/");
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl text-ink">
            Welcome to ThinkAfrica, {firstName}.
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Here&apos;s what writers across the continent are publishing right now.
            Follow a few people to shape your feed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="text-lg leading-none text-emerald-700 transition-colors hover:text-emerald-900"
          aria-label="Dismiss welcome banner"
        >
          ×
        </button>
      </div>
    </div>
  );
}
