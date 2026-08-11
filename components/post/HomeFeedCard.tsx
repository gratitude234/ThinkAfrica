import Link from "next/link";
import FeedEngagementActions from "./FeedEngagementActions";
import PostCover from "./PostCover";
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
  /** Whether `title` is the parent's own title rather than a derived label. */
  hasOwnTitle?: boolean;
}

interface Props {
  post: PostCardData;
  currentUserId: string | null;
  surface: "home" | "following" | "subscriptions" | "topics" | "latest";
  priority?: boolean;
  respondingTo?: RespondingToInfo | null;
  /** Hide response context where the parent post is already the page context. */
  hideRespondingTo?: boolean;
  /** Feed cards show recency by default; callers can suppress it explicitly. */
  showTimestamp?: boolean;
}

function deriveRespondingTo(
  responseTo: PostCardData["response_to"]
): RespondingToInfo | null {
  if (!responseTo) return null;
  return {
    title: getPostMetadataTitle(responseTo, responseTo.profiles),
    hasOwnTitle: getPostDisplayTitle(responseTo) !== null,
    author:
      responseTo.profiles?.full_name ??
      responseTo.profiles?.username ??
      "another author",
    slug: responseTo.slug,
    authorUsername: responseTo.profiles?.username ?? null,
  };
}

const BASE_CARD_SHELL =
  "mb-3 overflow-hidden rounded-[18px] border bg-white px-3.5 py-3.5 shadow-[0_2px_12px_rgb(17_24_39/0.045)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-[0_10px_28px_rgb(17_24_39/0.07)] motion-reduce:transform-none motion-reduce:transition-none sm:mb-4 sm:rounded-[20px] sm:px-5 sm:py-5";
const POST_CARD_SHELL = `${BASE_CARD_SHELL} border-[#e9e5de] hover:border-[#ddd7ce]`;
const ARTICLE_CARD_SHELL = `${BASE_CARD_SHELL} border-[#e6ddca] hover:border-[#d8c79f]`;
const RESEARCH_CARD_SHELL = `${BASE_CARD_SHELL} border-purple-100 border-t-[3px] border-t-purple-accent bg-[#fcfaff] hover:border-purple-200`;
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
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AuthorLine({
  post,
  avatarSize = 36,
  showTimestamp = true,
  showCoauthorCount = true,
}: {
  post: PostCardData;
  avatarSize?: number;
  showTimestamp?: boolean;
  showCoauthorCount?: boolean;
}) {
  const publishedAt = post.published_at ?? post.created_at;
  const profile = post.profiles;
  const name = profile?.full_name ?? profile?.username ?? "Indegenius member";
  const coauthorCount = post.co_authors?.length ?? 0;
  const byline =
    showCoauthorCount && coauthorCount > 0 ? `${name} + ${coauthorCount}` : name;
  const avatarDimensions = { width: avatarSize, height: avatarSize };
  const verificationClass =
    resolveContentKind(post) === "research"
      ? "bg-purple-accent"
      : "bg-emerald-brand";
  const avatar = profile?.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={profile.avatar_url}
      alt=""
      style={avatarDimensions}
      className="rounded-full object-cover"
    />
  ) : (
    <span
      style={avatarDimensions}
      className="flex items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-800"
    >
      {initials(name)}
    </span>
  );

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {profile?.username ? (
        <Link
          href={`/${profile.username}`}
          aria-label={`View ${name}'s profile`}
          className={`shrink-0 rounded-full ${FOCUS_RING}`}
        >
          {avatar}
        </Link>
      ) : (
        <span className="shrink-0">{avatar}</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 text-[13.5px] leading-[1.35] sm:text-[14px]">
          {profile?.username ? (
            <Link
              href={`/${profile.username}`}
              className={`truncate font-semibold text-ink hover:text-emerald-700 ${FOCUS_RING}`}
            >
              {byline}
            </Link>
          ) : (
            <span className="truncate font-semibold text-ink">{byline}</span>
          )}
          {profile?.verified ? (
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white ${verificationClass}`}
              title="Verified"
            >
              ✓
            </span>
          ) : null}
        </div>
        {profile?.university || (showTimestamp && publishedAt) ? (
          <p className="mt-0.5 truncate text-[12px] leading-[1.4] text-gray-500 sm:text-[12.5px]">
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
}: Pick<
  Props,
  "post" | "surface" | "respondingTo" | "hideRespondingTo"
>) {
  if (post.in_response_to && !hideRespondingTo) {
    const parent = respondingTo ?? deriveRespondingTo(post.response_to);
    return (
      <p className="mb-2.5 flex items-start gap-1.5 text-[12.5px] leading-[1.5] text-gray-500">
        <span aria-hidden="true" className="mt-px">
          ↩
        </span>
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
                    <Link
                      href={`/${parent.authorUsername}`}
                      className={`hover:text-emerald-700 hover:underline ${FOCUS_RING}`}
                    >
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
    return (
      <p className="mb-2.5 flex items-center gap-2 text-[12px] font-semibold text-gold-ink sm:text-[12.5px]">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden="true" />
        {post.surface_reason}
      </p>
    );
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

function TopicLinks({
  tags,
  tone = "post",
}: {
  tags: string[] | null;
  tone?: "post" | "article" | "research";
}) {
  const topics = (tags ?? [])
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (topics.length === 0) return null;

  const toneClass =
    tone === "research"
      ? "border-purple-100 bg-purple-50 text-purple-accent hover:border-purple-300 hover:bg-purple-100"
      : tone === "article"
        ? "border-amber-100 bg-amber-50 text-gold-ink hover:border-amber-300 hover:bg-amber-100"
        : "border-gray-200 bg-canvas text-gray-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800";

  return (
    <nav
      aria-label="Publication topics"
      className="mt-2.5 flex flex-wrap gap-1.5 sm:mt-3"
    >
      {topics.map((topic) => (
        <Link
          key={topic}
          href={`/topics/${encodeURIComponent(topic)}`}
          className={`inline-flex min-h-8 items-center rounded-full border px-2.5 text-[12px] font-semibold transition-colors ${toneClass} ${FOCUS_RING}`}
        >
          #{topic}
        </Link>
      ))}
    </nav>
  );
}

function FullWidthCover({
  post,
  title,
  priority,
}: {
  post: PostCardData;
  title: string;
  priority?: boolean;
}) {
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
      wrapperClassName="mt-3 overflow-hidden rounded-[14px]"
      className="w-full rounded-[14px] bg-[#f3f1ec]"
    />
  );
}

function PostFeedCard({
  post,
  currentUserId,
  surface,
  priority,
  respondingTo,
  hideRespondingTo,
  showTimestamp,
}: Props) {
  const title = getPostDisplayTitle(post);
  const excerpt = sanitizePostExcerpt(post.excerpt) || "View post";

  return (
    <article className={POST_CARD_SHELL} data-content-kind="post">
      <ContextLine
        post={post}
        surface={surface}
        respondingTo={respondingTo}
        hideRespondingTo={hideRespondingTo}
      />
      <AuthorLine post={post} avatarSize={34} showTimestamp={showTimestamp ?? true} />
      <div className="mt-3">
        {title ? (
          <Link href={`/post/${post.slug}`} className={FOCUS_RING}>
            <h2 className="font-sans text-[19px] font-semibold leading-[1.3] text-ink sm:text-[21px]">
              {title}
            </h2>
          </Link>
        ) : null}
        <Link
          href={`/post/${post.slug}`}
          className={`${title ? "mt-1.5" : ""} block ${FOCUS_RING}`}
        >
          <p
            className={`${
              title
                ? "line-clamp-3 text-[15.5px] text-gray-600"
                : "line-clamp-6 text-[16px] text-gray-800 sm:text-[16.5px]"
            } whitespace-pre-line leading-[1.62]`}
          >
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

function ArticleMeta({
  format,
  readingTime,
  onCover = false,
}: {
  format: string | null;
  readingTime: number;
  onCover?: boolean;
}) {
  return (
    <p
      className={`font-sans text-[10.5px] font-bold uppercase tracking-[0.15em] sm:text-[11px] ${
        onCover ? "text-[#f1c86e]" : "text-gold-ink"
      }`}
      aria-label={`Article${format ? `, ${format}` : ""}, ${readingTime} minute read`}
    >
      <span>Article</span>
      {format ? (
        <>
          <span aria-hidden="true"> · </span>
          <span>{format}</span>
        </>
      ) : null}
      <span aria-hidden="true"> · </span>
      <span>{readingTime} min</span>
    </p>
  );
}

function ArticleFeedCard({
  post,
  currentUserId,
  surface,
  priority,
  respondingTo,
  hideRespondingTo,
  showTimestamp,
}: Props) {
  const title = getPostDisplayTitle(post) ?? "Untitled article";
  const excerpt = sanitizePostExcerpt(post.excerpt);
  const format = getArticleFormatLabel(resolveArticleFormat(post));
  const hasCover = Boolean(post.cover_image_url?.trim());
  const readingTime = readTime(excerpt);

  return (
    <article className={ARTICLE_CARD_SHELL} data-content-kind="article">
      <ContextLine
        post={post}
        surface={surface}
        respondingTo={respondingTo}
        hideRespondingTo={hideRespondingTo}
      />
      <AuthorLine post={post} avatarSize={34} showTimestamp={showTimestamp ?? true} />

      {hasCover ? (
        <Link
          href={`/post/${post.slug}`}
          className={`group relative mt-3 block overflow-hidden rounded-[15px] bg-emerald-brand ${FOCUS_RING}`}
        >
          <PostCover
            src={post.cover_image_url}
            alt={title}
            type={post.type}
            content_kind={post.content_kind}
            article_format={post.article_format}
            sizes="(max-width: 640px) calc(100vw - 56px), (max-width: 1024px) 720px, 780px"
            priority={priority}
            fit="cover"
            className="aspect-[4/3] w-full bg-emerald-brand sm:aspect-[16/10]"
            imageClassName="object-cover transition-transform duration-500 group-hover:scale-[1.015] motion-reduce:transition-none"
          />
          <span
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#052f23]/95 via-[#052f23]/48 via-55% to-transparent"
            aria-hidden="true"
          />
          <span className="absolute inset-x-0 bottom-0 block p-4 text-white sm:p-5">
            <ArticleMeta format={format} readingTime={readingTime} onCover />
            <h2 className="mt-1.5 font-display line-clamp-3 text-[25px] font-semibold leading-[1.08] text-white sm:text-[32px] sm:leading-[1.05]">
              {title}
            </h2>
            {excerpt ? (
              <span className="mt-2 line-clamp-2 text-[13.5px] leading-[1.5] text-white/90 max-[359px]:hidden sm:text-[14.5px]">
                {excerpt}
              </span>
            ) : null}
          </span>
        </Link>
      ) : (
        <div className="mt-3 rounded-[14px] border border-amber-100 bg-[#fffdf8] p-4 sm:p-5">
          <ArticleMeta format={format} readingTime={readingTime} />
          <Link href={`/post/${post.slug}`} className={FOCUS_RING}>
            <h2 className="mt-2 font-display line-clamp-4 text-[24px] font-semibold leading-[1.12] text-ink sm:text-[30px] sm:leading-[1.08]">
              {title}
            </h2>
          </Link>
          {excerpt ? (
            <p className="mt-2.5 line-clamp-3 text-[14.5px] leading-[1.62] text-gray-700 sm:text-[15px]">
              {excerpt}
            </p>
          ) : null}
        </div>
      )}

      <TopicLinks tags={post.tags} tone="article" />
      <Actions post={post} currentUserId={currentUserId} />
    </article>
  );
}

function ResearchDocumentPreview({
  post,
  title,
  priority,
}: {
  post: PostCardData;
  title: string;
  priority?: boolean;
}) {
  const hasCover = Boolean(post.cover_image_url?.trim());
  const hasDocument = Boolean(
    post.document_original_name || post.document_mime_type
  );

  if (hasCover) {
    return (
      <PostImage
        src={post.cover_image_url as string}
        alt={title}
        type={post.type}
        content_kind={post.content_kind}
        article_format={post.article_format}
        sizes="(max-width: 640px) 104px, 170px"
        priority={priority}
        variant="research-preview"
        wrapperClassName="overflow-hidden rounded-[10px] border border-purple-100 bg-white shadow-sm"
        className="w-full bg-white"
      />
    );
  }

  if (!hasDocument) return null;

  return (
    <Link
      href={`/post/${post.slug}`}
      aria-label={`View ${title} manuscript`}
      className={`relative block aspect-[3/4] overflow-hidden rounded-[10px] border border-purple-100 bg-white p-3 shadow-sm transition-colors hover:border-purple-300 ${FOCUS_RING}`}
    >
      <span className="text-[8px] font-bold uppercase tracking-[0.14em] text-purple-accent">
        PDF manuscript
      </span>
      <span className="mt-2 block font-display line-clamp-4 text-[11px] font-semibold leading-[1.18] text-ink sm:text-[13px]">
        {title}
      </span>
      <span className="absolute inset-x-3 bottom-3 space-y-1.5" aria-hidden="true">
        <span className="block h-1 rounded-full bg-purple-100" />
        <span className="block h-1 w-5/6 rounded-full bg-purple-100" />
        <span className="block h-1 w-3/5 rounded-full bg-purple-100" />
      </span>
    </Link>
  );
}

function ResearchManuscriptRow({ post }: { post: PostCardData }) {
  const size = documentSize(post.document_size_bytes);
  const hasDocument = Boolean(
    post.document_original_name || post.document_mime_type
  );
  if (!hasDocument) return null;

  return (
    <div className="mt-3 flex min-w-0 items-center gap-2 border-t border-purple-100 pt-2.5">
      <span
        aria-hidden="true"
        className="flex h-[25px] w-[22px] shrink-0 items-center justify-center rounded-[3px] bg-purple-accent text-[7px] font-bold tracking-wide text-white"
      >
        PDF
      </span>
      <span className="min-w-0 truncate text-[11.5px] text-gray-500">
        PDF manuscript{size ? ` · ${size}` : ""}
      </span>
      <span className="flex-1" />
      <Link
        href={`/post/${post.slug}`}
        aria-label="View paper"
        className={`inline-flex min-h-10 shrink-0 items-center rounded-md px-1.5 text-[12px] font-bold text-purple-accent hover:underline ${FOCUS_RING}`}
      >
        View paper →
      </Link>
    </div>
  );
}

function ResearchFeedCard({
  post,
  currentUserId,
  surface,
  priority,
  respondingTo,
  hideRespondingTo,
  showTimestamp,
}: Props) {
  const title = getPostDisplayTitle(post) ?? "Untitled research paper";
  const abstract = sanitizePostExcerpt(post.excerpt);
  const evidence = post.citation_id
    ? "Citable"
    : isFormallyReviewed(post)
      ? "Reviewed"
      : null;
  const coauthors = (post.co_authors ?? [])
    .map((author) => author.profile?.full_name ?? author.profile?.username)
    .filter(Boolean) as string[];
  const hasPreview = Boolean(
    post.cover_image_url?.trim() ||
      post.document_original_name ||
      post.document_mime_type
  );

  return (
    <article className={RESEARCH_CARD_SHELL} data-content-kind="research">
      <ContextLine
        post={post}
        surface={surface}
        respondingTo={respondingTo}
        hideRespondingTo={hideRespondingTo}
      />
      <AuthorLine
        post={post}
        avatarSize={34}
        showTimestamp={showTimestamp ?? true}
        showCoauthorCount={false}
      />

      <div
        className={`mt-3 min-w-0 ${
          hasPreview
            ? "grid grid-cols-[minmax(0,1fr)_104px] items-start gap-3 sm:grid-cols-[minmax(0,1fr)_170px] sm:gap-5"
            : ""
        }`}
      >
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.15em] text-purple-accent sm:text-[11px]">
            <span>Research</span>
            {evidence ? (
              <>
                <span aria-hidden="true"> · </span>
                <span>{evidence}</span>
              </>
            ) : null}
          </p>
          <Link href={`/post/${post.slug}`} className={FOCUS_RING}>
            <h2 className="mt-2 font-display line-clamp-4 text-[21px] font-semibold leading-[1.13] text-ink sm:text-[27px] sm:leading-[1.1]">
              {title}
            </h2>
          </Link>
          {abstract ? (
            <p
              className={`${
                hasPreview ? "line-clamp-3" : "line-clamp-4"
              } mt-2.5 text-[13.5px] leading-[1.58] text-gray-700 sm:text-[14.5px] sm:leading-[1.62]`}
            >
              {abstract}
            </p>
          ) : null}
          {coauthors.length > 0 ? (
            <p className="mt-2 line-clamp-2 text-[11.5px] leading-[1.45] text-gray-500">
              with {coauthors.join(", ")}
            </p>
          ) : null}
          <TopicLinks tags={post.tags} tone="research" />
        </div>

        {hasPreview ? (
          <ResearchDocumentPreview post={post} title={title} priority={priority} />
        ) : null}
      </div>

      <ResearchManuscriptRow post={post} />
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
