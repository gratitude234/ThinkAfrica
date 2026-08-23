import Link from "next/link";
import PostCover from "./PostCover";
import { getArticleFormatLabel, resolveArticleFormat, resolveContentKind } from "@/lib/contentModel";
import { getPostMetadataTitle } from "@/lib/postDisplay";
import { sanitizePostExcerpt } from "@/lib/utils";
import type { FeedExposure } from "@/lib/feedExposure";
import { FEATURE_FLAGS } from "@/lib/featureFlags";

export interface HomeFeaturedPost {
  id: string;
  title: string | null;
  slug: string;
  excerpt: string | null;
  type: string;
  content_kind?: string | null;
  article_format?: string | null;
  cover_image_url?: string | null;
  /** Words in the post body, maintained by a database trigger. */
  word_count?: number | null;
  featured_provenance?: "editorial" | "recommended" | "latest";
  feed_exposure?: FeedExposure;
  profiles: {
    username: string | null;
    full_name: string | null;
    university?: string | null;
    avatar_url?: string | null;
  } | null;
}

// Counted the excerpt, which is capped at roughly thirty words, so this always
// returned 1. Null when there is no stored body count rather than a floor of
// 1: the kicker drops the segment instead of printing a number it cannot know.
function readTime(wordCount: number | null | undefined) {
  if (!wordCount || wordCount <= 0) return null;
  return Math.max(1, Math.ceil(wordCount / 200));
}

export default function HomeFeaturedLead({ post }: { post: HomeFeaturedPost }) {
  const kind = resolveContentKind(post);
  if (!FEATURE_FLAGS.research && kind === "research") return null;
  const format = kind === "article" ? getArticleFormatLabel(resolveArticleFormat(post)) : null;
  const title = getPostMetadataTitle(post, post.profiles);
  const excerpt = sanitizePostExcerpt(post.excerpt);
  const author = post.profiles?.full_name ?? post.profiles?.username ?? "Indegenius contributor";
  const label = kind === "research" ? "Research" : kind === "post" ? "Post" : format ? `Article · ${format}` : "Article";
  const action = kind === "research" ? "View paper" : kind === "post" ? "Read post" : "Read article";
  const hasCover = Boolean(post.cover_image_url?.trim());
  const provenanceLabel =
    post.featured_provenance === "editorial"
      ? "Editor’s pick"
      : post.featured_provenance === "latest"
        ? "Latest publication"
        : "Recommended for you";
  const readingMinutes = readTime(post.word_count);

  return (
    // Kept boxed, rounded and shadowed while the feed rows below it are none
    // of those. That is the point: with the card chrome gone from the feed,
    // an edge is a scarce signal, and the one promoted lead is worth spending
    // it on. Margin matches the interludes' `my-5 sm:my-6` so the
    // page has a single rhythm for "this is not an ordinary row".
    <article className="relative mb-5 overflow-hidden rounded-[18px] bg-emerald-brand text-white shadow-[0_9px_26px_rgb(7_57_41/0.18)] sm:mb-6">
      {/* Phones get the cover as a short letterbox strip above the text; from
          `sm` up it moves to the bleed panel on the right. Previously it was
          `hidden sm:block` outright, so the single most prominent card in the
          feed opened on mobile as an unbroken slab of dark green -- the
          heaviest possible first impression on the smallest screen. */}
      {hasCover ? (
        <div className="relative block aspect-[21/9] w-full sm:hidden" aria-hidden="true">
          <PostCover
            src={post.cover_image_url}
            alt=""
            type={post.type}
            content_kind={post.content_kind}
            article_format={post.article_format}
            sizes="100vw"
            priority
            className="h-full w-full"
            imageClassName="object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-emerald-brand via-emerald-brand/45 to-transparent" />
        </div>
      ) : null}
      {hasCover ? (
        <div className="absolute inset-y-0 right-0 hidden w-[42%] sm:block" aria-hidden="true">
          <PostCover
            src={post.cover_image_url}
            alt=""
            type={post.type}
            content_kind={post.content_kind}
            article_format={post.article_format}
            sizes="280px"
            priority
            className="h-full w-full"
            imageClassName="object-cover opacity-45"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-brand via-emerald-brand/65 to-transparent" />
        </div>
      ) : null}
      {/* `px-4.5` was here and compiled to nothing -- Tailwind's spacing scale
          has no 4.5 step and the config adds none -- so on every phone the
          kicker, headline, excerpt and byline sat flush against the rounded
          edge. `sm:px-7` masked it from 640px up. */}
      <div className={`relative px-5 py-5 sm:max-w-[74%] sm:px-7 sm:py-7 ${hasCover ? "-mt-6 sm:mt-0" : ""}`}>
        <p className="font-display text-kicker font-bold uppercase text-emerald-200">
          {provenanceLabel} · {label}
          {readingMinutes ? ` · ${readingMinutes} min` : ""}
        </p>
        <Link href={`/post/${post.slug}`} className="mt-2 block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-brand">
          <h2 className="font-display text-headline font-semibold">{title}</h2>
        </Link>
        {excerpt ? <p className="mt-2.5 line-clamp-2 max-w-measure text-excerpt text-emerald-50/90">{excerpt}</p> : null}
        <div className="mt-3.5 flex items-center justify-between gap-3 sm:mt-4 sm:gap-4">
          <div className="min-w-0">
            <p className="truncate text-meta font-semibold">{author}</p>
            {post.profiles?.university ? <p className="truncate text-meta text-emerald-100/80">{post.profiles.university}</p> : null}
          </div>
          <Link href={`/post/${post.slug}`} className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-white px-4 text-meta font-semibold text-emerald-950 shadow-sm hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-brand">
            {action} →
          </Link>
        </div>
      </div>
    </article>
  );
}
