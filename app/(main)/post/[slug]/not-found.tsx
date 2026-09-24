import Link from "next/link";

export default function PublicationNotFound() {
  return (
    <main className="publication-detail mx-auto flex min-h-[58vh] max-w-[620px] items-center justify-center py-16 text-center sm:py-24">
      <div>
        <p className="font-public-sans text-[11.5px] font-semibold uppercase tracking-[0.09em] text-[#8A6C26]">
          Publication unavailable
        </p>
        <h1 className="publication-article-title mt-3 text-[34px] font-semibold leading-tight text-ink sm:text-[42px]">
          This publication can’t be opened.
        </h1>
        <p className="mx-auto mt-4 max-w-[480px] font-public-sans text-[14px] leading-6 text-ink-muted">
          It may have been unpublished, moved, or the link may no longer be valid.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex min-h-10 items-center rounded-lg bg-emerald-brand px-4 font-public-sans text-[13px] font-semibold text-white transition-colors hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          Return home
        </Link>
      </div>
    </main>
  );
}
