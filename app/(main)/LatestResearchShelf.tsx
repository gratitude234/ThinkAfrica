import Link from "next/link";
import { sanitizePostExcerpt } from "@/lib/utils";

export interface LatestResearchItem {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  tags: string[] | null;
  citation_id: string | null;
  document_size_bytes: number | null;
  published_at: string | null;
  profiles: {
    username: string | null;
    full_name: string | null;
    university: string | null;
  } | null;
}

function formatDocumentSize(value: number | null | undefined) {
  if (!value) return null;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LatestResearchShelf({
  papers,
}: {
  papers: LatestResearchItem[];
}) {
  if (papers.length === 0) return null;

  return (
    <section className="mb-5 rounded-xl border border-purple-100 bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-purple-700">
            Latest research
          </p>
          <h2 className="mt-1 text-base font-semibold text-gray-900">
            New papers from the community
          </h2>
        </div>
        <Link
          href="/?type=research"
          className="shrink-0 text-xs font-semibold text-purple-700 hover:text-purple-900"
        >
          View all
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {papers.map((paper) => {
          const author = paper.profiles;
          const authorName =
            author?.full_name ?? author?.username ?? "ThinkAfrica author";
          const excerpt = sanitizePostExcerpt(paper.excerpt);
          const size = formatDocumentSize(paper.document_size_bytes);

          return (
            <article
              key={paper.id}
              className="rounded-lg border border-gray-200 bg-canvas/60 p-3 transition-colors hover:border-purple-200 hover:bg-purple-50/40"
            >
              <div className="mb-2 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-800">
                  PDF
                </span>
                {paper.citation_id ? (
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
                    Citable
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                    Reviewed
                  </span>
                )}
                {size ? (
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                    {size}
                  </span>
                ) : null}
              </div>

              <Link href={`/post/${paper.slug}`}>
                <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-gray-900 hover:text-purple-800">
                  {paper.title}
                </h3>
              </Link>

              {excerpt ? (
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-500">
                  {excerpt}
                </p>
              ) : null}

              <div className="mt-3 border-t border-gray-200/70 pt-2">
                <p className="truncate text-[11px] font-medium text-gray-700">
                  {author?.username ? (
                    <Link href={`/${author.username}`} className="hover:text-purple-800">
                      {authorName}
                    </Link>
                  ) : (
                    authorName
                  )}
                </p>
                {author?.university ? (
                  <p className="mt-0.5 truncate text-[10.5px] text-gray-500">
                    {author.university}
                  </p>
                ) : null}
              </div>

              {paper.tags && paper.tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {paper.tags.slice(0, 2).map((tag) => (
                    <Link
                      key={tag}
                      href={`/topics/${encodeURIComponent(tag)}`}
                      className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500 hover:text-purple-700"
                    >
                      {tag}
                    </Link>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
