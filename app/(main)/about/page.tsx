import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_SEO_DESCRIPTION } from "@/lib/brand";

export const metadata: Metadata = {
  title: "About Indegenius",
  description: BRAND_SEO_DESCRIPTION,
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-14 py-8 text-ink">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-brand">About</p>
        <h1 className="font-display mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          A focused publishing platform.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-ink-muted">
          Indegenius gives readers and writers a clear place to publish ideas,
          join conversations, and discover work through topics and people.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-card-border bg-white p-6">
          <h2 className="font-display text-2xl font-semibold">For readers</h2>
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            Read Posts and Articles, follow writers, save publications, and
            comment on the work that moves the conversation forward.
          </p>
        </article>
        <article className="rounded-2xl border border-card-border bg-white p-6">
          <h2 className="font-display text-2xl font-semibold">For writers</h2>
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            Write in one composer, keep private drafts on your profile, and
            publish directly when your work is ready.
          </p>
        </article>
      </section>

      <section className="rounded-2xl bg-ink px-7 py-10 text-white sm:px-10">
        <h2 className="font-display text-3xl font-semibold">Start with an idea.</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">
          Explore what people are publishing, or write something of your own.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/explore" className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-ink">Explore</Link>
          <Link href="/write" className="rounded-lg bg-emerald-brand px-5 py-3 text-sm font-semibold text-white">Write</Link>
        </div>
      </section>
    </div>
  );
}