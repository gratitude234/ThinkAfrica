import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { postPageRepository } from "@/lib/db/readAdapter";
import {
  getPostAuthor,
  getPostBySlug,
  type AuthorProfile,
  type PostRecord,
} from "@/lib/postBySlug";
import { getCurrentUser } from "@/lib/serverAuth";
import { SITE_URL, canonicalPath, absoluteUrl } from "@/lib/site";
import UserAvatar from "@/components/ui/UserAvatar";
import FollowButton from "@/components/ui/FollowButton";
import {
  formatRelativeTime,
  sanitizePostExcerpt,
  getPostMetaDescription,
} from "@/lib/utils";
import { PostEngagementProvider } from "./PostEngagementContext";
import ViewTracker from "./ViewTracker";
import { createPostEngagementToken } from "@/lib/postEngagementToken";
import ReadingProgressBar from "./ReadingProgressBar";
import ReadingBar from "./ReadingBar";
import AuthorBioCard from "./AuthorBioCard";
import BodyContents from "./BodyContents";
import BackLink from "@/components/ui/BackLink";
import HighlightShare from "./HighlightShare";
import PublishedToast from "./PublishedToast";
import AudioSummaryPlayer from "@/components/post/AudioSummaryPlayer";
import PostCover from "@/components/post/PostCover";
import { formatTagLabel } from "@/lib/tags";
import ReportButton from "@/components/moderation/ReportButton";
import PostConversationView from "./PostConversationView";
import DiscussionSection from "./DiscussionSection";
import PostActionsRow from "./PostActionsRow";
import { sanitizePostHtml } from "@/lib/sanitizePostHtml";
import { earnsDropCap, stripLeadingEmptyParagraphs } from "@/lib/articleTypography";
import { getPostDisplayTitle, getPostMetadataTitle } from "@/lib/postDisplay";
import { resolveContentKind } from "@/lib/contentModel";

interface PageProps {
  params: Promise<{ slug: string }>;
}

interface ReferenceRecord {
  id: string;
  title: string | null;
  authors: string | null;
  year: number | null;
  source: string | null;
  doi: string | null;
  url: string | null;
}

interface CoAuthorRecord {
  user_id: string;
  display_order: number;
  corresponding_author: boolean;
  accepted_at: string | null;
  profile: {
    username: string;
    full_name: string | null;
  } | null;
}

interface RelatedPost {
  id: string;
  title: string | null;
  slug: string;
  content_kind?: string | null;
  published_at: string | null;
  created_at: string;
  cover_image_url: string | null;
  profiles: { full_name: string | null; username: string } | null;
}

interface PostNavigationItem {
  id: string;
  title: string | null;
  slug: string;
}

interface SecondaryData {
  references: ReferenceRecord[];
  coAuthors: CoAuthorRecord[];
  commentCount: number;
  reviews: Array<{
    assigned_at: string | null;
    submitted_at: string | null;
    recommendation: string | null;
    round: number | null;
  }>;
  decisions: Array<{ decision: string | null; created_at: string | null; round: number | null }>;
  versions: Array<{ id: string; version_kind: string | null; round: number | null; created_at: string | null }>;
  likeCount: number;
  bookmarkCount: number;
  relatedPosts: RelatedPost[];
  previousPost: PostNavigationItem | null;
  nextPost: PostNavigationItem | null;
}

interface ViewerData {
  userLiked: boolean;
  userBookmarked: boolean;
  userFollowsAuthor: boolean;
}

function estimateReadTime(content: string): number {
  const text = content.replace(/<[^>]*>/g, " ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function countWords(content: string): number {
  return content.replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

interface BodyHeading {
  id: string;
  text: string;
  level: number;
}

/**
 * Stamps an id on every h2/h3 in the body *and* hands back the list.
 *
 * BodyContents reads the list to render the Article contents; the ids are
 * what its links jump to.
 */
function injectHeadingIds(content: string): { html: string; headings: BodyHeading[] } {
  const headings: BodyHeading[] = [];
  let index = 0;

  const html = content.replace(
    /<h([23])([^>]*)>([\s\S]*?)<\/h[23]>/gi,
    (_match, level: string, attrs: string, inner: string) => {
      const id = `heading-${index++}`;
      const text = inner
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .trim();
      if (text) headings.push({ id, text, level: Number.parseInt(level, 10) });
      return `<h${level}${attrs} id="${id}">${inner}</h${level}>`;
    }
  );

  return { html, headings };
}

function renderReferenceShortcodes(content: string): string {
  return content.replace(
    /\[ref:([a-zA-Z0-9-]+)\]/g,
    (_match, referenceKey: string) => {
      if (/^\d+$/.test(referenceKey)) {
        return `<sup><a href="#ref-${referenceKey}" class="no-underline">[${referenceKey}]</a></sup>`;
      }
      return `<sup><a href="#ref-id-${referenceKey}" class="no-underline" aria-label="Jump to cited source">[source]</a></sup>`;
    }
  );
}

function buildArticleJsonLd({
  post,
  description,
  authorName,
}: {
  post: PostRecord;
  description: string;
  authorName: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: getPostMetadataTitle(post, { full_name: authorName }),
    description,
    datePublished: post.published_at ?? post.created_at,
    author: { "@type": "Person", name: authorName },
    ...(post.cover_image_url ? { image: [post.cover_image_url] } : {}),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": absoluteUrl(`/post/${post.slug}`),
    },
  };
}

function ArticleJsonLd({ data }: { data: ReturnType<typeof buildArticleJsonLd> }) {
  return (
    <script
      type="application/ld+json"
      // Escaping "<" prevents a title/description containing "</script>"
      // from breaking out of this script tag when embedded in the HTML.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

async function getSecondaryData(
  postId: string,
  tags: string[],
  isPublished: boolean,
  publishedAt: string | null,
  viewerId: string | null
): Promise<SecondaryData> {
  const supabase = await createClient();

  const [
    { count: likeCount },
    { data: referencesRaw },
    { data: coAuthorsRaw },
    { data: reviewsRaw },
    { data: decisionsRaw },
    { data: versionsRaw },
    commentCount,
    { count: bookmarkCount },
    relatedResult,
    previousPostResult,
    nextPostResult,
  ] = await (async () => {
    // Fifteen PostgREST round trips became four statements against the same
    // database. The repository decides which backend answers; see
    // lib/db/readAdapter.ts.
    const repository = postPageRepository(supabase);

    const [counts, collections, related, neighbours] =
      await Promise.all([
        repository.counts(postId),
        repository.collections(postId, viewerId),
        isPublished && tags.length > 0
          ? repository.related(postId, tags, 3, viewerId)
          : Promise.resolve([]),
        isPublished && publishedAt
          ? repository.neighbours(postId, publishedAt)
          : Promise.resolve({ previous: null, next: null }),
      ]);

    // Shaped to what the page below already destructures, so the rendering
    // code is untouched by the move.
    return [
      { count: counts.likeCount },
      { data: collections.references },
      { data: collections.coAuthors },
      { data: collections.reviews },
      { data: collections.decisions },
      { data: collections.versions },
      counts.commentCount,
      { count: counts.bookmarkCount },
      { data: related },
      { data: neighbours.previous },
      { data: neighbours.next },
    ] as const;
  })();

  const coAuthors = ((coAuthorsRaw ?? []) as Array<
    Omit<CoAuthorRecord, "profile"> & {
      profile:
        | { username: string; full_name: string | null }
        | Array<{ username: string; full_name: string | null }>
        | null;
    }
  >).map((item) => ({
    ...item,
    profile: Array.isArray(item.profile) ? item.profile[0] ?? null : item.profile,
  }));

  const relatedPosts = ((relatedResult.data ?? []) as Array<
    Omit<RelatedPost, "profiles"> & {
      profiles:
        | { full_name: string | null; username: string }
        | Array<{ full_name: string | null; username: string }>
        | null;
    }
  >).map((item) => ({
    ...item,
    profiles: Array.isArray(item.profiles) ? item.profiles[0] ?? null : item.profiles,
  }));

  return {
    references: (referencesRaw ?? []) as ReferenceRecord[],
    coAuthors,
    commentCount,
    reviews: (reviewsRaw ?? []) as Array<{
      assigned_at: string | null;
      submitted_at: string | null;
      recommendation: string | null;
      round: number | null;
    }>,
    decisions: (decisionsRaw ?? []) as Array<{
      decision: string | null;
      created_at: string | null;
      round: number | null;
    }>,
    versions: (versionsRaw ?? []) as Array<{
      id: string;
      version_kind: string | null;
      round: number | null;
      created_at: string | null;
    }>,
    likeCount: likeCount ?? 0,
    bookmarkCount: bookmarkCount ?? 0,
    relatedPosts,
    previousPost: (previousPostResult.data as PostNavigationItem | null) ?? null,
    nextPost: (nextPostResult.data as PostNavigationItem | null) ?? null,
  };
}

async function getViewerData({
  postId,
  userId,
  authorId,
  supabase,
}: {
  postId: string;
  userId: string | null;
  authorId: string | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
}): Promise<ViewerData> {
  if (!userId) {
    return {
      userLiked: false,
      userBookmarked: false,
      userFollowsAuthor: false,
    };
  }

  // Three maybeSingle() round trips became three `exists` in one row. The
  // viewer id is the one the server resolved; a direct connection has no
  // auth.uid() to fall back on, which is the point.
  const viewerState = await postPageRepository(supabase).viewerState(
    postId,
    userId,
    authorId ?? null
  );

  const existingLike = viewerState.liked;
  const existingBookmark = viewerState.bookmarked;
  const followData = viewerState.following;

  return {
    userLiked: Boolean(existingLike),
    userBookmarked: Boolean(existingBookmark),
    userFollowsAuthor: Boolean(followData),
  };
}

/**
 * The author's own labels for the piece, and the reader's route into
 * /topics/[tag]. The editorial template rendered none at all: tags were mapped
 * in the research branch only, so an essay, a blog post or a policy brief was
 * the one page that could not link into the taxonomy it had just fed.
 */
function PostTags({ tags }: { tags: string[] | null }) {
  const labels = (tags ?? []).map((tag) => formatTagLabel(tag)).filter(Boolean);
  if (labels.length === 0) return null;

  return (
    <div className="mb-8 flex flex-wrap gap-2">
      {labels.map((tag) => (
        <Link
          key={tag}
          href={`/topics/${encodeURIComponent(tag)}`}
          className="rounded-full border border-card-border bg-surface px-3 py-1 text-meta text-ink-soft transition-colors hover:border-emerald-brand/40 hover:text-emerald-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          #{tag}
        </Link>
      ))}
    </div>
  );
}

function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="animate-pulse motion-reduce:animate-none space-y-3">
      <div className="h-4 w-24 rounded bg-gray-200" />
      {[...Array(rows)].map((_, index) => (
        <div key={index} className="h-4 rounded bg-canvas" />
      ))}
    </div>
  );
}

async function HeaderCoAuthors({
  authorId,
  secondaryDataPromise,
  mode = "magazine",
}: {
  authorId: string | null;
  secondaryDataPromise: Promise<SecondaryData>;
  mode?: "editorial" | "magazine";
}) {
  const { coAuthors } = await secondaryDataPromise;
  const displayAuthors = coAuthors.filter((record) => record.user_id !== authorId);

  if (displayAuthors.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {displayAuthors.map((coAuthor) => (
        <Link
          key={coAuthor.user_id}
          href={`/${coAuthor.profile?.username}`}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            mode === "editorial"
              ? "border-card-border bg-canvas text-ink-soft hover:border-card-border-hover hover:text-ink"
              : "border-white/20 bg-surface/10 text-white/75 hover:border-white/30 hover:text-white"
          }`}
        >
          {coAuthor.corresponding_author ? "Corresponding / " : ""}
          {coAuthor.profile?.full_name ?? coAuthor.profile?.username}
        </Link>
      ))}
    </div>
  );
}

async function DetailAuthorRow({
  post,
  author,
  authorName,
  userId,
  viewerDataPromise,
}: {
  post: PostRecord;
  author: AuthorProfile | null;
  authorName: string;
  userId: string | null;
  viewerDataPromise: Promise<ViewerData>;
}) {
  if (!author) return null;
  const viewer = await viewerDataPromise;
  const isOwnPost = userId === author.id;

  return (
    <div className="mt-5 flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <Link href={`/${author.username}`} className="shrink-0">
          <UserAvatar
            name={authorName}
            src={author.avatar_url}
            size={48}
            className="overflow-hidden rounded-full"
          />
        </Link>
        <div className="min-w-0">
          <p className="text-excerpt leading-snug">
            <Link
              href={`/${author.username}`}
              className="font-bold text-ink transition-colors hover:text-emerald-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
            >
              {authorName}
            </Link>
            {author.university ? (
              <span className="text-ink-muted"> · {author.university}</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-meta leading-5 text-ink-muted">
            {formatRelativeTime(post.published_at ?? post.created_at)}
          </p>
        </div>
      </div>
      {isOwnPost ? null : (
        <FollowButton
          followingId={author.id}
          currentUserId={userId}
          initialFollowing={userId ? viewer.userFollowsAuthor : false}
          authorName={authorName}
          source="post_header"
          postId={post.id}
        />
      )}
    </div>
  );
}

async function PostReadingChrome({
  post,
  userId,
  isPublished,
  secondaryDataPromise,
  viewerDataPromise,
}: {
  post: PostRecord;
  userId: string | null;
  isPublished: boolean;
  secondaryDataPromise: Promise<SecondaryData>;
  viewerDataPromise: Promise<ViewerData>;
}) {
  if (!isPublished) return null;
  const [secondary, viewer] = await Promise.all([
    secondaryDataPromise,
    viewerDataPromise,
  ]);

  return (
    <ReadingBar
      postId={post.id}
      userId={userId}
      initialLiked={viewer.userLiked}
      initialLikeCount={secondary.likeCount}
      initialBookmarked={viewer.userBookmarked}
      title={getPostMetadataTitle(post)}
      slug={post.slug}
    />
  );
}

async function PostReferences({
  secondaryDataPromise,
}: {
  secondaryDataPromise: Promise<SecondaryData>;
}) {
  const { references } = await secondaryDataPromise;
  if (references.length === 0) return null;

  return (
    <section
      id="references"
      className="mb-8 scroll-mt-24 border-t border-[#EDE9E2] pt-6"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-kicker font-semibold uppercase text-ink-muted">
          Sources
        </h2>
        <span className="rounded-full bg-canvas px-3 py-1 text-kicker font-medium text-ink-soft">
          {references.length} listed
        </span>
      </div>
      <ol>
        {references.map((reference, index) => (
          <li
            key={reference.id}
            id={`ref-${index + 1}`}
            className="flex gap-3 border-t border-divider py-3 text-meta leading-relaxed text-ink-soft first:border-t-0"
          >
            <span
              id={`ref-id-${reference.id}`}
              className="sr-only"
              aria-hidden="true"
            />
            <span className="min-w-[2rem] shrink-0 font-bold text-emerald-ink">
              [{index + 1}]
            </span>
            <div>
              <p className="font-medium text-ink">{reference.title}</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {[reference.authors, reference.year, reference.source]
                  .filter(Boolean)
                  .join(" / ") || "Source details not provided"}
              </p>
              {reference.doi || reference.url ? (
                <p className="mt-1 text-xs">
                  {reference.doi ? (
                    <span className="mr-2 text-ink-muted">
                      DOI: {reference.doi}
                    </span>
                  ) : null}
                  {reference.url ? (
                    <a
                      href={reference.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-emerald-ink hover:underline"
                    >
                      Open source
                    </a>
                  ) : null}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

async function PostEngagementSection({
  post,
  author,
  userId,
  sanitizedExcerpt,
  secondaryDataPromise,
  viewerDataPromise,
}: {
  post: PostRecord;
  author: AuthorProfile | null;
  userId: string | null;
  sanitizedExcerpt: string | null;
  secondaryDataPromise: Promise<SecondaryData>;
  viewerDataPromise: Promise<ViewerData>;
}) {
  if (post.status !== "published") return null;
  const [secondary, viewer] = await Promise.all([
    secondaryDataPromise,
    viewerDataPromise,
  ]);

  return (
    <PostActionsRow
      postId={post.id}
      slug={post.slug}
      title={getPostMetadataTitle(post, author)}
      excerpt={sanitizedExcerpt}
      authorName={author?.full_name ?? null}
      userId={userId}
      initialLiked={viewer.userLiked}
      initialLikeCount={secondary.likeCount}
      initialBookmarked={viewer.userBookmarked}
      commentCount={secondary.commentCount}
      reportSlot={
        userId && author && userId !== author.id ? (
          <ReportButton
            targetType="post"
            targetId={post.id}
            targetLabel={`"${getPostMetadataTitle(post, author)}"`}
            variant="text"
          />
        ) : null
      }
    />
  );
}

async function AuthorSection({
  post,
  author,
  userId,
  secondaryDataPromise,
  viewerDataPromise,
}: {
  post: PostRecord;
  author: AuthorProfile | null;
  userId: string | null;
  secondaryDataPromise: Promise<SecondaryData>;
  viewerDataPromise: Promise<ViewerData>;
}) {
  if (!author) return null;
  const [secondary, viewer] = await Promise.all([
    secondaryDataPromise,
    viewerDataPromise,
  ]);
  // LEGACY COMPATIBILITY — existing co-authored publications.
  const primaryAuthorRecord =
    secondary.coAuthors.find((record) => record.user_id === author.id) ?? null;
  const coAuthors = secondary.coAuthors.filter((record) => record.user_id !== author.id);

  return (
    <AuthorBioCard
      author={author}
      postId={post.id}
      userId={userId}
      initialFollowing={viewer.userFollowsAuthor}
      isCorrespondingAuthor={primaryAuthorRecord?.corresponding_author ?? false}
      coAuthors={coAuthors
        .filter((coAuthor) => coAuthor.profile?.username)
        .map((coAuthor) => ({
          user_id: coAuthor.user_id,
          corresponding_author: coAuthor.corresponding_author,
          profile: {
            username: coAuthor.profile?.username ?? "",
            full_name: coAuthor.profile?.full_name ?? null,
          },
        }))}
    />
  );
}

async function PostContinueExploringSection({
  secondaryDataPromise,
}: {
  secondaryDataPromise: Promise<SecondaryData>;
}) {
  const { relatedPosts, previousPost, nextPost } = await secondaryDataPromise;

  if (relatedPosts.length === 0 && !previousPost && !nextPost) return null;

  return (
    <section className="mt-14 border-t border-card-border pt-6">
      {relatedPosts.length > 0 ? (
        <>
          <h3 className="text-kicker font-semibold uppercase text-ink-muted">
            More like this
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {relatedPosts.map((item) => (
              <Link
                key={item.id}
                href={`/post/${item.slug}`}
                className="group flex overflow-hidden rounded-lg border border-card-border bg-surface transition-all hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] sm:flex-col"
              >
                <div className="h-[92px] w-[112px] shrink-0 overflow-hidden sm:h-[96px] sm:w-full">
                  <PostCover
                    src={item.cover_image_url}
                    alt={getPostDisplayTitle(item)}
                    content_kind={item.content_kind}
                    sizes="200px"
                    className="h-full w-full"
                    imageClassName="object-cover"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col p-3">
                  <p className="line-clamp-2 text-meta font-semibold leading-snug text-ink transition-colors group-hover:text-emerald-brand">
                    {getPostMetadataTitle(item, item.profiles)}
                  </p>
                  <p className="mt-auto pt-2 text-kicker text-ink-muted">
                    {item.profiles?.full_name ?? item.profiles?.username}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      {previousPost || nextPost ? (
        <nav
          aria-label="Adjacent posts"
          className="mt-8 grid gap-4 border-t border-card-border pt-5 sm:grid-cols-2"
        >
          {previousPost ? (
            <Link
              href={`/post/${previousPost.slug}`}
              className="group min-w-0 transition-colors hover:text-emerald-brand"
            >
              <span className="block text-kicker font-semibold uppercase text-ink-muted">
                <span aria-hidden="true">&larr;</span> Previous
              </span>
              <span className="mt-1 line-clamp-2 text-sm font-medium text-ink-soft transition-colors group-hover:text-emerald-brand">
                {getPostMetadataTitle(previousPost)}
              </span>
            </Link>
          ) : null}
          {nextPost ? (
            <Link
              href={`/post/${nextPost.slug}`}
              className="group min-w-0 transition-colors hover:text-emerald-brand sm:col-start-2 sm:text-right"
            >
              <span className="block text-kicker font-semibold uppercase text-ink-muted">
                Next <span aria-hidden="true">&rarr;</span>
              </span>
              <span className="mt-1 line-clamp-2 text-sm font-medium text-ink-soft transition-colors group-hover:text-emerald-brand">
                {getPostMetadataTitle(nextPost)}
              </span>
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}

async function PostPublishSuccessSection({
  post,
  author,
  secondaryDataPromise,
}: {
  post: PostRecord;
  author: AuthorProfile | null;
  secondaryDataPromise: Promise<SecondaryData>;
}) {
  const { relatedPosts } = await secondaryDataPromise;
  const related = relatedPosts[0] ?? null;

  return (
    <PublishedToast
      postId={post.id}
      contentKind={resolveContentKind(post)}
      title={getPostMetadataTitle(post, author)}
      slug={post.slug}
      username={author?.username ?? ""}
      relatedTarget={
        related
          ? {
              id: related.id,
              title: getPostMetadataTitle(related, related.profiles),
              slug: related.slug,
            }
          : null
      }
    />
  );
}

// The discussion under the piece: comments and their replies.
async function PostDiscussion({
  post,
  userId,
  secondaryDataPromise,
}: {
  post: PostRecord;
  userId: string | null;
  secondaryDataPromise: Promise<SecondaryData>;
}) {
  const { commentCount } = await secondaryDataPromise;

  return (
    <DiscussionSection
      postId={post.id}
      userId={userId}
      userProfileId={userId}
      isPublished={post.status === "published"}
      commentCount={commentCount}
    />
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  // Both of these are memoised for this render, so the page component below
  // reuses them instead of asking the database and the auth server again.
  const [post, user] = await Promise.all([
    getPostBySlug(slug),
    getCurrentUser(),
  ]);

  if (!post) return { title: "Post not found - Indegenius" };
  if (
    (post.status === "draft" ||
      post.status === "pending" ||
      post.status === "pending_revision") &&
    user?.id !== post.author_id
  ) {
    return { title: "Post not found - Indegenius" };
  }

  const author = getPostAuthor(post);
  const authorLabel = author?.full_name ?? author?.username ?? "an Indegenius contributor";
  const metadataTitle = getPostMetadataTitle(post, author);
  const coverUrl = post.cover_image_url;
  const description = getPostMetaDescription({
    excerpt: post.excerpt,
    content: post.content,
    fallback: `Read this post by ${authorLabel} on Indegenius`,
  });
  // TODO(gratitude): confirm production domain — SITE_URL is a placeholder until then.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? SITE_URL;
  const ogImageUrl = `${appUrl}/api/og?${new URLSearchParams({
    title: metadataTitle,
    author: author?.full_name ?? "",
    university: author?.university ?? "",
    // The parameter keeps its name so an image cached against an existing
    // share URL still resolves; /api/og maps both vocabularies.
    type: resolveContentKind(post) ?? "post",
  }).toString()}`;
  const ogImage = coverUrl ?? ogImageUrl;

  return {
    title: `${metadataTitle} - Indegenius`,
    description,
    alternates: { canonical: canonicalPath(`/post/${post.slug}`) },
    openGraph: {
      title: metadataTitle,
      description,
      url: `${appUrl}/post/${post.slug}`,
      siteName: "Indegenius",
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: metadataTitle,
      description,
      images: [ogImage],
    },
  };
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  // generateMetadata() ran first and asked for exactly these two things, so
  // both are already resolved here. See lib/postBySlug.ts.
  const [post, user] = await Promise.all([
    getPostBySlug(slug),
    getCurrentUser(),
  ]);

  if (!post) notFound();

  if (post.status === "draft" && user?.id !== post.author_id) notFound();

  if (
    (post.status === "pending" || post.status === "pending_revision") &&
    user?.id !== post.author_id
  ) {
    const [
      { data: reviewAssignment, error: reviewAssignmentError },
      { data: coAuthorInvite, error: coAuthorInviteError },
    ] = await Promise.all([
      user
        ? supabase
            .from("post_reviews")
            .select("id")
            .eq("post_id", post.id)
            .eq("reviewer_id", user.id)
            .is("removed_at", null)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      user
        ? supabase
            .from("post_authors")
            .select("user_id")
            .eq("post_id", post.id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (reviewAssignmentError || coAuthorInviteError) {
      console.error(`[post/${slug}] visibility query failed`, {
        reviewAssignmentError,
        coAuthorInviteError,
      });
      throw new Error(`Failed to verify access for post "${slug}".`);
    }

    if (!reviewAssignment && !coAuthorInvite) notFound();
  }

  const isPublished = post.status === "published";
  const engagementToken = isPublished
    ? createPostEngagementToken(post.id, slug)
    : null;
  const author = getPostAuthor(post);
  const sanitizedContent = sanitizePostHtml(post.content);
  const sanitizedExcerpt = sanitizePostExcerpt(post.excerpt);
  const readTime = estimateReadTime(sanitizedContent);
  const wordCount = countWords(sanitizedContent);
  const { html: headedContent, headings: bodyHeadings } = injectHeadingIds(
    stripLeadingEmptyParagraphs(sanitizedContent)
  );
  const contentWithIds = renderReferenceShortcodes(headedContent);
  const authorName = author?.full_name ?? author?.username ?? "Anonymous";
  const displayTitle = getPostDisplayTitle(post);
  const metadataTitle = getPostMetadataTitle(post, author);
  const userId = user?.id ?? null;
  const secondaryDataPromise = getSecondaryData(
    post.id,
    post.tags ?? [],
    isPublished,
    post.published_at,
    userId
  );
  const viewerDataPromise = getViewerData({
    postId: post.id,
    userId,
    authorId: author?.id ?? null,
    supabase,
  });
  const resolvedKind = resolveContentKind(post);
  const articleJsonLd = isPublished
    ? buildArticleJsonLd({
        post,
        description: getPostMetaDescription({
          excerpt: post.excerpt,
          content: post.content,
          fallback: `Read this post by ${authorName} on Indegenius`,
        }),
        authorName,
      })
    : null;

  // Short, titleless Posts get a conversation view (content → actions →
  // comments), not the publication template below — see
  // PostConversationView.tsx.
  if (resolvedKind === "post") {
    return (
      <PostEngagementProvider postId={post.id} userId={userId} contentKind={resolvedKind}>
        <div className="relative">
          {articleJsonLd ? <ArticleJsonLd data={articleJsonLd} /> : null}
          {isPublished ? (
            <ViewTracker
              slug={slug}
              wordCount={wordCount}
              engagementToken={engagementToken}
            />
          ) : null}
          <Suspense fallback={<SectionSkeleton rows={6} />}>
            <PostConversationView
              post={post}
              author={author}
              userId={userId}
              bodyHtml={sanitizedContent}
              sanitizedExcerpt={sanitizedExcerpt}
              authorName={authorName}
              metadataTitle={metadataTitle}
              secondaryDataPromise={secondaryDataPromise}
              viewerDataPromise={viewerDataPromise}
            />
          </Suspense>
        </div>
      </PostEngagementProvider>
    );
  }

  return (
    <PostEngagementProvider postId={post.id} userId={userId} contentKind={resolvedKind}>
    <div className="relative">
    {articleJsonLd ? <ArticleJsonLd data={articleJsonLd} /> : null}
    {isPublished ? (
      <>
        <Suspense fallback={null}>
          <PostReadingChrome
            post={post}
            userId={userId}
            isPublished={isPublished}
            secondaryDataPromise={secondaryDataPromise}
            viewerDataPromise={viewerDataPromise}
          />
        </Suspense>
        {/* A scroll-progress affordance implies a long-form read; skip it
            for titleless lightweight Posts, which are short by design. */}
        {displayTitle ? <ReadingProgressBar /> : null}
        <ViewTracker
          slug={slug}
          wordCount={wordCount}
          engagementToken={engagementToken}
        />
      </>
    ) : null}

    <header className="mx-auto max-w-[680px] pb-2 pt-1 sm:pt-3">
      <div>
        {/* Real history, not a hardcoded "/". Arrive from a profile, a search
            result or a topic page and "Back to feed" was a lie. */}
        <BackLink className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2">
          <span aria-hidden="true">‹</span> Back
        </BackLink>

        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          <span className="rounded-full bg-gold-tint px-3 py-1 text-xs font-semibold text-gold-ink">
            Article
          </span>
          <span className="text-meta font-medium text-ink-muted">{readTime} min read</span>
        </div>

        {displayTitle ? (
          <h1 className="font-display mt-4 text-feature font-semibold tracking-[-0.02em] text-ink">
            {displayTitle}
          </h1>
        ) : null}

        <Suspense fallback={<div className="mt-5 h-12 animate-pulse motion-reduce:animate-none rounded-lg bg-canvas" />}>
          <DetailAuthorRow
            post={post}
            author={author}
            authorName={authorName}
            userId={userId}
            viewerDataPromise={viewerDataPromise}
          />
        </Suspense>

        <Suspense fallback={null}>
          <HeaderCoAuthors
            authorId={author?.id ?? null}
            secondaryDataPromise={secondaryDataPromise}
            mode="editorial"
          />
        </Suspense>
      </div>
    </header>

    {post.cover_image_url ? (
      <div className="mx-auto mt-6 max-w-[680px]">
        <PostCover
          src={post.cover_image_url}
          alt={post.title}
          content_kind={post.content_kind}
          sizes="(max-width: 720px) calc(100vw - 32px), 680px"
          priority
          className="aspect-[16/9] w-full rounded-[10px] border border-card-border bg-canvas"
          imageClassName="object-cover"
        />
      </div>
    ) : null}

    <div className="mx-auto max-w-[680px] pb-20 pt-8 sm:pt-10">
      <main className="min-w-0">
        <Suspense fallback={null}>
          <PostPublishSuccessSection
            post={post}
            author={author}
            secondaryDataPromise={secondaryDataPromise}
          />
        </Suspense>

        {post.status === "draft" ? (
          <div className="mb-6 rounded-xl border border-card-border bg-canvas p-4 text-sm text-ink-soft">
            This post is a <strong>draft</strong> and is only visible to you.{" "}
            <Link href={`/edit/${post.slug}`} className="font-semibold underline">
              Edit &amp; publish
            </Link>
          </div>
        ) : null}

        {post.audio_summary_url ? (
          <AudioSummaryPlayer audioUrl={post.audio_summary_url} />
        ) : null}

        <BodyContents headings={bodyHeadings} />

        <div
          className={`article-journal-body article-redesign-body relative mb-10 sm:mb-12${
            earnsDropCap(sanitizedContent) ? " has-dropcap" : ""
          }`}
        >
          <HighlightShare containerId="post-article-prose" />
          <div
            id="post-article-prose"
            className="article-journal-body prose prose-gray max-w-[680px] prose-lg prose-a:text-emerald-brand prose-headings:font-semibold prose-headings:tracking-normal prose-headings:text-ink"
            dangerouslySetInnerHTML={{ __html: contentWithIds }}
          />
        </div>

        <PostTags tags={post.tags} />

        <Suspense fallback={<SectionSkeleton rows={4} />}>
          <PostReferences secondaryDataPromise={secondaryDataPromise} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton rows={2} />}>
          <PostEngagementSection
            post={post}
            author={author}
            userId={userId}
            sanitizedExcerpt={sanitizedExcerpt}
            secondaryDataPromise={secondaryDataPromise}
            viewerDataPromise={viewerDataPromise}
          />
        </Suspense>

        {/* The comments come directly after the actions row. Nothing may
            sit between a reader finishing the piece and the conversation. */}
        <Suspense fallback={<SectionSkeleton rows={3} />}>
          <PostDiscussion
            post={post}
            userId={userId}
            secondaryDataPromise={secondaryDataPromise}
          />
        </Suspense>

        <div className="mt-14">
          <Suspense fallback={<SectionSkeleton rows={3} />}>
            <AuthorSection
              post={post}
              author={author}
              userId={userId}
              secondaryDataPromise={secondaryDataPromise}
              viewerDataPromise={viewerDataPromise}
            />
          </Suspense>
        </div>

        {isPublished ? (
          <Suspense fallback={<SectionSkeleton rows={3} />}>
            <PostContinueExploringSection
              secondaryDataPromise={secondaryDataPromise}
            />
          </Suspense>
        ) : null}
      </main>
    </div>
    </div>
    </PostEngagementProvider>
  );
}
