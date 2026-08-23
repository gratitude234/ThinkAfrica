"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function IntellectualRecordWelcome() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("welcome") !== "1") return;

    url.searchParams.delete("welcome");
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(null, "", nextUrl || "/explore");
  }, []);

  if (!visible) return null;

  return (
    <section className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-brand p-5 text-white sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
            Your next step
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold">
            Your Intellectual Record starts with one contribution.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">
            Discover an idea, publish your own, respond to someone else, or add an argument to a debate. Each public contribution is added to your record.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Dismiss getting started guide"
        >
          ×
        </button>
      </div>
      <div className="mt-5 flex flex-wrap gap-2.5">
        <Link
          href="/write"
          className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-semibold text-emerald-900 transition-colors hover:bg-emerald-50"
        >
          Publish an idea
        </Link>
        <Link
          href="/responses"
          className="inline-flex min-h-11 items-center rounded-lg border border-white/25 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
        >
          Read responses
        </Link>
        <Link
          href="/debates"
          className="inline-flex min-h-11 items-center rounded-lg border border-white/25 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
        >
          Join a debate
        </Link>
      </div>
    </section>
  );
}
