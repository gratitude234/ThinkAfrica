import Link from "next/link";
import PostCover from "./PostCover";
import { getArticleFormatLabel, resolveArticleFormat, resolveContentKind } from "@/lib/contentModel";
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

export default function HomeFeaturedLead({ post }: { post: HomeFeaturedPost }) {
  const kind = resolveContentKind(post);
  const format = kind === "article" ? getArticleFormatLabel(resolveArticleFormat(post)) : null;
  const title = getPostMetadataTitle(post, post.profiles);
  const excerpt = sanitizePostExcerpt(post.excerpt);
  const author = post.profiles?.full_name ?? post.profiles?.username ?? "Indegenius contributor";
  const label = kind === "research" ? "Research" : kind === "post" ? "Post" : format ? `Article · ${format}` : "Article";
  const action = kind === "research" ? "View paper" : kind === "post" ? "Read post" : "Read article";
  const hasCover = Boolean(post.cover_image_url?.trim());

  return (
    <article className="relative mb-5 overflow-hidden rounded-[18px] bg-emerald-brand text-white shadow-[0_8px_24px_rgb(7_57_41/0.16)]">
      {hasCover ? (
        <div className="absolute inset-y-0 right-0 hidden w-[42%] sm:block" aria-hidden="true">
          <PostCover
            src={post.cover_image_url}
            alt=""
            type={post.type}
            content_kind={post.content_kind}
            article_format={post.article_format}
            sizes="280px"
            className="h-full w-full"
            imageClassName="object-cover opacity-45"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-brand via-emerald-brand/65 to-transparent" />
        </div>
      ) : null}
      <div className="relative px-4 py-4.5 sm:max-w-[74%] sm:px-7 sm:py-7">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-200 sm:text-[10.5px]">
          Editor&apos;s pick · {label} · {readTime(excerpt)} min
        </p>
        <Link href={`/post/${post.slug}`} className="mt-2 block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-brand">
          <h2 className="font-display text-[20px] font-semibold leading-[1.16] min-[390px]:text-[21px] sm:text-[28px] sm:leading-[1.12]">{title}</h2>
        </Link>
        {excerpt ? <p className="mt-2 line-clamp-2 text-[14px] leading-[1.55] text-emerald-50/95 sm:mt-2.5 sm:text-[14.5px] sm:leading-[1.6]">{excerpt}</p> : null}
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2.5 sm:mt-4 sm:gap-4">
          <div className="min-w-0 pr-1">
            <p className="truncate text-[12.5px] font-semibold">{author}</p>
            {post.profiles?.university ? <p className="mt-0.5 truncate text-[11.5px] text-emerald-100/90">{post.profiles.university}</p> : null}
          </div>
          <Link href={`/post/${post.slug}`} className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-white px-3 text-[12px] font-semibold text-emerald-950 shadow-sm hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-brand sm:px-4 sm:text-[12.5px]">
            {action} →
          </Link>
        </div>
      </div>
    </article>
  );
}
