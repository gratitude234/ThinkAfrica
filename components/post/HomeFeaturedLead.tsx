import Link from "next/link";
import PostCover from "./PostCover";
import {
  getArticleFormatLabel,
  resolveArticleFormat,
  resolveContentKind,
} from "@/lib/contentModel";
import { getPostMetadataTitle } from "@/lib/postDisplay";
import { sanitizePostExcerpt } from "@/lib/utils";

export interface HomeFeaturedPost {
  id: string;
  title: string | null;
  slug: string;
  excerpt: string | null;
  type: string;
  content_kind?: string | null;
  article_format?: string | null;
  cover_image_url?: string | null;
  profiles: {
    username: string | null;
    full_name: string | null;
    university?: string | null;
    avatar_url?: string | null;
  } | null;
}

function readTime(excerpt: string | null) {
  const words = excerpt?.trim().split(/\s+/).filter(Boolean).length ?? 0;
  return Math.max(1, Math.ceil(words / 200));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function FeaturedByline({
  profile,
  author,
}: {
  profile: HomeFeaturedPost["profiles"];
  author: string;
}) {
  const avatar = profile?.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={profile.avatar_url}
      alt=""
      className="h-8 w-8 rounded-full object-cover"
    />
  ) : (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-800">
      {initials(author)}
    </span>
  );

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {profile?.username ? (
        <Link
          href={`/${profile.username}`}
          aria-label={`View ${author}'s profile`}
          className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          {avatar}
        </Link>
      ) : (
        <span className="shrink-0">{avatar}</span>
      )}
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-semibold text-ink">{author}</p>
        {profile?.university ? (
          <p className="truncate text-[11.5px] text-gray-500">
            {profile.university}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function FeaturedMeta({ label, minutes, onCover = false }: { label: string; minutes: number; onCover?: boolean }) {
  return (
    <p
      className={`font-sans text-[10.5px] font-bold uppercase tracking-[0.16em] ${
        onCover ? "text-[#f1c86e]" : "text-gold-ink"
      }`}
    >
      Editor&apos;s pick · {label} · {minutes} min
    </p>
  );
}

export default function HomeFeaturedLead({ post }: { post: HomeFeaturedPost }) {
  const kind = resolveContentKind(post);
  const format =
    kind === "article"
      ? getArticleFormatLabel(resolveArticleFormat(post))
      : null;
  const title = getPostMetadataTitle(post, post.profiles);
  const excerpt = sanitizePostExcerpt(post.excerpt);
  const author =
    post.profiles?.full_name ??
    post.profiles?.username ??
    "Indegenius contributor";
  const label =
    kind === "research"
      ? "Research"
      : kind === "post"
        ? "Post"
        : format
          ? `Article · ${format}`
          : "Article";
  const action =
    kind === "research"
      ? "View paper"
      : kind === "post"
        ? "Read post"
        : "Read article";
  const hasCover = Boolean(post.cover_image_url?.trim());
  const minutes = readTime(excerpt);

  if (hasCover) {
    return (
      <article
        className="mb-4 overflow-hidden rounded-[18px] border border-[#e6ddca] bg-white shadow-[0_5px_18px_rgb(17_24_39/0.07)]"
        data-featured-treatment="cover"
      >
        <Link
          href={`/post/${post.slug}`}
          className="group relative block overflow-hidden bg-emerald-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold"
        >
          <PostCover
            src={post.cover_image_url}
            alt={title}
            type={post.type}
            content_kind={post.content_kind}
            article_format={post.article_format}
            sizes="(max-width: 640px) calc(100vw - 32px), 760px"
            className="aspect-[16/10] w-full sm:aspect-[2/1]"
            imageClassName="object-cover transition-transform duration-500 group-hover:scale-[1.015] motion-reduce:transition-none"
          />
          <span
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#052f23]/95 via-[#052f23]/38 via-55% to-transparent"
            aria-hidden="true"
          />
          <span className="absolute inset-x-0 bottom-0 block p-4 text-white sm:p-6">
            <FeaturedMeta label={label} minutes={minutes} onCover />
            <h2 className="mt-1.5 font-display line-clamp-3 text-[25px] font-semibold leading-[1.08] sm:text-[32px] sm:leading-[1.05]">
              {title}
            </h2>
          </span>
        </Link>

        {excerpt ? (
          <p className="px-4 pt-3 text-[14px] leading-[1.6] text-gray-700 line-clamp-2 sm:px-5 sm:text-[14.5px]">
            {excerpt}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          <FeaturedByline profile={post.profiles} author={author} />
          <Link
            href={`/post/${post.slug}`}
            className="inline-flex min-h-10 shrink-0 items-center rounded-xl bg-emerald-brand px-3.5 text-[12px] font-semibold text-white hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            {action} →
          </Link>
        </div>
      </article>
    );
  }

  return (
    <article
      className="mb-4 overflow-hidden rounded-[18px] border border-[#e6ddca] border-t-[3px] border-t-gold bg-[#fffdf8] shadow-[0_5px_18px_rgb(17_24_39/0.06)]"
      data-featured-treatment="text"
    >
      <div className="px-5 py-5 sm:px-7 sm:py-7">
        <FeaturedMeta label={label} minutes={minutes} />
        <Link
          href={`/post/${post.slug}`}
          className="mt-2 block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          <h2 className="font-display line-clamp-4 text-[25px] font-semibold leading-[1.12] text-emerald-950 sm:text-[31px] sm:leading-[1.08]">
            {title}
          </h2>
        </Link>
        {excerpt ? (
          <p className="mt-3 line-clamp-3 text-[14.5px] leading-[1.65] text-gray-700">
            {excerpt}
          </p>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-amber-100 pt-3.5">
          <FeaturedByline profile={post.profiles} author={author} />
          <Link
            href={`/post/${post.slug}`}
            className="inline-flex min-h-10 shrink-0 items-center rounded-xl bg-emerald-brand px-3.5 text-[12px] font-semibold text-white hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            {action} →
          </Link>
        </div>
      </div>
    </article>
  );
}
