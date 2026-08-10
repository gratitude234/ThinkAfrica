import Link from "next/link";
import FeedEngagementActions from "./FeedEngagementActions";
import PostImage from "./PostImage";
import type { PostCardData } from "./PostCard";
import {
  getArticleFormatLabel,
  isFormallyReviewed,
  resolveArticleFormat,
  resolveContentKind,
} from "@/lib/contentModel";
import { getPostDisplayTitle, getPostMetadataTitle } from "@/lib/postDisplay";
import { formatRelativeTime, sanitizePostExcerpt } from "@/lib/utils";

interface RespondingToInfo {
  title: string;
  author: string;
  slug?: string | null;
  authorUsername?: string | null;
  /**
   * Whether `title` is the parent's own title rather than the derived
   * "Post by {author}" stand-in. Only a real title takes a trailing " by
   * {author}" clause -- the stand-in already names the author, and appending it
   * again reads "Responding to Post by Ada Obi by Ada Obi". Undefined means a
   * caller passed a title explicitly, which is always treated as a real one.
   */
  hasOwnTitle?: boolean;
}

interface Props {
  post: PostCardData;
  currentUserId: string | null;
  surface: "home" | "following" | "subscriptions" | "topics" | "latest";
  priority?: boolean;
  respondingTo?: RespondingToInfo | null;
  /** Set where the parent is already the surrounding context — under the very
   *  post being responded to, "Responding to <this post>" is just noise. */
  hideRespondingTo?: boolean;
  /** Show when this was published. Off in the feed, where recency is implied by
   *  the ordering; on in a discussion, where "when" is part of following it. */
  showTimestamp?: boolean;
}

function deriveRespondingTo(responseTo: PostCardData["response_to"]): RespondingToInfo | null {
  if (!responseTo) return null;
  return {
    title: getPostMetadataTitle(responseTo, responseTo.profiles),
    hasOwnTitle: getPostDisplayTitle(responseTo) !== null,
    author: responseTo.profiles?.full_name ?? responseTo.profiles?.username ?? "another author",
    slug: responseTo.slug,
    authorUsername: responseTo.profiles?.username ?? null,
  };
}

const CARD_SHELL =
  "mb-4 overflow-hidden rounded-[18px] border border-[#e7e3dc] bg-white px-4 py-4 shadow-[0_2px_10px_rgb(17_24_39/0.045)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-[#d9d3c9] hover:shadow-[0_10px_28px_rgb(17_24_39/0.075)] motion-reduce:transform-none motion-reduce:transition-none sm:px-5 sm:py-5";
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

function AuthorLine({
  post,
  avatarSize = 36,
  showTimestamp = false,
}: {
  post: PostCardData;
  avatarSize?: number;
  showTimestamp?: boolean;
}) {
  const publishedAt = post.published_at ?? post.created_at;
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
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 text-[13.5px] leading-[1.35]">
          {profile?.username ? (
            <Link href={`/${profile.username}`} className={`truncate font-semibold text-ink hover:text-emerald-700 ${FOCUS_RING}`}>
              {byline}
            </Link>
          ) : (
            <span className="truncate font-semibold text-ink">{byline}</span>
          )}
          {profile?.verified ? (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-brand text-[8px] font-bold text-white" title="Verified">
              ✓
            </span>
          ) : null}
        </div>
        {profile?.university || (showTimestamp && publishedAt) ? (
          <p className="mt-0.5 truncate text-[12px] leading-[1.4] text-ink-muted">
            {profile?.university ?? ""}
            {profile?.university && showTimestamp && publishedAt ? " · " : ""}
            {showTimestamp && publishedAt ? formatRelativeTime(publishedAt) : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ContextLine({
  post,
  surface,
  respondingTo,
  hideRespondingTo,
}: Pick<Props, "post" | "surface" | "respondingTo" | "hideRespondingTo">) {
  if (post.in_response_to && !hideRespondingTo) {
    const parent = respondingTo ?? deriveRespondingTo(post.response_to);
    return (
      <p className="mb-2.5 flex items-start gap-1.5 text-[12.5px] leading-[1.5] text-gray-500">
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
              {parent.author && parent.hasOwnTitle !== false ? (
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
    return <p className="mb-2.5 text-[12.5px] text-gray-500">{post.surface_reason}</p>;
  }
  if (surface === "subscriptions") {
    const reason = post.subscription_match?.reasons[0];
    if (reason) {
      return (
        <p className="mb-2.5 text-[12.5px] font-medium text-emerald-800">
          {reason.kind === "author"
            ? `Because you subscribe to ${reason.label}`
            : `From #${reason.label}`}
        </p>
      );
    }
  }
  return null;
}

function Actions({
  post,
  currentUserId,
  showDiscussion = true,
}: Pick<Props, "post" | "currentUserId"> & { showDiscussion?: boolean }) {
  return (
    <FeedEngagementActions
      postId={post.id}
      slug={post.slug}
      userId={currentUserId}
      initialLiked={post.viewer_liked ?? false}
      initialLikeCount={post.like_count ?? 0}
      initialBookmarked={post.viewer_bookmarked ?? false}
      responseCount={post.response_count ?? 0}
      commentCount={post.comment_count ?? 0}
      showDiscussion={showDiscussion}
      contentKind={resolveContentKind(post)}
      shareTitle={
        getPostDisplayTitle(post) ??
        ((sanitizePostExcerpt(post.excerpt) ?? "").slice(0, 120) || undefined)
      }
    />
  );
}

function TopicLinks({ tags }: { tags: string[] | null }) {
  const topics = (tags ?? []).map((tag) => tag.trim()).filter(Boolean).slice(0, 2);
  if (topics.length === 0) return null;

  return (
    <nav aria-label="Publication topics" className="mt-3 flex flex-wrap gap-1.5">
      {topics.map((topic) => (
        <Link
          key={topic}
          href={`/topics/${encodeURIComponent(topic)}`}
          className={`inline-flex min-h-8 items-center rounded-full border border-gray-200 bg-canvas px-2.5 text-[11.5px] font-semibold text-gray-600 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 ${FOCUS_RING}`}
        >
          #{topic}
        </Link>
      ))}
    </nav>
  );
}

function FullWidthCover({ post, title, priority }: { post: PostCardData; title: string; priority?: boolean }) {
  if (!post.cover_image_url?.trim()) return null;
  return (
    <PostImage
      src={post.cover_image_url}
      alt={title}
      type={post.type}
      content_kind={post.content_kind}
      article_format={post.article_format}
      sizes="(max-width: 640px) calc(100vw - 56px), (max-width: 1024px) 720px, 780px"
      priority={priority}
      variant="feed"
      wrapperClassName="mt-3"
      className="w-full rounded-[10px] bg-gray-100"
    />
  );
}

function PostFeedCard({ post, currentUserId, surface, priority, respondingTo, hideRespondingTo, showTimestamp }: Props) {
  const title = getPostDisplayTitle(post);
  const excerpt = sanitizePostExcerpt(post.excerpt) || "View post";

  return (
    <article className={CARD_SHELL}>
      <ContextLine post={post} surface={surface} respondingTo={respondingTo} hideRespondingTo={hideRespondingTo} />
      <AuthorLine post={post} avatarSize={32} showTimestamp={showTimestamp} />
      <div className="mt-3">
        {title ? (
          <Link href={`/post/${post.slug}`} className={FOCUS_RING}>
            <h2 className="font-display text-[20px] font-semibold leading-[1.25] text-ink sm:text-[22px]">{title}</h2>
          </Link>
        ) : null}
        <Link href={`/post/${post.slug}`} className={`mt-1.5 block ${FOCUS_RING}`}>
          <p className={`${title ? "line-clamp-3 text-[15.5px] text-gray-600" : "line-clamp-5 text-[16.5px] text-gray-800"} whitespace-pre-line leading-[1.65]`}>
            {excerpt}
          </p>
        </Link>
      </div>
      <TopicLinks tags={post.tags} />
      <FullWidthCover post={post} title={title ?? excerpt} priority={priority} />
      <Actions post={post} currentUserId={currentUserId} />
    </article>
  );
}

function ArticleFeedCard({ post, currentUserId, surface, priority, respondingTo, hideRespondingTo, showTimestamp }: Props) {
  const title = getPostDisplayTitle(post) ?? "Untitled article";
  const excerpt = sanitizePostExcerpt(post.excerpt);
  const format = getArticleFormatLabel(resolveArticleFormat(post));
  const isPolicyBrief = format === "Policy Brief";
  const hasCover = Boolean(post.cover_image_url?.trim());
  const readingTime = readTime(excerpt);

  return (
    <article className={`${CARD_SHELL} border-l-[3px] border-l-gold`} data-content-kind="article">
      <ContextLine post={post} surface={surface} respondingTo={respondingTo} hideRespondingTo={hideRespondingTo} />
      <AuthorLine post={post} avatarSize={28} showTimestamp={showTimestamp} />
      <div
        className={`mt-3 min-w-0 ${
          hasCover
            ? "sm:grid sm:grid-cols-[minmax(0,1fr)_210px] sm:items-start sm:gap-5"
            : ""
        }`}
      >
        <div className="min-w-0">
          <div
            className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1"
            aria-label={`Article${format ? `, ${format}` : ""}, ${readingTime} minute read`}
          >
            <span className="inline-flex min-h-7 items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 font-sans text-[10.5px] font-bold uppercase tracking-[0.12em] text-amber-800">
              Article
            </span>
            {format ? (
              <span className={`text-[11.5px] font-semibold ${isPolicyBrief ? "text-purple-accent" : "text-gold-ink"}`}>
                {format}
              </span>
            ) : null}
            <span className="text-[11.5px] font-medium text-gray-400">
              {readingTime} min read
            </span>
          </div>
          <Link href={`/post/${post.slug}`} className={FOCUS_RING}>
            <h2 className="font-display line-clamp-3 text-[21px] font-semibold leading-[1.2] text-ink sm:text-[23px]">{title}</h2>
          </Link>
          {excerpt ? <p className="mt-2.5 line-clamp-2 text-[14.5px] leading-[1.62] text-gray-600">{excerpt}</p> : null}
          <TopicLinks tags={post.tags} />
        </div>

        {hasCover ? (
          <PostImage
            src={post.cover_image_url as string}
            alt={title}
            type={post.type}
            content_kind={post.content_kind}
            article_format={post.article_format}
            sizes="(max-width: 640px) calc(100vw - 56px), 210px"
            priority={priority}
            variant="feed"
            wrapperClassName="mt-3 overflow-hidden rounded-[10px] sm:mt-0"
            className="w-full bg-gray-100"
          />
        ) : null}
      </div>
      <Actions post={post} currentUserId={currentUserId} />
    </article>
  );
}

function EvidenceBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex min-h-7 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-[10.5px] font-bold text-emerald-700">
      <span aria-hidden="true">✓</span>
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

function ResearchFeedCard({ post, currentUserId, surface, respondingTo, hideRespondingTo }: Props) {
  const title = getPostDisplayTitle(post) ?? "Untitled research paper";
  const abstract = sanitizePostExcerpt(post.excerpt);
  const evidence = post.citation_id ? "Citable" : isFormallyReviewed(post) ? "Reviewed" : null;
  const primaryAuthor = post.profiles?.full_name ?? post.profiles?.username ?? "Indegenius researcher";
  const coauthors = (post.co_authors ?? [])
    .map((author) => author.profile?.full_name ?? author.profile?.username)
    .filter(Boolean) as string[];
  const hasDocument = Boolean(post.document_original_name || post.document_mime_type);

  return (
    <article className={`${CARD_SHELL} border-purple-100 border-l-[3px] border-l-purple-accent`} data-content-kind="research">
      <ContextLine post={post} surface={surface} respondingTo={respondingTo} hideRespondingTo={hideRespondingTo} />
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="inline-flex min-h-7 items-center rounded-full border border-purple-200 bg-purple-50 px-2.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-purple-accent">Research</span>
        {evidence && !hasDocument ? (
          <span>
            <EvidenceBadge label={evidence} />
          </span>
        ) : null}
      </div>
      <Link href={`/post/${post.slug}`} className={FOCUS_RING}>
        <h2 className="font-display text-[21px] font-semibold leading-[1.25] text-ink sm:text-[23px]">{title}</h2>
      </Link>
      <p className="mt-2.5 text-[13px] font-semibold leading-[1.45] text-gray-800">{primaryAuthor}</p>
      {post.profiles?.university ? <p className="mt-0.5 text-[12px] text-gray-500">{post.profiles.university}</p> : null}
      {coauthors.length > 0 ? (
        <p className="mt-0.5 text-[12px] leading-[1.45] text-gray-500">with {coauthors.join(", ")}</p>
      ) : null}
      {abstract ? <p className="mt-3 line-clamp-2 text-[14.5px] leading-[1.62] text-gray-600">{abstract}</p> : null}
      <TopicLinks tags={post.tags} />
      <ResearchManuscriptRow post={post} evidence={evidence} />
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
