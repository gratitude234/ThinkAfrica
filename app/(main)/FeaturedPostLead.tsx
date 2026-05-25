import Link from "next/link";
import PostCover from "@/components/post/PostCover";
import {
  POST_TYPE_LABELS,
  sanitizePostExcerpt,
  type PostType,
} from "@/lib/utils";

interface FeaturedPost {
  id: string;
  title: string;
  slug: string;
  type: string;
  excerpt: string | null;
  cover_image_url: string | null;
  published_at: string | null;
  document_size_bytes?: number | null;
  profiles: {
    username: string | null;
    full_name: string | null;
    university: string | null;
    avatar_url: string | null;
    verified?: boolean;
  } | null;
}

const TYPE_STAMPS: Record<string, string> = {
  research: "R",
  essay: "E",
  policy_brief: "P",
  blog: "B",
  quick_take: "Q",
};

const TYPE_GRADIENTS: Record<string, string> = {
  research: "from-purple-900 to-purple-600",
  essay: "from-amber-900 to-amber-600",
  policy_brief: "from-blue-900 to-blue-600",
  blog: "from-emerald-900 to-emerald-600",
  quick_take: "from-emerald-900 to-emerald-600",
};

function estimateReadTime(excerpt: string | null): number {
  return Math.max(
    1,
    Math.ceil((excerpt?.trim().split(/\s+/).filter(Boolean).length ?? 0) / 200)
  );
}

function formatDocumentSize(value: number | null | undefined) {
  if (!value) return null;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function AuthorAvatar({
  name,
  src,
}: {
  name: string;
  src: string | null | undefined;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className="h-8 w-8 shrink-0 rounded-full object-cover" />;
  }

  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-800">
      {getInitials(name)}
    </span>
  );
}

function FeaturedEmptyState() {
  return (
    <section className="mb-5 rounded-xl border border-emerald-100 bg-white p-5 sm:p-7">
      <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
        Featured today
      </p>
      <h2 className="font-display mb-2 text-[21px] font-semibold leading-[1.14] text-gray-900 sm:text-[26px]">
        Be the first to publish today
      </h2>
      <p className="mb-5 max-w-xl text-sm leading-6 text-gray-500">
        There are no published posts ready for the featured slot yet. Start a
        quick take, essay, research note, or policy brief for the community.
      </p>
      <Link
        href="/write"
        className="inline-flex rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
      >
        Start writing
      </Link>
    </section>
  );
}

export default function FeaturedPostLead({
  post,
  label = "Editor's pick",
}: {
  post: FeaturedPost | null;
  label?: string;
}) {
  if (!post) return <FeaturedEmptyState />;

  const author = post.profiles;
  const authorName = author?.full_name ?? author?.username ?? "ThinkAfrica";
  const typeLabel = POST_TYPE_LABELS[post.type as PostType] ?? post.type;
  const documentSize = formatDocumentSize(post.document_size_bytes);
  const readingLabel =
    post.type === "research"
      ? documentSize
        ? `PDF / ${documentSize}`
        : "PDF manuscript"
      : `${estimateReadTime(post.excerpt)} min`;
  const excerpt = sanitizePostExcerpt(post.excerpt);
  const stamp = TYPE_STAMPS[post.type] ?? "T";
  const gradient = TYPE_GRADIENTS[post.type] ?? TYPE_GRADIENTS.blog;
  const hasCoverImage = Boolean(post.cover_image_url?.trim());
  const authorHref = author?.username ? `/${author.username}` : null;

  if (hasCoverImage) {
    return (
      <article className="group mb-5 overflow-hidden rounded-xl border border-gray-200 bg-white transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-[0_14px_32px_-6px_rgb(0_0_0/0.10)]">
        <Link href={`/post/${post.slug}`} className="relative block h-[230px] overflow-hidden sm:h-[280px]">
          <PostCover
            src={post.cover_image_url}
            alt={post.title}
            type={post.type}
            sizes="(max-width: 1024px) 100vw, 820px"
            priority
            className="h-full w-full"
            imageClassName="object-cover object-center transition-transform duration-500 ease-out group-hover:scale-[1.02]"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" aria-hidden="true" />
          <div className="absolute left-4 top-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/15 bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white backdrop-blur-md">
              {label}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold text-white/80 backdrop-blur-md">
              {typeLabel} {"\u00B7"} {readingLabel}
            </span>
          </div>
          <span className="font-display absolute bottom-3 right-4 select-none text-[64px] font-bold leading-none text-white/[0.16] sm:text-[82px]">
            {stamp}
          </span>
          <h2 className="font-display absolute bottom-5 left-5 right-5 line-clamp-2 text-[22px] font-semibold leading-[1.15] text-white sm:text-[27px]">
            {post.title}
          </h2>
        </Link>

        <div className="flex items-center gap-2.5 px-4 py-3.5 sm:px-5">
          <AuthorAvatar name={authorName} src={author?.avatar_url} />
          <div className="min-w-0 flex-1">
            {authorHref ? (
              <Link href={authorHref} className="block truncate text-[13px] font-semibold text-gray-900 hover:text-emerald-700">
                {authorName}
                {author?.verified ? (
                  <span className="ml-1.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[7px] font-bold text-white">
                    {"\u2713"}
                  </span>
                ) : null}
              </Link>
            ) : (
              <span className="block truncate text-[13px] font-semibold text-gray-900">{authorName}</span>
            )}
            {author?.university ? (
              <p className="truncate text-[11.5px] text-gray-400">{author.university}</p>
            ) : null}
          </div>
          <Link
            href={`/post/${post.slug}`}
            className="inline-flex shrink-0 items-center rounded-lg bg-emerald-brand px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-600"
          >
            Read -&gt;
          </Link>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`group relative mb-5 overflow-hidden rounded-xl bg-gradient-to-br px-5 py-5 text-white shadow-[0_4px_12px_-4px_rgb(0_0_0/0.16)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-6px_rgb(0_0_0/0.22)] sm:px-7 sm:py-6 ${gradient}`}
    >
      <span className="font-display absolute -bottom-3 right-4 select-none text-[120px] font-bold leading-none text-white/[0.08] sm:text-[150px]">
        {stamp}
      </span>
      <div className="relative z-10 max-w-2xl">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/65">
            {label}
          </span>
          <span className="text-xs text-white/35" aria-hidden="true">{"\u00B7"}</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
            {typeLabel}
          </span>
        </div>
        <Link href={`/post/${post.slug}`}>
          <h2 className="font-display text-[24px] font-semibold leading-[1.16] text-white transition-colors group-hover:text-white/90 sm:text-[28px]">
            {post.title}
          </h2>
        </Link>
        {excerpt ? (
          <p className="mt-3 line-clamp-2 text-[14px] leading-[1.65] text-white/70 sm:text-[14.5px]">
            {excerpt}
          </p>
        ) : null}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-2.5">
            <AuthorAvatar name={authorName} src={author?.avatar_url} />
            <div className="min-w-0">
              {authorHref ? (
                <Link href={authorHref} className="block truncate text-[13px] font-semibold text-white/90 hover:text-white">
                  {authorName}
                </Link>
              ) : (
                <span className="block truncate text-[13px] font-semibold text-white/90">{authorName}</span>
              )}
              {author?.university ? (
                <p className="truncate text-[11.5px] text-white/55">{author.university}</p>
              ) : null}
            </div>
          </div>
          <Link
            href={`/post/${post.slug}`}
            className="inline-flex w-full items-center justify-center rounded-lg border border-white/20 bg-white/15 px-4 py-2 text-[13px] font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/20 sm:ml-auto sm:w-auto"
          >
            Read -&gt;
          </Link>
        </div>
      </div>
    </article>
  );
}
