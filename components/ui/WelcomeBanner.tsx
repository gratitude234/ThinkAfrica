"use client";

import { useEffect, useState } from "react";

interface WelcomeBannerProps {
  firstName: string;
  primaryLabel: string | null;
}

export default function WelcomeBanner({ firstName, primaryLabel }: WelcomeBannerProps) {
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
    <div className="mb-6 rounded-2xl bg-emerald-brand p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">
            Welcome to Indegenius, {firstName}.
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-white/80">
            {primaryLabel
              ? `Your ${primaryLabel} profile is ready. We're building your feed now.`
              : "Your profile is ready. We're building your feed now."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="text-lg leading-none text-white/70 transition-colors hover:text-white"
          aria-label="Dismiss welcome banner"
        >
          ×
        </button>
      </div>
    </div>
  );
}
