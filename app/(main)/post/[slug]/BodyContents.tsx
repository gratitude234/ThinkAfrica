import type { ReactElement } from "react";

interface Heading {
  id: string;
  text: string;
  level: number;
}

/**
 * The contents list for the editorial template, which is a single centred
 * column with no sidebar to hang a rail on. A disclosure sitting above the body
 * works at every width and costs the layout nothing.
 *
 * Plain anchors, deliberately: the sidebar rail calls preventDefault() and
 * scrolls by hand, so its URL hash never updates and no section is linkable.
 * These land on a real fragment, and `scroll-margin-top` on the prose headings
 * keeps the target clear of the sticky nav.
 */
export default function BodyContents({
  headings,
}: {
  headings: Heading[];
}): ReactElement | null {
  // Two headings is a shape, not a structure. Below that the list costs more
  // attention than it saves.
  if (headings.length < 3) return null;

  return (
    <details className="group mb-8 overflow-hidden rounded-xl border border-card-border bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">Contents</span>
          <span className="mt-0.5 block text-meta leading-5 text-ink-muted">
            {headings.length} sections
          </span>
        </span>
        <svg
          className="h-5 w-5 shrink-0 text-ink-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <nav aria-label="Contents" className="border-t border-card-border px-2 py-2">
        <ol className="space-y-0.5">
          {headings.map((heading) => (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                className={`block rounded-lg px-3 py-2 text-byline leading-snug text-ink-muted transition-colors hover:bg-canvas hover:text-emerald-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                  heading.level === 3 ? "pl-7" : ""
                }`}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </details>
  );
}
