import Link from "next/link";
import FeedEngagementActions from "./FeedEngagementActions";
import PostCover from "./PostCover";
import PostImage from "./PostImage";
import type { PostCardData } from "./PostCard";
import { CARD_SHELL, FOCUS_RING } from "./cardShell";
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

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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
      className="flex items-center justify-center rounded-full bg-green-tint text-[11px] font-bold text-emerald-brand dark:bg-emerald-brand dark:text-emerald-ink"
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
      {/* One line, not two. The university and timestamp used to sit on their
          own line under the name, which cost a line of height on every post in
          the feed -- four posts on screen meant four lines spent on metadata.
          X, Medium and Substack all run name, source and time together on a
          single line, and none of them lose anything by it.

          Shrink order matters when the line runs out of room, and it is the
          reverse of source order: the university truncates first (it is the
          least load-bearing), the name truncates second, and the timestamp
          never truncates -- "22h" is three characters and is the one piece a
          reader scans for. Hence `shrink-0` on the time and its separator, and
          `min-w-0` on the university so it is the flex item that gives way. */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-byline">
        {profile?.username ? (
          <Link
            href={`/${profile.username}`}
            className={`truncate font-semibold text-ink hover:text-emerald-ink ${FOCUS_RING}`}
          >
            {byline}
          </Link>
        ) : (
          <span className="truncate font-semibold text-ink">{byline}</span>
        )}
        {profile?.verified ? (
          // The glyph takes the card's own ground colour rather than a fixed
          // white, so it stays legible when the badge fill lightens in dark
          // mode instead of turning into white-on-pale-lilac.
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-card ${verificationClass}`}
            title="Verified"
          >
            ✓
          </span>
        ) : null}
        {profile?.university ? (
          <span className="min-w-0 truncate text-meta text-ink-muted">
            <span aria-hidden="true">· </span>
            {profile.university}
          </span>
        ) : null}
        {showTimestamp && publishedAt ? (
          <span className="shrink-0 whitespace-nowrap text-meta text-ink-muted">
            <span aria-hidden="true">· </span>
            {formatRelativeTime(publishedAt)}
          </span>
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
      <p className="mb-2.5 flex items-start gap-1.5 text-meta text-ink-muted">
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
                  className={`font-semibold text-ink-soft hover:text-emerald-ink hover:underline ${FOCUS_RING}`}
                >
                  {parent.title}
                </Link>
              ) : (
                <span className="font-semibold text-ink-soft">{parent.title}</span>
              )}
              {parent.author && parent.hasOwnTitle !== false ? (
                <>
                  {" by "}
                  {parent.authorUsername ? (
                    <Link
                      href={`/${parent.authorUsername}`}
                      className={`hover:text-emerald-ink hover:underline ${FOCUS_RING}`}
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
      <p className="mb-2.5 flex items-center gap-2 text-meta font-semibold text-gold-ink">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden="true" />
        {post.surface_reason}
      </p>
    );
  }

  if (surface === "subscriptions") {
    const reason = post.subscription_match?.reasons[0];
    if (reason) {
      return (
        <p className="mb-2.5 text-meta font-medium text-emerald-ink">
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

/**
 * Topic chips carry no content-kind tint. They used to come in three tones
 * (grey for Post, amber for Article, purple for Research), which meant the
 * same hue appeared on the card border, the kicker and the chips at once, and
 * a mixed feed showed three palettes stacked. The kicker states the kind
 * already; the chips just need to read as navigable.
 */
function TopicLinks({ tags }: { tags: string[] | null }) {
  const topics = (tags ?? [])
    .map((tag) => tag.trim())
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
          className={`inline-flex min-h-8 items-center rounded-full border border-card-border bg-card px-2.5 text-meta font-semibold text-ink-soft transition-colors hover:border-emerald-ink hover:text-emerald-ink ${FOCUS_RING}`}
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
      // 100vw less the row's own px-4 (32); the shell's px-4 is cancelled by
      // the row's -mx-4 on phones, so it no longer enters the arithmetic.
      sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1024px) 720px, 780px"
      priority={priority}
      variant="feed"
      wrapperClassName="mt-3 overflow-hidden rounded-[14px]"
      className="w-full rounded-[14px] bg-card"
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
    <article className={CARD_SHELL} data-content-kind="post">
      <ContextLine
        post={post}
        surface={surface}
        respondingTo={respondingTo}
        hideRespondingTo={hideRespondingTo}
      />
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
                : "line-clamp-6 text-lede text-ink"
            } max-w-measure whitespace-pre-line`}
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
  readingTime: number | null;
  onCover?: boolean;
}) {
  return (
    <p
      className={`font-sans text-kicker font-bold uppercase ${
        onCover ? "text-[#f1c86e]" : "text-gold-ink"
      }`}
      aria-label={`Article${format ? `, ${format}` : ""}${readingTime ? `, ${readingTime} minute read` : ""}`}
    >
      <span>Article</span>
      {format ? (
        <>
          <span aria-hidden="true"> · </span>
          <span>{format}</span>
        </>
      ) : null}
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
  const readingTime =
    typeof post.reading_minutes === "number" && post.reading_minutes > 0
      ? Math.ceil(post.reading_minutes)
      : null;

  return (
    <article className={CARD_SHELL} data-content-kind="article">
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
            sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1024px) 720px, 780px"
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
            <h2 className="mt-1.5 font-display line-clamp-3 text-display font-semibold text-white">
              {title}
            </h2>
            {excerpt ? (
              <span className="mt-2 line-clamp-2 text-meta text-white/90 max-[359px]:hidden">
                {excerpt}
              </span>
            ) : null}
          </span>
        </Link>
      ) : (
        // No panel. A cover-less article used to get a bordered white block to
        // stand in for the "front" a cover would have given it, but it was the
        // last boxed thing left in a feed built to have none -- and it charged
        // for the privilege twice, once in its own 20px of padding and again
        // in the 12px above it, pushing the headline ~35px further from the
        // byline than the same headline sits in a Post row.
        //
        // Nothing is lost by removing it. The kicker below already announces
        // the piece as an Article, the Bodoni headline already distinguishes
        // it from a Post's sans one, and the row hairline already says where
        // the article stops. The box was restating all three.
        <div className="mt-3">
          <ArticleMeta format={format} readingTime={readingTime} />
          <Link href={`/post/${post.slug}`} className={`group block ${FOCUS_RING}`}>
            <h2 className="mt-2 font-display line-clamp-4 text-headline font-semibold text-ink transition-colors group-hover:text-emerald-ink motion-reduce:transition-none">
              {title}
            </h2>
          </Link>
          {excerpt ? (
            <p className="mt-2.5 line-clamp-3 max-w-measure text-excerpt text-ink-soft">
              {excerpt}
            </p>
          ) : null}
        </div>
      )}

      <TopicLinks tags={post.tags} />
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
        sizes="170px"
        priority={priority}
        variant="research-preview"
        wrapperClassName="overflow-hidden rounded-[10px] border border-card-border bg-card shadow-sm"
        className="w-full bg-card"
      />
    );
  }

  if (!hasDocument) return null;

  return (
    <Link
      href={`/post/${post.slug}`}
      aria-label={`View ${title} manuscript`}
      className={`relative block aspect-[3/4] overflow-hidden rounded-[10px] border border-card-border bg-card p-3 shadow-sm transition-colors hover:border-purple-accent ${FOCUS_RING}`}
    >
      <span className="text-[8px] font-bold uppercase tracking-[0.14em] text-purple-accent">
        PDF manuscript
      </span>
      <span className="mt-2 block font-display line-clamp-4 text-[13px] font-semibold leading-[1.18] text-ink">
        {title}
      </span>
      <span className="absolute inset-x-3 bottom-3 space-y-1.5" aria-hidden="true">
        <span className="block h-1 rounded-full bg-divider" />
        <span className="block h-1 w-5/6 rounded-full bg-divider" />
        <span className="block h-1 w-3/5 rounded-full bg-divider" />
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

  // Spacing alone, no rule and no panel. The `border-t` this used to draw sat
  // a few pixels above the row's own bottom hairline, so a research row ended
  // in two parallel lines -- the boxed-in look the flat feed exists to remove.
  // Boxing it instead was the other obvious fix and is the wrong one: the
  // research layout is deliberately metadata-first with no PDF sub-card (see
  // the note on the research section of /dev-preview/feed), and a bordered
  // panel here would rebuild exactly the sub-card that decision removed.
  return (
    <div className="mt-3 flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="flex h-[25px] w-[22px] shrink-0 items-center justify-center rounded-[3px] bg-purple-accent text-[7px] font-bold tracking-wide text-card"
      >
        PDF
      </span>
      <span className="min-w-0 truncate text-meta text-ink-muted">
        PDF manuscript{size ? ` · ${size}` : ""}
      </span>
      <span className="flex-1" />
      <Link
        href={`/post/${post.slug}`}
        aria-label="View paper"
        className={`inline-flex min-h-10 shrink-0 items-center rounded-md px-1.5 text-meta font-bold text-purple-accent hover:underline ${FOCUS_RING}`}
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
    <article className={CARD_SHELL} data-content-kind="research">
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

      {/* Side-by-side only from `sm` up. On a 375px phone the old two-column
          grid left the title roughly 199px -- about 16 characters a line of
          21px Bodoni, clamped to four lines -- so the single densest piece of
          text in the feed got its narrowest column. Below `sm` the text block
          now spans the full card and the preview is dropped; the manuscript
          row underneath still states that a PDF exists and links to it. */}
      <div
        className={`mt-3 min-w-0 ${
          hasPreview
            ? "sm:grid sm:grid-cols-[minmax(0,1fr)_170px] sm:items-start sm:gap-5"
            : ""
        }`}
      >
        <div className="min-w-0">
          <p className="text-kicker font-bold uppercase text-purple-accent">
            <span>Research</span>
            {evidence ? (
              <>
                <span aria-hidden="true"> · </span>
                <span>{evidence}</span>
              </>
            ) : null}
          </p>
          <Link href={`/post/${post.slug}`} className={`group block ${FOCUS_RING}`}>
            <h2 className="mt-2 font-display line-clamp-4 text-headline font-semibold text-ink transition-colors group-hover:text-emerald-ink motion-reduce:transition-none">
              {title}
            </h2>
          </Link>
          {abstract ? (
            <p
              className={`${
                hasPreview ? "sm:line-clamp-3" : ""
              } mt-2.5 line-clamp-4 max-w-measure text-excerpt text-ink-soft`}
            >
              {abstract}
            </p>
          ) : null}
          {coauthors.length > 0 ? (
            <p className="mt-2 line-clamp-2 text-meta text-ink-muted">
              with {coauthors.join(", ")}
            </p>
          ) : null}
          <TopicLinks tags={post.tags} />
        </div>

        {hasPreview ? (
          <div className="hidden sm:block">
            <ResearchDocumentPreview post={post} title={title} priority={priority} />
          </div>
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
