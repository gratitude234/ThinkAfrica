import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/ui/Footer";
import { BRAND_SEO_DESCRIPTION } from "@/lib/brand";
import LandingNav from "./LandingNav";

export const metadata: Metadata = {
  title: { absolute: "Indegenius | Read. Write. Follow. Discover." },
  description: BRAND_SEO_DESCRIPTION,
};

const FEATURES = [
  ["Read", "Find Posts and Articles from writers across Africa and beyond."],
  ["Write", "Publish a short Post or a long-form Article."],
  ["Follow", "Keep up with writers whose work matters to you."],
  ["Discover", "Browse topics, search publications, and meet new writers."],
] as const;

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <LandingNav />
      <main>
        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-brand">
            Publishing, kept simple
          </p>
          <h1 className="font-display mt-5 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-tight sm:text-7xl">
            Read. Write. Follow. Discover.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-ink-muted">
            Indegenius is a place to publish ideas, read thoughtful work, and
            follow the writers and topics you care about.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-xl bg-emerald-brand px-6 py-3 text-sm font-semibold text-white hover:bg-[#0E4B37]">
              Start writing
            </Link>
            <Link href="/explore" className="rounded-xl border border-card-border bg-white px-6 py-3 text-sm font-semibold text-ink hover:border-gray-300">
              Explore publications
            </Link>
          </div>
        </section>

        <section className="border-y border-card-border bg-white">
          <div className="mx-auto grid max-w-6xl gap-px bg-card-border sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(([title, description]) => (
              <article key={title} className="bg-white p-7">
                <h2 className="font-display text-2xl font-semibold">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-ink-muted">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-5 py-20 text-center sm:px-8">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">
            Your writing belongs together.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-ink-muted">
            Your profile shows your Posts and Articles. Drafts stay private until
            you choose to publish.
          </p>
          <Link href="/write" className="mt-8 inline-flex rounded-xl bg-ink px-6 py-3 text-sm font-semibold text-white">
            Write on Indegenius
          </Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}