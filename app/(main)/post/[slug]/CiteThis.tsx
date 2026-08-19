"use client";

import { useMemo, useState } from "react";

interface Author {
  full_name: string | null;
  username: string;
}

function getNameParts(name: string) {
  const pieces = name.trim().split(/\s+/);
  return {
    first: pieces[0] ?? name,
    last: pieces[pieces.length - 1] ?? name,
  };
}

function formatApaAuthor(name: string) {
  const { first, last } = getNameParts(name);
  return `${last}, ${first.charAt(0)}.`;
}

function formatMlaAuthor(name: string) {
  const { first, last } = getNameParts(name);
  return `${last}, ${first}`;
}

function formatAuthors(authors: Author[]) {
  return authors
    .map((author) => author.full_name ?? author.username)
    .join(", ");
}

export default function CiteThis({
  citationId,
  citationPath,
  title,
  publishedAt,
  authors,
}: {
  citationId: string;
  citationPath: string;
  title: string;
  publishedAt: string;
  authors: Author[];
}) {
  const [activeTab, setActiveTab] = useState<"apa" | "bibtex" | "mla">("apa");
  const [copiedTab, setCopiedTab] = useState<"apa" | "bibtex" | "mla" | null>(null);

  const formatted = useMemo(() => {
    const date = new Date(publishedAt);
    const year = date.getFullYear();
    // thinkafrica.africa must permanently 301-redirect to indegenius.africa at
    // the Cloudflare level, so any existing external link to the old
    // citation URL (thinkafrica.com/...) still resolves.
    const url = `https://indegenius.africa${citationPath}`;
    const fullNames = authors.map((author) => author.full_name ?? author.username);
    const apaAuthors = authors
      .map((author) => formatApaAuthor(author.full_name ?? author.username))
      .join(", ");
    const mlaLead = formatMlaAuthor(fullNames[0] ?? "Indegenius");

    return {
      apa: `${apaAuthors} (${year}). ${title}. Indegenius. ${url} (${citationId})`,
      bibtex: `@article{${citationId},
  author    = {${formatAuthors(authors)}},
  title     = {${title}},
  journal   = {Indegenius},
  year      = {${year}},
  url       = {${url}},
  note      = {${citationId}}
}`,
      mla: `${mlaLead}. "${title}." Indegenius, ${date.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}, indegenius.africa${citationPath}.`,
    };
  }, [authors, citationId, citationPath, publishedAt, title]);

  const tabs: Array<{ id: "apa" | "bibtex" | "mla"; label: string }> = [
    { id: "apa", label: "APA" },
    { id: "bibtex", label: "BibTeX" },
    { id: "mla", label: "MLA" },
  ];

  return (
    <div className="min-w-0 rounded-lg border border-card-border bg-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-kicker font-bold uppercase text-ink-muted">
            Cite this essay
          </p>
          <h2 className="mt-1 text-base font-semibold text-ink">Publication citation</h2>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-kicker font-semibold text-emerald-ink">
          Archived
        </span>
      </div>
      <p className="-mt-2 mb-4 text-sm text-ink-muted">
        Use the archived citation metadata for this publication.
      </p>

      <div className="mb-3 flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-emerald-700 text-white"
                : "bg-canvas text-ink-soft hover:bg-emerald-50 hover:text-emerald-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-w-0 rounded-lg border border-divider bg-canvas p-4">
        <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft [overflow-wrap:anywhere]">
          {formatted[activeTab]}
        </pre>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(formatted[activeTab]);
            setCopiedTab(activeTab);
            setTimeout(() => setCopiedTab(null), 1200);
          }}
          className="mt-3 rounded-lg border border-emerald-200 bg-surface px-3 py-1.5 text-sm font-medium text-emerald-ink transition-colors hover:bg-emerald-50"
        >
          {copiedTab === activeTab ? "Copied" : "Copy citation"}
        </button>
      </div>

      <p className="mt-3 text-xs italic text-ink-muted">
        This citation URL resolves to the archived published version attached to
        this citation ID.
      </p>
    </div>
  );
}
