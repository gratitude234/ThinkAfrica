import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Badge from "@/components/ui/Badge";
import type { PostReferenceRecord, VersionAuthorRecord } from "@/lib/types";
import { sanitizePostHtml } from "@/lib/sanitizePostHtml";
import CiteThis from "../../post/[slug]/CiteThis";

interface PageProps {
  params: Promise<{ citationId: string }>;
}

function formatReference(reference: {
  authors: string | null;
  year: number | null;
  title: string;
  source: string | null;
  url: string | null;
  doi: string | null;
}) {
  return [
    reference.authors,
    reference.year ? `(${reference.year}).` : null,
    reference.title,
    reference.source,
    reference.doi ? `DOI: ${reference.doi}` : null,
    reference.url,
  ]
    .filter(Boolean)
    .join(" ");
}

function formatDocumentSize(value: number | null | undefined) {
  if (!value) return null;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function PublicationArchivePage({ params }: PageProps) {
  const { citationId } = await params;
  const supabase = await createClient();

  const { data: post } = await supabase
    .from("posts")
    .select(
      "id, slug, title, type, published_at, citation_id, published_version_id, profiles!posts_author_id_fkey(full_name, username, university)"
    )
    .eq("citation_id", citationId)
    .eq("status", "published")
    .single();

  if (!post || !post.published_version_id) {
    notFound();
  }

  const { data: version } = await supabase
    .from("post_versions")
    .select("id, title, excerpt, content, version_number, round, created_at, references, authors, document_path, document_original_name, document_mime_type, document_size_bytes")
    .eq("id", post.published_version_id)
    .single();

  if (!version) {
    notFound();
  }

  const leadAuthor = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;
  const archivedAuthors = (Array.isArray(version.authors) ? version.authors : []) as VersionAuthorRecord[];
  const references = (Array.isArray(version.references)
    ? version.references
    : []) as PostReferenceRecord[];
  const sanitizedContent = sanitizePostHtml(version.content);
  const archivedDocument = {
    path: (version as { document_path?: string | null }).document_path ?? null,
    originalName:
      (version as { document_original_name?: string | null })
        .document_original_name ?? null,
    sizeBytes:
      (version as { document_size_bytes?: number | null }).document_size_bytes ??
      null,
  };
  const citationAuthors =
    archivedAuthors.length > 0
      ? archivedAuthors.map((author) => ({
          full_name: author.profile?.full_name ?? null,
          username: author.profile?.username ?? "author",
        }))
      : [leadAuthor]
          .filter(Boolean)
          .map((author) => ({
            full_name: author.full_name ?? null,
            username: author.username ?? "author",
          }));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
          Archived publication
        </p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">{version.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-sky-900">
          <Badge type={post.type} />
          <span>Citation ID: {post.citation_id}</span>
          <span>·</span>
          <span>
            Published{" "}
            {new Date(post.published_at ?? version.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
          <span>·</span>
          <span>Version {version.version_number}</span>
        </div>
        <p className="mt-3 text-sm text-sky-900">
          This archived page preserves the accepted publication snapshot for citation purposes.
        </p>
        <Link href={`/post/${post.slug}`} className="mt-3 inline-block text-sm font-medium text-sky-800 underline">
          Open the live post page
        </Link>
      </div>

      {archivedAuthors.length > 0 ? (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">Authors</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {archivedAuthors.map((author) => (
              <span
                key={author.user_id}
                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700"
              >
                {author.profile?.full_name ?? author.profile?.username ?? "Author"}
                {author.corresponding_author ? " · Corresponding" : ""}
              </span>
            ))}
          </div>
        </section>
      ) : leadAuthor ? (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">Author</h2>
          <p className="mt-3 text-sm text-gray-700">
            {leadAuthor.full_name ?? leadAuthor.username}
            {leadAuthor.university ? ` · ${leadAuthor.university}` : ""}
          </p>
        </section>
      ) : null}

      {version.excerpt ? (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">Abstract / Summary</h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">{version.excerpt}</p>
        </section>
      ) : null}

      {post.type === "research" && archivedDocument.path ? (
        <section className="rounded-xl border border-purple-100 bg-purple-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">
            Archived research PDF
          </p>
          <h2 className="mt-2 text-lg font-semibold text-gray-900">
            {archivedDocument.originalName ?? "Research paper PDF"}
          </h2>
          <p className="mt-1 text-sm text-purple-950/75">
            Accepted document snapshot
            {formatDocumentSize(archivedDocument.sizeBytes)
              ? ` / ${formatDocumentSize(archivedDocument.sizeBytes)}`
              : ""}
          </p>
          <a
            href={`/api/research-document/${post.id}`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex rounded-lg bg-purple-700 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-800"
          >
            View / download paper
          </a>
        </section>
      ) : (
        <article className="rounded-xl border border-gray-200 bg-white p-6">
          <div
            className="prose prose-gray max-w-none prose-a:text-emerald-brand"
            dangerouslySetInnerHTML={{ __html: sanitizedContent }}
          />
        </article>
      )}

      {references.length > 0 ? (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">References</h2>
          <ol className="mt-4 space-y-3 text-sm leading-relaxed text-gray-600">
            {references.map((reference, index) => (
              <li key={reference.id ?? `${reference.title}-${index}`} className="pl-8 -indent-8">
                [{index + 1}]{" "}
                {formatReference({
                  authors: reference.authors ?? null,
                  year: reference.year ?? null,
                  title: reference.title,
                  source: reference.source ?? null,
                  url: reference.url ?? null,
                  doi: reference.doi ?? null,
                })}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {post.citation_id ? (
        <CiteThis
          citationId={post.citation_id}
          citationPath={`/publication/${post.citation_id}`}
          title={version.title}
          publishedAt={post.published_at ?? version.created_at}
          authors={citationAuthors}
        />
      ) : null}
    </div>
  );
}
