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
      className={`${avatarClass} flex items-center justify-center rounded-full bg-green-tint text-[11px] font-bold text-emerald-brand dark:bg-emerald-brand dark:text-emerald-ink`}
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
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13.5px] leading-[1.35] sm:text-byline">
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
          <span className="shrink-0 whitespace-nowrap text-[12px] leading-[1.45] text-ink-muted sm:text-meta">
            <span aria-hidden="true">· </span>
            {formatRelativeTime(publishedAt)}
          </span>
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
          className={`inline-flex h-7 items-center rounded-full border border-card-border bg-card px-2.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-emerald-ink hover:text-emerald-ink ${FOCUS_RING}`}
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
      sizes="(max-width: 640px) 220px, 300px"
      priority={priority}
      variant="feed"
      wrapperClassName="mt-2.5 max-w-[220px] overflow-hidden rounded-xl sm:mt-3 sm:max-w-[300px] sm:rounded-[14px]"
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
    <article className={CARD_SHELL} data-content-kind="post">
      <AuthorLine post={post} avatarSize={34} showTimestamp={showTimestamp ?? true} />
      <div className="mt-3">
        {title ? (
          <Link href={`/post/${post.slug}`} className={`group block ${FOCUS_RING}`}>
            <h2 className="font-sans text-title font-semibold text-ink transition-colors group-hover:text-emerald-ink motion-reduce:transition-none">
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
                ? "line-clamp-3 text-excerpt text-ink-soft"
                : "line-clamp-6 text-[15.5px] leading-[1.58] text-ink sm:text-lede"
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
      className="font-sans text-[10.5px] font-bold uppercase leading-[1.45] tracking-[0.13em] text-gold-ink sm:text-kicker"
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

  // One layout, cover or no cover.
  //
  // An article with a cover used to print its kicker, headline and excerpt
  // *over* the image under a dark gradient, while a cover-less one printed the
  // same three things as ordinary text below the byline. Two grammars
  // alternating down a single column, so a reader re-learned where the
  // headline was on every card and never settled into a scan.
  //
  // The overlay was also the half that read worse. The scrim is one fixed
  // gradient over photographs it knows nothing about, so a pale sky or a lit
  // subject at the crop's bottom edge took white text at whatever contrast
  // happened to fall out; and `line-clamp-3` on a display-size face inside a
  // fixed-height crop truncated real headlines mid-phrase.
  //
  // So: text below for every article, and the cover becomes what it always
  // was, an illustration.
  return (
    <article className={CARD_SHELL} data-content-kind="article">
      <AuthorLine post={post} avatarSize={34} showTimestamp={showTimestamp ?? true} />

      <div className="mt-3">
        <ArticleMeta readingTime={readingTime} />
        <Link href={`/post/${post.slug}`} className={`group block ${FOCUS_RING}`}>
          <h2 className="mt-1.5 font-display line-clamp-4 text-[21px] font-semibold leading-[1.22] text-ink transition-colors group-hover:text-emerald-ink motion-reduce:transition-none sm:mt-2 sm:text-[26px] sm:leading-[1.2]">
            {title}
          </h2>
        </Link>
        {excerpt ? (
          <p className="mt-2 line-clamp-3 max-w-measure text-[14.5px] leading-[1.55] text-ink-soft sm:mt-2.5 sm:text-excerpt">
            {excerpt}
          </p>
        ) : null}
      </div>

      <TopicLinks tags={post.tags} />

      {hasCover ? (
        // 16:9 rather than the overlay's 4:3. A near-square crop on a phone
        // meant one article filled the screen, and a feed that shows a reader
        // one post at a time reads as empty however much is in it. The wider
        // crop gives back about a quarter of each card's height.
        //
        // Links to the post rather than opening the zoom viewer a Post's image
        // gets: on an article the cover is a lede illustration, so the whole
        // card should behave as one target.
        <Link
          href={`/post/${post.slug}`}
          tabIndex={-1}
          aria-hidden="true"
          className="group mt-2.5 block overflow-hidden rounded-xl bg-green-tint sm:mt-3 sm:rounded-[14px]"
        >
          <PostCover
            src={post.cover_image_url}
            alt={title}
            content_kind={post.content_kind}
            sizes="(max-width: 640px) calc(100vw - 32px), 704px"
            priority={priority}
            fit="cover"
            className="aspect-[16/9] w-full"
            imageClassName="object-cover transition-transform duration-500 group-hover:scale-[1.015] motion-reduce:transition-none"
          />
        </Link>
      ) : null}

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
