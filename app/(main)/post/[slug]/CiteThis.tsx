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
    const url = `https://thinkafrica.com${citationPath}`;
    const fullNames = authors.map((author) => author.full_name ?? author.username);
    const apaAuthors = authors
      .map((author) => formatApaAuthor(author.full_name ?? author.username))
      .join(", ");
    const mlaLead = formatMlaAuthor(fullNames[0] ?? "ThinkAfrica");

    return {
      apa: `${apaAuthors} (${year}). ${title}. ThinkAfrica. ${url} (${citationId})`,
      bibtex: `@article{${citationId},
  author    = {${formatAuthors(authors)}},
  title     = {${title}},
  journal   = {ThinkAfrica},
  year      = {${year}},
  url       = {${url}},
  note      = {${citationId}}
}`,
      mla: `${mlaLead}. "${title}." ThinkAfrica, ${date.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}, thinkafrica.com${citationPath}.`,
    };
  }, [authors, citationId, citationPath, publishedAt, title]);

  const tabs: Array<{ id: "apa" | "bibtex" | "mla"; label: string }> = [
    { id: "apa", label: "APA" },
    { id: "bibtex", label: "BibTeX" },
    { id: "mla", label: "MLA" },
  ];

  return (
    <div className="rounded-2xl border border-purple-200 bg-purple-50/40 p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Cite This</h2>
        <p className="mt-1 text-sm text-gray-500">
          Use the archived citation metadata for this publication.
        </p>
      </div>

      <div className="mb-3 flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-purple-600 text-white"
                : "bg-white text-purple-700 hover:bg-purple-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-purple-100 bg-white p-4">
        <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
          {formatted[activeTab]}
        </pre>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(formatted[activeTab]);
            setCopiedTab(activeTab);
            setTimeout(() => setCopiedTab(null), 1200);
          }}
          className="mt-3 rounded-lg border border-purple-200 px-3 py-1.5 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-50"
        >
          {copiedTab === activeTab ? "✓ Copied" : "Copy"}
        </button>
      </div>

      <p className="mt-3 text-xs italic text-gray-500">
        This citation URL resolves to the archived published version attached to
        this citation ID.
      </p>
    </div>
  );
}
