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

const CARD_SHELL =
  "mb-3 overflow-hidden rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-[0_1px_2px_rgb(17_24_39/0.025)] sm:px-[18px] sm:py-[18px]";
const FOCUS_RING =
  "rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2";

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
  const avatar = profile?.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={profile.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
  ) : (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-800">
      {initials(name)}
    </span>
  );

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {profile?.username ? (
        <Link href={`/${profile.username}`} aria-label={`View ${name}'s profile`} className={`shrink-0 rounded-full ${FOCUS_RING}`}>
          {avatar}
        </Link>
      ) : (
        <span className="shrink-0">{avatar}</span>
      )}
      <div className="min-w-0 text-[12px] leading-[1.4]">
        <div className="flex min-w-0 items-center gap-1.5">
          {profile?.username ? (
            <Link href={`/${profile.username}`} className={`truncate font-semibold text-ink hover:text-emerald-700 ${FOCUS_RING}`}>
              {byline}
            </Link>
          ) : (
            <span className="truncate font-semibold text-ink">{byline}</span>
          )}
          {profile?.verified ? (
            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-brand text-[7px] font-bold text-white" title="Verified">
              ✓
            </span>
          ) : null}
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
  if (post.in_response_to) {
    return (
      <p className="mb-2 flex items-center gap-1.5 text-[11.5px] text-gray-500">
        <span aria-hidden="true">↩</span>
        Responding to another publication
      </p>
    );
  }
  if (surface === "home" && post.surface_reason) {
    return <p className="mb-2 text-[11.5px] text-gray-500">{post.surface_reason}</p>;
  }
  return null;
}

function Actions({
  post,
  currentUserId,
  showComments = true,
}: Pick<Props, "post" | "currentUserId"> & { showComments?: boolean }) {
  return (
    <FeedEngagementActions
      postId={post.id}
      slug={post.slug}
      userId={currentUserId}
      initialLiked={post.viewer_liked ?? false}
      initialLikeCount={post.like_count ?? 0}
      initialBookmarked={post.viewer_bookmarked ?? false}
      commentCount={post.comment_count ?? 0}
      showComments={showComments}
    />
  );
}

function FullWidthCover({ post, title, priority }: { post: PostCardData; title: string; priority?: boolean }) {
  if (!post.cover_image_url?.trim()) return null;
  return (
    <Link href={`/post/${post.slug}`} className={`mt-3 block rounded-[10px] ${FOCUS_RING}`}>
      <PostCover
        src={post.cover_image_url}
        alt={title}
        type={post.type}
        content_kind={post.content_kind}
        article_format={post.article_format}
        sizes="(max-width: 640px) calc(100vw - 56px), 680px"
        priority={priority}
        className="aspect-[16/9] w-full rounded-[10px] bg-gray-100"
        imageClassName="object-cover"
      />
    </Link>
  );
}

function PostFeedCard({ post, currentUserId, surface, priority }: Props) {
  const title = getPostDisplayTitle(post);
  const excerpt = sanitizePostExcerpt(post.excerpt) || "View post";

  return (
    <article className={CARD_SHELL}>
      <ContextLine post={post} surface={surface} />
      <AuthorLine post={post} />
      <div className="mt-3">
        {title ? (
          <Link href={`/post/${post.slug}`} className={FOCUS_RING}>
            <h2 className="font-display text-[18px] font-semibold leading-[1.28] text-ink">{title}</h2>
          </Link>
        ) : null}
        <Link href={`/post/${post.slug}`} className={`mt-1.5 block ${FOCUS_RING}`}>
          <p className={`${title ? "line-clamp-3 text-[15px] text-gray-600" : "line-clamp-5 text-[16px] text-gray-800"} whitespace-pre-line leading-[1.62]`}>
            {excerpt}
          </p>
        </Link>
      </div>
      <FullWidthCover post={post} title={title ?? excerpt} priority={priority} />
      <Actions post={post} currentUserId={currentUserId} />
    </article>
  );
}

function ArticleFeedCard({ post, currentUserId, surface, priority }: Props) {
  const title = getPostDisplayTitle(post) ?? "Untitled article";
  const excerpt = sanitizePostExcerpt(post.excerpt);
  const format = getArticleFormatLabel(resolveArticleFormat(post));
  const isPolicyBrief = format === "Policy Brief";

  return (
    <article className={CARD_SHELL}>
      <ContextLine post={post} surface={surface} />
      <AuthorLine post={post} />
      <div className="mt-3 min-w-0">
        <p className={`mb-1.5 font-display text-[10.5px] font-bold uppercase tracking-[0.14em] ${isPolicyBrief ? "text-purple-accent" : "text-gold-ink"}`}>
          Article{format ? ` · ${format}` : ""}{" "}
          <span className="font-sans font-medium normal-case tracking-normal text-gray-400">· {readTime(excerpt)} min read</span>
        </p>
        <Link href={`/post/${post.slug}`} className={FOCUS_RING}>
          <h2 className="font-display line-clamp-3 text-[19px] font-semibold leading-[1.2] text-ink sm:text-[21px]">{title}</h2>
        </Link>
        {excerpt ? <p className="mt-2 line-clamp-2 text-[13.5px] leading-[1.58] text-gray-600">{excerpt}</p> : null}
      </div>
      <FullWidthCover post={post} title={title} priority={priority} />
      <Actions post={post} currentUserId={currentUserId} />
    </article>
  );
}

function ResearchFeedCard({ post, currentUserId, surface }: Props) {
  const title = getPostDisplayTitle(post) ?? "Untitled research paper";
  const abstract = sanitizePostExcerpt(post.excerpt);
  const size = documentSize(post.document_size_bytes);
  const evidence = post.citation_id ? "Citable" : isFormallyReviewed(post) ? "Reviewed" : null;
  const primaryAuthor = post.profiles?.full_name ?? post.profiles?.username ?? "Indegenius researcher";
  const coauthors = (post.co_authors ?? [])
    .map((author) => author.profile?.full_name ?? author.profile?.username)
    .filter(Boolean) as string[];
  const authors = [primaryAuthor, ...coauthors].join(", ");

  return (
    <article className={`${CARD_SHELL} border-purple-100`}>
      <ContextLine post={post} surface={surface} />
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-display text-[10.5px] font-bold uppercase tracking-[0.15em] text-purple-accent">Research</span>
        {evidence ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{evidence}</span> : null}
      </div>
      <Link href={`/post/${post.slug}`} className={FOCUS_RING}>
        <h2 className="font-display line-clamp-3 text-[19px] font-semibold leading-[1.2] text-ink sm:text-[21px]">{title}</h2>
      </Link>
      <p className="mt-2 text-[12px] font-medium leading-[1.45] text-gray-700">{authors}</p>
      {post.profiles?.university ? <p className="mt-0.5 text-[11.5px] text-gray-500">{post.profiles.university}</p> : null}
      {abstract ? <p className="mt-2.5 line-clamp-2 text-[13.5px] leading-[1.6] text-gray-600">{abstract}</p> : null}
      <div className="mt-3 flex items-center gap-3 rounded-lg border border-purple-100 bg-purple-tint/35 p-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-purple-accent shadow-sm" aria-hidden="true">
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 3.75h7l3 3V20.25H7V3.75Zm7 0v3h3M9.5 12h5M9.5 15h5" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11.5px] font-semibold text-gray-700">{post.document_original_name || "PDF manuscript"}</p>
          <p className="text-[10.5px] text-gray-500">PDF{size ? ` · ${size}` : ""}</p>
        </div>
        <Link href={`/post/${post.slug}`} aria-label="View paper" className={`inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-[11.5px] font-semibold text-purple-accent hover:bg-white ${FOCUS_RING}`}>
          View paper →
        </Link>
      </div>
      <Actions post={post} currentUserId={currentUserId} showComments={false} />
    </article>
  );
}

export default function HomeFeedCard(props: Props) {
  const kind = resolveContentKind(props.post);
  if (kind === "research") return <ResearchFeedCard {...props} />;
  if (kind === "article") return <ArticleFeedCard {...props} />;
  return <PostFeedCard {...props} />;
}
