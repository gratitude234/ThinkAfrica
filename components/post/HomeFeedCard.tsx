import Link from "next/link";
import FeedEngagementActions from "./FeedEngagementActions";
import PostCover from "./PostCover";
import type { PostCardData } from "./PostCard";
import {
  getArticleFormatLabel,
  isFormallyReviewed,
  resolveArticleFormat,
  resolveContentKind,
} from "@/lib/contentModel";
import { getPostDisplayTitle } from "@/lib/postDisplay";
import { formatRelativeTime, sanitizePostExcerpt } from "@/lib/utils";

interface Props {
  post: PostCardData;
  currentUserId: string | null;
  surface: "home" | "following" | "latest";
  priority?: boolean;
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

function readTime(excerpt: string | null) {
  const words = excerpt?.trim().split(/\s+/).filter(Boolean).length ?? 0;
  return Math.max(1, Math.ceil(words / 200));
}

function documentSize(bytes: number | null | undefined) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AuthorLine({ post }: { post: PostCardData }) {
  const profile = post.profiles;
  const name = profile?.full_name ?? profile?.username ?? "Indegenius member";
  const coauthorCount = post.co_authors?.length ?? 0;
  const byline = coauthorCount > 0 ? `${name} + ${coauthorCount}` : name;
  const date = post.published_at ?? post.created_at;

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {profile?.username ? (
        <Link href={`/${profile.username}`} className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand focus-visible:ring-offset-2">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt={name} className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-800">{initials(name)}</span>
          )}
        </Link>
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-800">{initials(name)}</span>
      )}
      <div className="min-w-0 text-[12px] leading-[1.35]">
        <div className="flex min-w-0 items-center gap-1.5">
          {profile?.username ? (
            <Link href={`/${profile.username}`} className="truncate font-semibold text-ink hover:text-emerald-700">{byline}</Link>
          ) : (
            <span className="truncate font-semibold text-ink">{byline}</span>
          )}
          {profile?.verified ? <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-brand text-[7px] font-bold text-white" title="Verified">✓</span> : null}
        </div>
        <p className="truncate text-ink-muted">
          {profile?.university ? `${profile.university} · ` : ""}
          {formatRelativeTime(date)}
        </p>
      </div>
    </div>
  );
}

function ContextLine({ post, surface }: Pick<Props, "post" | "surface">) {
  if (surface === "home" && post.surface_reason) {
    return <p className="mb-2 text-[11.5px] text-gray-500">{post.surface_reason}</p>;
  }
  if (post.in_response_to) {
    return <p className="mb-2 text-[11.5px] text-gray-500">Response</p>;
  }
  return null;
}

function Actions({ post, currentUserId }: Pick<Props, "post" | "currentUserId">) {
  return (
    <FeedEngagementActions
      postId={post.id}
      slug={post.slug}
      userId={currentUserId}
      initialLiked={post.viewer_liked ?? false}
      initialLikeCount={post.like_count ?? 0}
      initialBookmarked={post.viewer_bookmarked ?? false}
      commentCount={post.comment_count ?? 0}
    />
  );
}

function PostFeedCard({ post, currentUserId, surface, priority }: Props) {
  const title = getPostDisplayTitle(post);
  const excerpt = sanitizePostExcerpt(post.excerpt) || "View post";
  const hasCover = Boolean(post.cover_image_url?.trim());

  return (
    <article className="-mx-4 mb-2 border-y border-gray-200 bg-white px-4 py-4 sm:mx-0 sm:mb-3 sm:rounded-xl sm:border sm:px-5">
      <ContextLine post={post} surface={surface} />
      <AuthorLine post={post} />
      <div className="mt-3">
        {title ? (
          <Link href={`/post/${post.slug}`} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand">
            <h2 className="font-display text-[18px] font-semibold leading-[1.28] text-ink">{title}</h2>
          </Link>
        ) : null}
        <Link href={`/post/${post.slug}`} className="mt-1.5 block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand">
          <p className={`${title ? "line-clamp-3 text-[14px] text-gray-600" : "line-clamp-5 text-[16px] text-gray-800"} whitespace-pre-line leading-[1.55]`}>{excerpt}</p>
        </Link>
      </div>
      {hasCover ? (
        <Link href={`/post/${post.slug}`} className="mt-3 block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand focus-visible:ring-offset-2">
          <PostCover
            src={post.cover_image_url}
            alt={title ?? excerpt}
            type={post.type}
            content_kind={post.content_kind}
            article_format={post.article_format}
            sizes="(max-width: 640px) 100vw, 680px"
            priority={priority}
            className="aspect-[16/9] w-full rounded-xl bg-gray-100"
            imageClassName="object-cover"
          />
        </Link>
      ) : null}
      <Actions post={post} currentUserId={currentUserId} />
    </article>
  );
}

function ArticleFeedCard({ post, currentUserId, surface, priority }: Props) {
  const title = getPostDisplayTitle(post) ?? "Untitled article";
  const excerpt = sanitizePostExcerpt(post.excerpt);
  const format = getArticleFormatLabel(resolveArticleFormat(post));
  const hasCover = Boolean(post.cover_image_url?.trim());

  return (
    <article className="-mx-4 mb-2 border-y border-gray-200 bg-white px-4 py-4 sm:mx-0 sm:mb-3 sm:rounded-xl sm:border sm:px-5 sm:py-5">
      <ContextLine post={post} surface={surface} />
      <AuthorLine post={post} />
      <div className="mt-3 flex min-w-0 gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-emerald-700">
            Article{format ? ` · ${format}` : ""} <span className="font-medium text-gray-400">· {readTime(excerpt)} min read</span>
          </p>
          <Link href={`/post/${post.slug}`} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand">
            <h2 className="font-display line-clamp-3 text-[20px] font-semibold leading-[1.18] text-ink sm:text-[22px]">{title}</h2>
          </Link>
          {excerpt ? <p className="mt-2 line-clamp-2 text-[13.5px] leading-[1.55] text-gray-600">{excerpt}</p> : null}
        </div>
        {hasCover ? (
          <Link href={`/post/${post.slug}`} className="shrink-0 self-start rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand focus-visible:ring-offset-2">
            <PostCover
              src={post.cover_image_url}
              alt={title}
              type={post.type}
              content_kind={post.content_kind}
              article_format={post.article_format}
              sizes="112px"
              priority={priority}
              className="h-[88px] w-[88px] rounded-lg bg-gray-100 sm:h-28 sm:w-28"
              imageClassName="object-cover"
            />
          </Link>
        ) : null}
      </div>
      <Actions post={post} currentUserId={currentUserId} />
    </article>
  );
}

function ResearchFeedCard({ post, currentUserId, surface }: Props) {
  const title = getPostDisplayTitle(post) ?? "Untitled research paper";
  const abstract = sanitizePostExcerpt(post.excerpt);
  const size = documentSize(post.document_size_bytes);
  const reviewed = isFormallyReviewed(post);
  const evidence = post.citation_id ? "Citable" : reviewed ? "Reviewed" : null;

  return (
    <article className="-mx-4 mb-2 border-y border-purple-100 bg-[#fdfcff] px-4 py-4 sm:mx-0 sm:mb-3 sm:rounded-xl sm:border sm:px-5 sm:py-5">
      <ContextLine post={post} surface={surface} />
      <AuthorLine post={post} />
      <div className="mt-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.15em] text-purple-700">Research</span>
          {evidence ? <span className="rounded-full border border-purple-200 bg-white px-2.5 py-1 text-[10.5px] font-semibold text-purple-700">{evidence}</span> : null}
        </div>
        <Link href={`/post/${post.slug}`} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500">
          <h2 className="font-display line-clamp-3 text-[20px] font-semibold leading-[1.2] text-ink sm:text-[22px]">{title}</h2>
        </Link>
        {abstract ? <p className="mt-2 line-clamp-2 text-[13.5px] leading-[1.6] text-gray-600">{abstract}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2.5 text-[11.5px] text-gray-500">
          <span>PDF manuscript{size ? ` · ${size}` : ""}</span>
          <Link href={`/post/${post.slug}`} className="inline-flex min-h-11 items-center rounded-lg border border-purple-200 bg-white px-3.5 py-2 font-semibold text-purple-700 hover:bg-purple-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2">View paper</Link>
        </div>
      </div>
      <Actions post={post} currentUserId={currentUserId} />
    </article>
  );
}

export default function HomeFeedCard(props: Props) {
  const kind = resolveContentKind(props.post);
  if (kind === "research") return <ResearchFeedCard {...props} />;
  if (kind === "article") return <ArticleFeedCard {...props} />;
  return <PostFeedCard {...props} />;
}
