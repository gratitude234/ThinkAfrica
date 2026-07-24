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
import { getPostDisplayTitle, getPostMetadataTitle } from "@/lib/postDisplay";
import { sanitizePostExcerpt } from "@/lib/utils";

interface RespondingToInfo {
  title: string;
  author: string;
  slug?: string | null;
  authorUsername?: string | null;
}

interface Props {
  post: PostCardData;
  currentUserId: string | null;
  surface: "home" | "following" | "latest";
  priority?: boolean;
  respondingTo?: RespondingToInfo | null;
}

function deriveRespondingTo(responseTo: PostCardData["response_to"]): RespondingToInfo | null {
  if (!responseTo) return null;
  return {
    title: getPostMetadataTitle(responseTo, responseTo.profiles),
    author: responseTo.profiles?.full_name ?? responseTo.profiles?.username ?? "another author",
    slug: responseTo.slug,
    authorUsername: responseTo.profiles?.username ?? null,
  };
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

function AuthorLine({ post, avatarSize = 36 }: { post: PostCardData; avatarSize?: number }) {
  const profile = post.profiles;
  const name = profile?.full_name ?? profile?.username ?? "Indegenius member";
  const coauthorCount = post.co_authors?.length ?? 0;
  const byline = coauthorCount > 0 ? `${name} + ${coauthorCount}` : name;
  const avatarDimensions = { width: avatarSize, height: avatarSize };
  const avatar = profile?.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={profile.avatar_url} alt="" style={avatarDimensions} className="rounded-full object-cover" />
  ) : (
    <span style={avatarDimensions} className="flex items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-800">
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
      <div className="flex min-w-0 items-center gap-1.5 text-[12.5px] leading-[1.4]">
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
        {profile?.university ? (
          <span className="truncate text-ink-muted">· {profile.university}</span>
        ) : null}
      </div>
    </div>
  );
}

function ContextLine({
  post,
  surface,
  respondingTo,
}: Pick<Props, "post" | "surface" | "respondingTo">) {
  if (post.in_response_to) {
    const parent = respondingTo ?? deriveRespondingTo(post.response_to);
    return (
      <p className="mb-2 flex items-start gap-1.5 text-[11.5px] leading-[1.45] text-gray-500">
        <span aria-hidden="true" className="mt-px">↩</span>
        <span className="min-w-0">
          Responding to{" "}
          {parent ? (
            <>
              {parent.slug ? (
                <Link
                  href={`/post/${parent.slug}`}
                  className={`font-semibold text-gray-700 hover:text-emerald-700 hover:underline ${FOCUS_RING}`}
                >
                  {parent.title}
                </Link>
              ) : (
                <span className="font-semibold text-gray-700">{parent.title}</span>
              )}
              {parent.author ? (
                <>
                  {" by "}
                  {parent.authorUsername ? (
                    <Link href={`/${parent.authorUsername}`} className={`hover:text-emerald-700 hover:underline ${FOCUS_RING}`}>
                      {parent.author}
                    </Link>
                  ) : (
                    parent.author
                  )}
                </>
              ) : null}
            </>
          ) : (
            "another publication"
          )}
        </span>
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
  showResponses = true,
}: Pick<Props, "post" | "currentUserId"> & { showResponses?: boolean }) {
  return (
    <FeedEngagementActions
      postId={post.id}
      slug={post.slug}
      userId={currentUserId}
      initialLiked={post.viewer_liked ?? false}
      initialLikeCount={post.like_count ?? 0}
      initialBookmarked={post.viewer_bookmarked ?? false}
      responseCount={post.response_count ?? 0}
      showResponses={showResponses}
      contentKind={resolveContentKind(post)}
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

function PostFeedCard({ post, currentUserId, surface, priority, respondingTo }: Props) {
  const title = getPostDisplayTitle(post);
  const excerpt = sanitizePostExcerpt(post.excerpt) || "View post";

  return (
    <article className={CARD_SHELL}>
      <ContextLine post={post} surface={surface} respondingTo={respondingTo} />
      <AuthorLine post={post} avatarSize={32} />
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

function ArticleFeedCard({ post, currentUserId, surface, priority, respondingTo }: Props) {
  const title = getPostDisplayTitle(post) ?? "Untitled article";
  const excerpt = sanitizePostExcerpt(post.excerpt);
  const format = getArticleFormatLabel(resolveArticleFormat(post));
  const isPolicyBrief = format === "Policy Brief";

  return (
    <article className={CARD_SHELL}>
      <ContextLine post={post} surface={surface} respondingTo={respondingTo} />
      <AuthorLine post={post} avatarSize={28} />
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

function EvidenceBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
      {label}
    </span>
  );
}

function ResearchManuscriptRow({
  post,
  evidence,
}: {
  post: PostCardData;
  evidence: string | null;
}) {
  const size = documentSize(post.document_size_bytes);
  const hasDocument = Boolean(post.document_original_name || post.document_mime_type);
  if (!hasDocument) return null;

  return (
    <div className="mt-3 flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="flex h-[26px] w-[22px] shrink-0 items-center justify-center rounded-[3px] bg-purple-accent text-[7.5px] font-bold tracking-wide text-white"
      >
        PDF
      </span>
      <span className="min-w-0 truncate text-[11.5px] text-gray-500">
        PDF manuscript{size ? ` · ${size}` : ""}
      </span>
      {evidence ? <EvidenceBadge label={evidence} /> : null}
      <span className="flex-1" />
      <Link
        href={`/post/${post.slug}`}
        aria-label="View paper"
        className={`inline-flex min-h-11 shrink-0 items-center rounded-md px-1.5 text-[11.5px] font-bold text-purple-accent hover:underline ${FOCUS_RING}`}
      >
        View paper →
      </Link>
    </div>
  );
}

function ResearchFeedCard({ post, currentUserId, surface, respondingTo }: Props) {
  const title = getPostDisplayTitle(post) ?? "Untitled research paper";
  const abstract = sanitizePostExcerpt(post.excerpt);
  const evidence = post.citation_id ? "Citable" : isFormallyReviewed(post) ? "Reviewed" : null;
  const primaryAuthor = post.profiles?.full_name ?? post.profiles?.username ?? "Indegenius researcher";
  const coauthors = (post.co_authors ?? [])
    .map((author) => author.profile?.full_name ?? author.profile?.username)
    .filter(Boolean) as string[];
  const hasDocument = Boolean(post.document_original_name || post.document_mime_type);

  return (
    <article className={`${CARD_SHELL} border-purple-100`}>
      <ContextLine post={post} surface={surface} respondingTo={respondingTo} />
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-display text-[10.5px] font-bold uppercase tracking-[0.15em] text-purple-accent">Research</span>
        {evidence && !hasDocument ? (
          <span className="ml-auto">
            <EvidenceBadge label={evidence} />
          </span>
        ) : null}
      </div>
      <Link href={`/post/${post.slug}`} className={FOCUS_RING}>
        <h2 className="font-display text-[19px] font-semibold leading-[1.28] text-ink sm:text-[21px]">{title}</h2>
      </Link>
      <p className="mt-2 text-[12px] font-semibold leading-[1.45] text-gray-800">{primaryAuthor}</p>
      {post.profiles?.university ? <p className="mt-0.5 text-[11.5px] text-gray-500">{post.profiles.university}</p> : null}
      {coauthors.length > 0 ? (
        <p className="mt-0.5 text-[11.5px] leading-[1.45] text-gray-500">with {coauthors.join(", ")}</p>
      ) : null}
      {abstract ? <p className="mt-2.5 line-clamp-2 text-[13.5px] leading-[1.6] text-gray-600">{abstract}</p> : null}
      <ResearchManuscriptRow post={post} evidence={evidence} />
      <Actions post={post} currentUserId={currentUserId} showResponses={false} />
    </article>
  );
}

export default function HomeFeedCard(props: Props) {
  const kind = resolveContentKind(props.post);
  if (kind === "research") return <ResearchFeedCard {...props} />;
  if (kind === "article") return <ArticleFeedCard {...props} />;
  return <PostFeedCard {...props} />;
}
