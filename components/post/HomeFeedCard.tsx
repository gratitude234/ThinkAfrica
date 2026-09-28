import Link from "next/link";
import FeedEngagementActions from "./FeedEngagementActions";
import PostCover from "./PostCover";
import PostImage from "./PostImage";
import type { PostCardData } from "./PostCard";
import { CARD_SHELL, FOCUS_RING } from "./cardShell";
import { resolveContentKind } from "@/lib/contentModel";
import { getPostDisplayTitle } from "@/lib/postDisplay";
import { formatTagLabel } from "@/lib/tags";
import { formatRelativeTime, sanitizePostExcerpt } from "@/lib/utils";

interface Props {
  post: PostCardData;
  currentUserId: string | null;
  priority?: boolean;
  /** Feed cards show recency by default; callers can suppress it explicitly. */
  showTimestamp?: boolean;
}

/** Keep the narrow byline from spending space on "ago" / "yesterday". */
function compactRelativeTime(date: string) {
  return formatRelativeTime(date).replace(/ ago$/, "").replace("yesterday", "1d");
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

/**
 * Reading time from the stored body word count.
 *
 * This used to count the words in `excerpt`, which is capped at roughly thirty
 * words, so `ceil(words / 200)` was always 1 and every card in the feed
 * reported "1 min" no matter how long the article was.
 *
 * Returns null rather than a floor of 1 when the count is missing: a post can
 * legitimately have no stored body count, and the
 * column is only populated once the 20260818 migration runs. Omitting the
 * segment is honest; printing "1 min" is the bug again in a smaller font.
 */
function readTime(wordCount: number | null | undefined) {
  if (!wordCount || wordCount <= 0) return null;
  return Math.max(1, Math.ceil(wordCount / 200));
}

/**
 * Who wrote it and when, on one line.
 *
 * The university used to sit on this line too, and a co-author count after
 * the name. The publishing reset (Phase 2F) removed both from feed cards: the
 * card identifies the writer, and the rest of who they are is on their profile
 * a tap away. The timestamp never truncates -- "22h" is three characters and
 * is the one piece a reader scans for -- so the name is the item that gives
 * way when the line runs out of room.
 */
function AuthorLine({
  post,
  avatarSize = 36,
  showTimestamp = true,
}: {
  post: PostCardData;
  avatarSize?: number;
  showTimestamp?: boolean;
}) {
  const publishedAt = post.published_at ?? post.created_at;
  const profile = post.profiles;
  const name = profile?.full_name ?? profile?.username ?? "Indegenius member";
  const avatarClass =
    avatarSize <= 34
      ? "h-[30px] w-[30px] sm:h-[34px] sm:w-[34px]"
      : "h-9 w-9";
  const avatar = profile?.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={profile.avatar_url}
      alt=""
      className={`${avatarClass} rounded-full object-cover`}
    />
  ) : (
    <span
      className={`${avatarClass} flex items-center justify-center rounded-full bg-green-tint text-[11px] sm:text-[12px] font-bold text-emerald-brand dark:bg-emerald-brand dark:text-emerald-ink`}
    >
      {initials(name)}
    </span>
  );

  return (
    <div className="flex min-w-0 items-center gap-[9px] sm:gap-2.5">
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
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-feed-byline">
        {profile?.username ? (
          <Link
            href={`/${profile.username}`}
            className={`truncate font-semibold text-ink hover:text-emerald-ink ${FOCUS_RING}`}
          >
            {name}
          </Link>
        ) : (
          <span className="truncate font-semibold text-ink">{name}</span>
        )}
        {showTimestamp && publishedAt ? (
          <time
            dateTime={publishedAt}
            title={new Date(publishedAt).toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC"}
            aria-label={formatRelativeTime(publishedAt)}
            className="shrink-0 whitespace-nowrap text-feed-meta text-ink-muted"
          >
            <span aria-hidden="true">· </span>
            {compactRelativeTime(publishedAt)}
          </time>
        ) : null}
      </div>
    </div>
  );
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

/**
 * Topic chips carry no content-kind tint. They used to come in three tones
 * (grey for Post, amber for Article, purple for Research), which meant the
 * same hue appeared on the card border, the kicker and the chips at once, and
 * a mixed feed showed three palettes stacked. The kicker states the kind
 * already; the chips just need to read as navigable.
 */
function TopicLinks({ tags }: { tags: string[] | null }) {
  // `formatTagLabel` rather than a plain trim: the chip renders its own '#',
  // so a stored "#africa" printed as "##africa" and linked to a /topics page
  // keyed on the hashed spelling. Stripping here fixes the label and the
  // destination together, and keeps rows written before the normalization
  // migration displaying correctly.
  const topics = (tags ?? [])
    .map((tag) => formatTagLabel(tag))
    .filter(Boolean)
    .slice(0, 2);
  if (topics.length === 0) return null;

  return (
    <nav
      aria-label="Publication topics"
      className="mt-2.5 flex flex-wrap gap-1.5 sm:mt-3"
    >
      {topics.map((topic) => (
        <Link
          key={topic}
          href={`/topics/${encodeURIComponent(topic)}`}
          className={`inline-flex h-7 items-center rounded-full border border-card-border bg-card px-2.5 text-feed-meta font-semibold text-ink-soft transition-colors hover:border-emerald-ink hover:text-emerald-ink ${FOCUS_RING}`}
        >
          #{topic}
        </Link>
      ))}
    </nav>
  );
}

function PostMedia({
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
      content_kind={post.content_kind}
      sizes="(max-width: 640px) calc(100vw - 40px), 520px"
      priority={priority}
      fallbackClassName="bg-surface text-ink-muted"
      fallbackLabel="Image unavailable"
      variant="feed"
      wrapperClassName="mt-3 max-w-[520px] overflow-hidden rounded-xl border border-card-border/60 sm:mt-4 sm:rounded-[14px]"
      className="w-full rounded-xl bg-card sm:rounded-[14px]"
    />
  );
}

function PostFeedCard({
  post,
  currentUserId,
  priority,
  showTimestamp,
}: Props) {
  const title = getPostDisplayTitle(post);
  const excerpt = sanitizePostExcerpt(post.excerpt) || "View post";

  return (
    <article className={`${CARD_SHELL} font-ui`} data-content-kind="post">
      <AuthorLine post={post} avatarSize={34} showTimestamp={showTimestamp ?? true} />
      <div className="mt-2.5 sm:mt-3">
        {title ? (
          <Link href={`/post/${post.slug}`} className={`group block ${FOCUS_RING}`}>
            <h2 className="font-ui text-feed-post-title font-semibold text-ink transition-colors group-hover:text-emerald-ink motion-reduce:transition-none">
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
                ? "line-clamp-3 text-feed-excerpt text-ink-soft"
                : "line-clamp-6 text-feed-post text-ink"
            } max-w-measure whitespace-pre-line`}
          >
            {excerpt}
          </p>
        </Link>
      </div>
      <PostMedia post={post} title={title ?? excerpt} priority={priority} />
      <Actions post={post} currentUserId={currentUserId} />
    </article>
  );
}

/**
 * The Article kicker.
 *
 * It used to carry a genre between the kind and the reading time ("Article ·
 * Policy Brief · 9 min"). Genre is not part of the product, so the line is the
 * kind and how long the piece takes to read.
 */
function ArticleMeta({ readingTime }: { readingTime: number | null }) {
  return (
    <p
      className="font-ui text-feed-kicker font-semibold uppercase text-gold-ink"
      aria-label={`Article${readingTime ? `, ${readingTime} minute read` : ""}`}
    >
      <span>Article</span>
      {readingTime ? (
        <>
          <span aria-hidden="true"> · </span>
          <span>{readingTime} min</span>
        </>
      ) : null}
    </p>
  );
}

function ArticleFeedCard({
  post,
  currentUserId,
  priority,
  showTimestamp,
}: Props) {
  const title = getPostDisplayTitle(post) ?? "Untitled article";
  const excerpt = sanitizePostExcerpt(post.excerpt);
  const hasCover = Boolean(post.cover_image_url?.trim());
  const readingTime = readTime(post.word_count);

  // Articles are headline-led: a compact thumbnail supports scanning while
  // Post attachments remain large enough to inspect as content in their own right.
  return (
    <article className={`${CARD_SHELL} font-ui`} data-content-kind="article">
      <AuthorLine post={post} avatarSize={34} showTimestamp={showTimestamp ?? true} />

      <div className="mt-3 flex items-start gap-3 sm:gap-5">
        <div className="min-w-0 flex-1">
          <ArticleMeta readingTime={readingTime} />
          <Link href={`/post/${post.slug}`} className={`group block ${FOCUS_RING}`}>
            <h2 className="mt-1.5 max-w-[640px] font-editorial line-clamp-3 text-feed-article-title font-semibold text-ink transition-colors group-hover:text-emerald-ink motion-reduce:transition-none sm:mt-2">
              {title}
            </h2>
          </Link>
          {excerpt ? (
            <p className="mt-2 line-clamp-2 max-w-measure text-feed-excerpt text-ink-soft sm:mt-2.5 sm:line-clamp-3">
              {excerpt}
            </p>
          ) : null}
        </div>
        {hasCover ? (
          <Link
            href={`/post/${post.slug}`}
            tabIndex={-1}
            aria-hidden="true"
            className="mt-1 block w-24 shrink-0 overflow-hidden rounded-xl border border-card-border/60 bg-surface sm:w-40"
          >
            <PostCover
              src={post.cover_image_url}
              alt={title}
              content_kind={post.content_kind}
              sizes="(max-width: 639px) 96px, 160px"
              priority={priority}
              fit="cover"
              className="aspect-square w-full sm:aspect-[4/3]"
              imageClassName="object-cover"
              fallbackClassName="bg-surface text-ink-muted"
              fallbackLabel="Image unavailable"
            />
          </Link>
        ) : null}
      </div>
      <TopicLinks tags={post.tags} />

      <Actions post={post} currentUserId={currentUserId} />
    </article>
  );
}

export default function HomeFeedCard(props: Props) {
  return resolveContentKind(props.post) === "article" ? (
    <ArticleFeedCard {...props} />
  ) : (
    <PostFeedCard {...props} />
  );
}
