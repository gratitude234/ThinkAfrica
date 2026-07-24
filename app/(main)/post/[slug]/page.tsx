import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL, canonicalPath, absoluteUrl } from "@/lib/site";
import UserAvatar from "@/components/ui/UserAvatar";
import FollowButton from "@/components/ui/FollowButton";
import {
  formatDate,
  formatRelativeTime,
  POST_POINTS,
  sanitizePostExcerpt,
  getPostMetaDescription,
  type PostType,
} from "@/lib/utils";
import LikeButton from "./LikeButton";
import BookmarkButton from "./BookmarkButton";
import { PostEngagementProvider } from "./PostEngagementContext";
import ViewTracker from "./ViewTracker";
import ReadingProgressBar from "./ReadingProgressBar";
import ReadingBar from "./ReadingBar";
import ShareButtons from "./ShareButtons";
import AuthorBioCard from "./AuthorBioCard";
import TableOfContents from "./TableOfContents";
import HighlightShare from "./HighlightShare";
import PublishedToast from "./PublishedToast";
import CiteThis from "./CiteThis";
import CopyCitationIdButton from "./CopyCitationIdButton";
import AudioSummaryPlayer from "@/components/post/AudioSummaryPlayer";
import PostCover from "@/components/post/PostCover";
import CollaborationPanel from "@/components/collaboration/CollaborationPanel";
import ReportButton from "@/components/moderation/ReportButton";
import CredibilityPanel from "@/components/post/CredibilityPanel";
import HomeFeedCard from "@/components/post/HomeFeedCard";
import type { PostCardData } from "@/components/post/PostCard";
import { fetchResponseCards } from "@/lib/feedData";
import EditorialTrustPanel from "@/components/editorial/EditorialTrustPanel";
import ResponseStartLink from "@/components/post/ResponseStartLink";
import PostConversationView from "./PostConversationView";
import PostActionsRow from "./PostActionsRow";
import { getCollaborationSummary } from "@/lib/collaboration";
import { getMessageEligibility } from "@/lib/messaging";
import { getEditorialTrustSummary } from "@/lib/editorialTrust";
import { getPostQualitySummary } from "@/lib/postQuality";
import { sanitizePostHtml } from "@/lib/sanitizePostHtml";
import { getPostDisplayTitle, getPostMetadataTitle } from "@/lib/postDisplay";
import {
  getArticleFormatLabel,
  isFormallyReviewed,
  resolveArticleFormat,
  resolveContentKind,
} from "@/lib/contentModel";

interface PageProps {
  params: Promise<{ slug: string }>;
}

interface AuthorProfile {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  field_of_study: string | null;
  bio: string | null;
  avatar_url: string | null;
  verified?: boolean;
  verified_type?: string | null;
}

interface ParentPostRef {
  id: string;
  title: string | null;
  slug: string;
}

interface PostRecord {
  id: string;
  title: string | null;
  slug: string;
  content: string | null;
  excerpt: string | null;
  type: string;
  content_kind?: string | null;
  article_format?: string | null;
  tags: string[] | null;
  status: string;
  author_id: string;
  created_at: string;
  published_at: string | null;
  view_count: number | null;
  impression_count: number | null;
  read_count: number | null;
  cover_image_url: string | null;
  citation_id: string | null;
  published_version_id: string | null;
  current_round: number | null;
  revision_due_at: string | null;
  in_response_to: string | null;
  audio_summary_url: string | null;
  document_path: string | null;
  document_original_name: string | null;
  document_mime_type: string | null;
  document_size_bytes: number | null;
  profiles: AuthorProfile | AuthorProfile[] | null;
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
  type: string;
  content_kind?: string | null;
  article_format?: string | null;
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
  responseCards: PostCardData[];
  reviews: Array<{
    assigned_at: string | null;
    submitted_at: string | null;
    recommendation: string | null;
    round: number | null;
  }>;
  decisions: Array<{ decision: string | null; created_at: string | null; round: number | null }>;
  versions: Array<{ id: string; version_kind: string | null; round: number | null; created_at: string | null }>;
  likeCount: number;
  responseCount: number;
  bookmarkCount: number;
  relatedPosts: RelatedPost[];
  previousPost: PostNavigationItem | null;
  nextPost: PostNavigationItem | null;
}

interface ViewerData {
  userLiked: boolean;
  userBookmarked: boolean;
  userFollowsAuthor: boolean;
  messageEligibility: { eligible: boolean; reason: string | null } | null;
}

function estimateReadTime(content: string): number {
  const text = content.replace(/<[^>]*>/g, " ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function countWords(content: string): number {
  return content.replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

function injectHeadingIds(content: string): string {
  let index = 0;
  return content.replace(/<h([23])([^>]*)>(.*?)<\/h[23]>/gi, (_, level, attrs, text) => {
    const id = `heading-${index++}`;
    return `<h${level}${attrs} id="${id}">${text}</h${level}>`;
  });
}

function renderReferenceShortcodes(content: string): string {
  return content.replace(
    /\[ref:(\d+)\]/g,
    (_match, refNumber) =>
      `<sup><a href="#ref-${refNumber}" class="no-underline">[${refNumber}]</a></sup>`
  );
}

function getAuthor(post: PostRecord): AuthorProfile | null {
  return Array.isArray(post.profiles) ? post.profiles[0] ?? null : post.profiles;
}

// Evidence-based, not name-based: a post's type/kind says its workflow
// *requires* review, but only citation_id/published_version_id prove a
// specific record actually completed it (see lib/contentModel.ts).
function isReviewedWork(post: { citation_id?: string | null; published_version_id?: string | null }) {
  return isFormallyReviewed(post);
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

function formatDocumentSize(value: number | null | undefined) {
  if (!value) return null;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatResearchStatus(status: string) {
  const labels: Record<string, string> = {
    draft: "Draft",
    pending: "Under review",
    pending_revision: "Revision requested",
    published: "Published",
  };

  return labels[status] ?? status.replace(/_/g, " ");
}

function getResearchStatusTone(status: string) {
  if (status === "published") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "pending_revision") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "pending") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-gray-200 bg-gray-50 text-gray-700";
}

function getVersionKindLabel(value: string | null | undefined) {
  if (!value) return "Submission";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function throwPostQueryError(slug: string, stage: "metadata" | "page", error: unknown): never {
  console.error(`[post/${slug}] ${stage} query failed`, error);
  throw new Error(`Failed to load post "${slug}".`);
}

function getFullQualitySummary({
  post,
  author,
  sanitizedContent,
  wordCount,
  parentPostId,
  secondary,
}: {
  post: PostRecord;
  author: AuthorProfile | null;
  sanitizedContent: string;
  wordCount: number;
  parentPostId: string | null;
  secondary: SecondaryData;
}) {
  return getPostQualitySummary({
    type: post.type,
    content_kind: post.content_kind,
    article_format: post.article_format,
    status: post.status,
    title: post.title,
    excerpt: post.excerpt,
    content: sanitizedContent,
    wordCount,
    tags: post.tags ?? [],
    citationId: post.citation_id ?? null,
    isResponse: Boolean(parentPostId),
    author,
    referenceCount: secondary.references.length,
    responseCount: secondary.responseCount,
    reviewCount: secondary.reviews.length,
    completedReviewCount: secondary.reviews.filter((review) =>
      Boolean(review.submitted_at)
    ).length,
    likeCount: secondary.likeCount,
    bookmarkCount: secondary.bookmarkCount,
  });
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
    responseCards,
    { data: reviewsRaw },
    { data: decisionsRaw },
    { data: versionsRaw },
    { count: responseCount },
    { count: bookmarkCount },
    relatedResult,
    previousPostResult,
    nextPostResult,
  ] = await Promise.all([
    supabase
      .from("likes")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId),
    supabase
      .from("post_references")
      .select("*")
      .eq("post_id", postId)
      .order("display_order", { ascending: true }),
    supabase
      .from("post_authors")
      .select(
        "user_id, display_order, corresponding_author, accepted_at, profile:profiles!post_authors_user_id_fkey(username, full_name)"
      )
      .eq("post_id", postId)
      .not("accepted_at", "is", null)
      .order("display_order", { ascending: true }),
    fetchResponseCards(supabase, postId, viewerId),
    supabase
      .from("post_reviews")
      .select("assigned_at, submitted_at, recommendation, round")
      .eq("post_id", postId)
      .is("removed_at", null),
    supabase
      .from("post_editor_decisions")
      .select("decision, created_at, round")
      .eq("post_id", postId)
      .order("created_at", { ascending: false }),
    supabase
      .from("post_versions")
      .select("id, version_kind, round, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true }),
    supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("in_response_to", postId)
      .eq("status", "published"),
    supabase
      .from("bookmarks")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId),
    isPublished && tags.length > 0
      ? supabase
          .from("posts")
          .select(
            "id, title, slug, type, content_kind, article_format, published_at, created_at, cover_image_url, profiles!posts_author_id_fkey (full_name, username)"
          )
          .eq("status", "published")
          .neq("id", postId)
          .overlaps("tags", tags)
          .order("published_at", { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [], error: null }),
    isPublished && publishedAt
      ? supabase
          .from("posts")
          .select("id, title, slug")
          .eq("status", "published")
          .neq("id", postId)
          .lt("published_at", publishedAt)
          .order("published_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isPublished && publishedAt
      ? supabase
          .from("posts")
          .select("id, title, slug")
          .eq("status", "published")
          .neq("id", postId)
          .gt("published_at", publishedAt)
          .order("published_at", { ascending: true })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

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
    responseCards,
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
    responseCount: responseCount ?? 0,
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
      messageEligibility: null,
    };
  }

  const [
    { data: existingLike },
    { data: existingBookmark },
    { data: followData },
    messageEligibility,
  ] = await Promise.all([
    supabase
      .from("likes")
      .select("user_id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("bookmarks")
      .select("user_id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle(),
    authorId
      ? supabase
          .from("follows")
          .select("follower_id")
          .eq("follower_id", userId)
          .eq("following_id", authorId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    authorId
      ? getMessageEligibility(supabase, userId, authorId)
      : Promise.resolve(null),
  ]);

  return {
    userLiked: Boolean(existingLike),
    userBookmarked: Boolean(existingBookmark),
    userFollowsAuthor: Boolean(followData),
    messageEligibility,
  };
}

function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 w-24 rounded bg-gray-200" />
      {[...Array(rows)].map((_, index) => (
        <div key={index} className="h-4 rounded bg-gray-100" />
      ))}
    </div>
  );
}

async function ParentPostLink({
  parentPostId,
  mode = "magazine",
}: {
  parentPostId: string | null;
  mode?: "editorial" | "magazine";
}) {
  if (!parentPostId) return null;
  const supabase = await createClient();
  const { data: parentPost, error } = await supabase
    .from("posts")
    .select("id, title, slug")
    .eq("id", parentPostId)
    .eq("status", "published")
    .maybeSingle();

  if (error || !parentPost) return null;

  return (
    <Link
      href={`/post/${(parentPost as ParentPostRef).slug}`}
      className={`mb-4 inline-flex items-center gap-1.5 text-sm transition-colors ${
        mode === "editorial"
          ? "text-ink-muted hover:text-ink"
          : "text-white/60 hover:text-white"
      }`}
    >
      <span aria-hidden="true">{"\u21A9"}</span>
      <span>
        In response to:{" "}
        <span className={`font-medium ${mode === "editorial" ? "text-ink" : "text-white/80"}`}>
          {getPostDisplayTitle(parentPost as ParentPostRef) ?? "this post"}
        </span>
      </span>
    </Link>
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
              ? "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:text-gray-900"
              : "border-white/20 bg-white/10 text-white/75 hover:border-white/30 hover:text-white"
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
  showCoAuthors = false,
  secondaryDataPromise,
  viewerDataPromise,
}: {
  post: PostRecord;
  author: AuthorProfile | null;
  authorName: string;
  userId: string | null;
  /** Research shows a "with Co-Author, Co-Author" line under the lead author. */
  showCoAuthors?: boolean;
  secondaryDataPromise: Promise<SecondaryData>;
  viewerDataPromise: Promise<ViewerData>;
}) {
  if (!author) return null;
  const [secondary, viewer] = await Promise.all([
    secondaryDataPromise,
    viewerDataPromise,
  ]);
  const coAuthorNames = showCoAuthors
    ? (secondary.coAuthors
        .filter((record) => record.user_id !== author.id)
        .map((record) => record.profile?.full_name ?? record.profile?.username)
        .filter(Boolean) as string[])
    : [];
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
          <p className="text-[15px] leading-snug">
            <Link
              href={`/${author.username}`}
              className="font-bold text-ink transition-colors hover:text-emerald-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
            >
              {authorName}
            </Link>
            {author.university ? (
              <span className="text-gray-500"> · {author.university}</span>
            ) : null}
          </p>
          {coAuthorNames.length > 0 ? (
            <p className="mt-0.5 text-[13px] leading-5 text-gray-500">
              with {coAuthorNames.join(", ")}
            </p>
          ) : null}
          <p className="mt-0.5 text-[13px] leading-5 text-gray-400">
            {formatRelativeTime(post.published_at ?? post.created_at)}
          </p>
        </div>
      </div>
      {isOwnPost ? null : userId ? (
        <FollowButton
          followerId={userId}
          followingId={author.id}
          initialFollowing={viewer.userFollowsAuthor}
          variant="solid"
        />
      ) : (
        <Link
          href={`/login?redirectTo=${encodeURIComponent(`/post/${post.slug}`)}`}
          className="shrink-0 rounded-lg bg-emerald-brand px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37]"
        >
          Follow
        </Link>
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

async function PostReviewStatusPanel({
  post,
  secondaryDataPromise,
}: {
  post: PostRecord;
  secondaryDataPromise: Promise<SecondaryData>;
}) {
  if (post.status !== "pending" && post.status !== "pending_revision") return null;

  const { references, reviews, decisions, versions } = await secondaryDataPromise;
  const summary = getEditorialTrustSummary({
    type: post.type,
    status: post.status,
    currentRound: post.current_round ?? 1,
    createdAt: post.created_at,
    publishedAt: post.published_at,
    revisionDueAt: post.revision_due_at,
    citationId: post.citation_id,
    publishedVersionId: post.published_version_id,
    referenceCount: references.length,
    reviews,
    decisions,
    versionCount: versions.length,
  });

  if (!summary.applies) return null;

  return (
    <div className="mb-6">
      <EditorialTrustPanel
        summary={summary}
        title="Editorial review status"
        description={
          post.status === "pending_revision"
            ? "Reviewers have requested changes. Use the button to edit and resubmit — your revisions will be tracked as a new round."
            : "You'll be notified when reviewers submit feedback or an editor makes a decision. This timeline updates automatically."
        }
        actionHref={
          post.status === "pending_revision"
            ? post.type === "research"
              ? `/submit/research?draft=${post.id}`
              : `/edit/${post.slug}`
            : "/dashboard"
        }
        actionSource="post_editorial_status"
        actionKey="editorial_review_status"
      />
    </div>
  );
}

async function PostReferencesAndCitation({
  post,
  author,
  secondaryDataPromise,
}: {
  post: PostRecord;
  author: AuthorProfile | null;
  secondaryDataPromise: Promise<SecondaryData>;
}) {
  const { references, coAuthors } = await secondaryDataPromise;
  const citationAuthors = (
    coAuthors.length > 0
      ? coAuthors.map((authorRecord) => ({
          full_name: authorRecord.profile?.full_name ?? null,
          username: authorRecord.profile?.username ?? "author",
        }))
      : author
        ? [
            {
              full_name: author.full_name ?? null,
              username: author.username,
            },
          ]
        : []
  ) as Array<{ full_name: string | null; username: string }>;

  return (
    <>
      {references.length > 0 ? (
        <section
          id="references"
          className="mb-8 scroll-mt-24 border-t border-[#EDE9E2] pt-6"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
              References
            </h2>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-medium text-gray-600">
              {references.length} listed
            </span>
          </div>
          <ol>
            {references.map((reference, index) => (
              <li
                key={reference.id}
                id={`ref-${index + 1}`}
                className="flex gap-3 border-t border-gray-100 py-3 text-[13px] leading-relaxed text-gray-600 first:border-t-0"
              >
                <span className="min-w-[2rem] shrink-0 font-bold text-emerald-600">
                  [{index + 1}]
                </span>
                <div>
                  <p className="font-medium text-gray-900">{reference.title}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {[reference.authors, reference.year, reference.source]
                      .filter(Boolean)
                      .join(" / ") || "Reference details not provided"}
                  </p>
                  {reference.doi || reference.url ? (
                    <p className="mt-1 text-xs">
                      {reference.doi ? (
                        <span className="mr-2 text-gray-500">
                          DOI: {reference.doi}
                        </span>
                      ) : null}
                      {reference.url ? (
                        <a
                          href={reference.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-emerald-700 hover:underline"
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
      ) : null}

      {post.status === "published" && post.citation_id ? (
        <div className="mb-8">
          <CiteThis
            citationId={post.citation_id}
            citationPath={`/publication/${post.citation_id}`}
            title={getPostMetadataTitle(post, author)}
            publishedAt={post.published_at ?? post.created_at}
            authors={citationAuthors}
          />
        </div>
      ) : null}
    </>
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
    <div className="mb-9">
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
      />
      {userId && author && userId !== author.id ? (
        <p className="mt-2 text-right">
          <ReportButton
            targetType="post"
            targetId={post.id}
            targetLabel={`"${getPostMetadataTitle(post, author)}"`}
            variant="text"
            className="text-xs text-gray-400 hover:text-red-600"
          />
        </p>
      ) : null}
    </div>
  );
}

async function AuthorAndCollaborationSection({
  post,
  author,
  userId,
  authorName,
  secondaryDataPromise,
  viewerDataPromise,
  showCollaboration = true,
}: {
  post: PostRecord;
  author: AuthorProfile | null;
  userId: string | null;
  authorName: string;
  secondaryDataPromise: Promise<SecondaryData>;
  viewerDataPromise: Promise<ViewerData>;
  showCollaboration?: boolean;
}) {
  if (!author) return null;
  const [secondary, viewer] = await Promise.all([
    secondaryDataPromise,
    viewerDataPromise,
  ]);
  const primaryAuthorRecord =
    secondary.coAuthors.find((record) => record.user_id === author.id) ?? null;
  const coAuthors = secondary.coAuthors.filter((record) => record.user_id !== author.id);
  const collaborationSummary = getCollaborationSummary({
    postId: post.id,
    postSlug: post.slug,
    authorId: author.id,
    viewerId: userId,
    responseCount: secondary.responseCount,
    coauthorCount: coAuthors.length,
    isFollowingAuthor: viewer.userFollowsAuthor,
    messageEligible: viewer.messageEligibility?.eligible ?? false,
    messageReason: viewer.messageEligibility?.reason ?? null,
  });

  return (
    <>
      <AuthorBioCard
        author={author}
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
      {showCollaboration && post.status === "published" ? (
        <div className="mt-6">
          <CollaborationPanel summary={collaborationSummary} authorName={authorName} />
        </div>
      ) : null}
    </>
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
    <section className="my-9 border-t border-gray-200 pt-6">
      {relatedPosts.length > 0 ? (
        <>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            More like this
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {relatedPosts.map((item) => (
              <Link
                key={item.id}
                href={`/post/${item.slug}`}
                className="group flex overflow-hidden rounded-lg border border-gray-200 bg-white transition-all hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] sm:flex-col"
              >
                <div className="h-[92px] w-[112px] shrink-0 overflow-hidden sm:h-[96px] sm:w-full">
                  <PostCover
                    src={item.cover_image_url}
                    alt={getPostDisplayTitle(item)}
                    type={item.type}
                    content_kind={item.content_kind}
                    article_format={item.article_format}
                    sizes="200px"
                    className="h-full w-full"
                    imageClassName="object-cover"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col p-3">
                  <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-gray-900 transition-colors group-hover:text-emerald-brand">
                    {getPostMetadataTitle(item, item.profiles)}
                  </p>
                  <p className="mt-auto pt-2 text-[10px] text-gray-400">
                    {item.profiles?.full_name ?? item.profiles?.username}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      {previousPost || nextPost ? (
        <div className="mt-5 flex items-center justify-between gap-4 text-sm">
          {previousPost ? (
            <Link
              href={`/post/${previousPost.slug}`}
              className="group min-w-0 text-gray-500 transition-colors hover:text-emerald-brand"
            >
              <span aria-hidden="true">&larr; </span>
              <span className="font-medium">{getPostMetadataTitle(previousPost)}</span>
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
          {nextPost ? (
            <Link
              href={`/post/${nextPost.slug}`}
              className="group min-w-0 text-right text-gray-500 transition-colors hover:text-emerald-brand"
            >
              <span className="font-medium">{getPostMetadataTitle(nextPost)}</span>
              <span aria-hidden="true"> &rarr;</span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

async function PostPublishSuccessSection({
  post,
  author,
  points,
  secondaryDataPromise,
}: {
  post: PostRecord;
  author: AuthorProfile | null;
  points: number;
  secondaryDataPromise: Promise<SecondaryData>;
}) {
  const { relatedPosts } = await secondaryDataPromise;
  const related = relatedPosts[0] ?? null;

  return (
    <PublishedToast
      postId={post.id}
      postType={post.type}
      title={getPostMetadataTitle(post, author)}
      slug={post.slug}
      points={points}
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

async function PostResponsesSection({
  post,
  author,
  userId,
  secondaryDataPromise,
}: {
  post: PostRecord;
  author: AuthorProfile | null;
  userId: string | null;
  secondaryDataPromise: Promise<SecondaryData>;
}) {
  const { responseCards, responseCount } = await secondaryDataPromise;
  const parentTitle = getPostMetadataTitle(post, author);
  const parentAuthor =
    author?.full_name ?? author?.username ?? "the author";

  return (
    <section id="responses" className="mt-10 scroll-mt-24">
      <h2 className="font-display mb-4 text-[20px] font-semibold text-ink">
        Responses{responseCount > 0 ? ` · ${responseCount}` : ""}
      </h2>

      {responseCards.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center sm:rounded-lg">
          <p className="text-[15px] text-gray-600">
            No responses yet. Be the first to weigh in.
          </p>
          <div className="mt-4 flex justify-center">
            <ResponseStartLink
              postId={post.id}
              source="responses_empty_state"
              userId={userId}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-emerald-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0a4d37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z" />
              </svg>
              Respond
            </ResponseStartLink>
          </div>
        </div>
      ) : (
        <div>
          {responseCards.map((response) => (
            <HomeFeedCard
              key={response.id}
              post={response}
              currentUserId={userId}
              surface="latest"
              respondingTo={{
                title: parentTitle,
                author: parentAuthor,
                slug: post.slug,
                authorUsername: author?.username ?? null,
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ResearchReviewTimeline({
  post,
  secondary,
}: {
  post: PostRecord;
  secondary: SecondaryData;
}) {
  const completedReviews = secondary.reviews.filter((review) => review.submitted_at);
  const latestDecision = secondary.decisions[0] ?? null;
  const latestVersion =
    secondary.versions.length > 0
      ? secondary.versions[secondary.versions.length - 1]
      : null;
  const reviewSummary =
    secondary.reviews.length > 0
      ? `${completedReviews.length}/${secondary.reviews.length} reviews complete`
      : "No reviewer activity recorded";
  const timeline = [
    {
      label: "Submission",
      value: formatDate(post.created_at),
      detail: latestVersion
        ? getVersionKindLabel(latestVersion.version_kind)
        : "Initial manuscript record",
    },
    {
      label: "Review",
      value: formatResearchStatus(post.status),
      detail: reviewSummary,
    },
    latestDecision
      ? {
          label: "Decision",
          value: getVersionKindLabel(latestDecision.decision),
          detail: latestDecision.created_at
            ? `Round ${latestDecision.round ?? post.current_round ?? 1} / ${formatDate(
                latestDecision.created_at
              )}`
            : `Round ${latestDecision.round ?? post.current_round ?? 1}`,
        }
      : null,
    post.status === "pending_revision" && post.revision_due_at
      ? {
          label: "Revision due",
          value: formatDate(post.revision_due_at),
          detail: `Round ${post.current_round ?? 1}`,
        }
      : null,
    post.citation_id
      ? {
          label: "Archive",
          value: "Citation issued",
          detail: post.citation_id,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string; detail: string }>;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-4 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
        Review timeline
      </h2>
      <div className="space-y-4">
        {timeline.map((item) => (
          <div key={`${item.label}-${item.value}`} className="flex gap-3">
            <span
              className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                {item.label}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-950">
                {item.value}
              </p>
              <p className="mt-0.5 break-words text-xs leading-5 text-slate-500">
                {item.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

async function ResearchDossierSidebar({
  post,
  author,
  userId,
  sanitizedContent,
  sanitizedExcerpt,
  wordCount,
  parentPostId,
  isPublished,
  secondaryDataPromise,
  viewerDataPromise,
}: {
  post: PostRecord;
  author: AuthorProfile | null;
  userId: string | null;
  sanitizedContent: string;
  sanitizedExcerpt: string | null;
  wordCount: number;
  parentPostId: string | null;
  isPublished: boolean;
  secondaryDataPromise: Promise<SecondaryData>;
  viewerDataPromise: Promise<ViewerData>;
}) {
  const [secondary, viewer] = await Promise.all([
    secondaryDataPromise,
    viewerDataPromise,
  ]);
  const summary = getFullQualitySummary({
    post,
    author,
    sanitizedContent,
    wordCount,
    parentPostId,
    secondary,
  });
  const dossierHeadings = [
    { id: "abstract", text: "Abstract", level: 2 },
    { id: "manuscript", text: "Manuscript PDF", level: 2 },
    ...(secondary.references.length > 0
      ? [{ id: "references", text: "References", level: 2 }]
      : []),
  ];

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24 space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Manuscript actions
          </h2>
          <div className="space-y-2 [&_a]:w-full [&_button]:w-full">
            {post.document_path ? (
              <a
                href={`/api/research-document/${post.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-brand px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37]"
              >
                Open PDF
              </a>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                PDF unavailable
              </div>
            )}
            {post.citation_id ? (
              <>
                <CopyCitationIdButton citationId={post.citation_id} />
                <Link
                  href={`/publication/${post.citation_id}`}
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-sky-700 transition-colors hover:bg-sky-50"
                >
                  Citation archive
                </Link>
              </>
            ) : null}
            {isPublished ? (
              <>
                <LikeButton
                  postId={post.id}
                  initialLiked={viewer.userLiked}
                  initialLikeCount={secondary.likeCount}
                  userId={userId}
                />
                <BookmarkButton
                  postId={post.id}
                  initialBookmarked={viewer.userBookmarked}
                  userId={userId}
                />
                <ShareButtons
                  title={getPostMetadataTitle(post, author)}
                  slug={post.slug}
                  excerpt={sanitizedExcerpt}
                  authorName={author?.full_name ?? null}
                />
                <ResponseStartLink
                  postId={post.id}
                  source="research_dossier_sidebar"
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-emerald-brand px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37]"
                >
                  Write a response
                </ResponseStartLink>
              </>
            ) : null}
          </div>
        </section>

        <CredibilityPanel postId={post.id} summary={summary} isPublished={isPublished} userId={userId} />
        <ResearchReviewTimeline post={post} secondary={secondary} />
        <TableOfContents headings={dossierHeadings} />

        {author ? (
          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="font-display text-[15px] font-semibold text-ink">
              Follow this researcher
            </h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-gray-500">
              Get new research by {author.full_name ?? author.username} in your feed.
            </p>
            <div className="mt-3">
              {userId && userId !== author.id ? (
                <FollowButton
                  followerId={userId}
                  followingId={author.id}
                  initialFollowing={viewer.userFollowsAuthor}
                />
              ) : userId === author.id ? (
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition-colors hover:bg-canvas"
                >
                  View dashboard
                </Link>
              ) : (
                <Link
                  href={`/login?redirectTo=${encodeURIComponent(`/post/${post.slug}`)}`}
                  className="inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-emerald-brand px-3 text-xs font-semibold text-white transition-colors hover:bg-[#0E4B37]"
                >
                  Follow researcher
                </Link>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select(
      "title, excerpt, content, cover_image_url, slug, status, author_id, type, profiles!posts_author_id_fkey(full_name, username, university)"
    )
    .eq("slug", slug)
    .in("status", ["published", "pending", "pending_revision", "draft"])
    .maybeSingle();

  if (postError) {
    throwPostQueryError(slug, "metadata", postError);
  }

  if (!post) return { title: "Post not found - Indegenius" };
  if (
    (post.status === "draft" ||
      post.status === "pending" ||
      post.status === "pending_revision") &&
    user?.id !== post.author_id
  ) {
    return { title: "Post not found - Indegenius" };
  }

  const author = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;
  const authorLabel = author?.full_name ?? author?.username ?? "a student";
  const metadataTitle = getPostMetadataTitle(post, author);
  const coverUrl = (post as { cover_image_url?: string | null }).cover_image_url;
  const description = getPostMetaDescription({
    excerpt: post.excerpt,
    content: (post as { content?: string | null }).content,
    fallback: `Read this post by ${authorLabel} on Indegenius`,
  });
  // TODO(gratitude): confirm production domain — SITE_URL is a placeholder until then.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? SITE_URL;
  const ogImageUrl = `${appUrl}/api/og?${new URLSearchParams({
    title: metadataTitle,
    author: author?.full_name ?? "",
    university: author?.university ?? "",
    type: post.type ?? "essay",
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: postRaw, error: postError } = await supabase
    .from("posts")
    .select(
      `
      id, title, slug, content, excerpt, type, content_kind, article_format, tags, status, author_id,
      created_at, published_at, view_count, impression_count, read_count, cover_image_url, citation_id,
      published_version_id, current_round, revision_due_at,
      in_response_to,
      audio_summary_url,
      document_path, document_original_name, document_mime_type, document_size_bytes,
      profiles!posts_author_id_fkey (id, username, full_name, university, field_of_study, bio, avatar_url, verified, verified_type)
    `
    )
    .eq("slug", slug)
    .in("status", ["published", "pending", "pending_revision", "draft"])
    .maybeSingle();

  if (postError) {
    throwPostQueryError(slug, "page", postError);
  }

  if (!postRaw) notFound();
  const post = postRaw as PostRecord;

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
  const author = getAuthor(post);
  const sanitizedContent = sanitizePostHtml(post.content);
  const sanitizedExcerpt = sanitizePostExcerpt(post.excerpt);
  const readTime = estimateReadTime(sanitizedContent);
  const wordCount = countWords(sanitizedContent);
  const contentWithIds = renderReferenceShortcodes(
    injectHeadingIds(sanitizedContent)
  );
  const authorName = author?.full_name ?? author?.username ?? "Anonymous";
  const displayTitle = getPostDisplayTitle(post);
  const metadataTitle = getPostMetadataTitle(post, author);
  const parentPostId = post.in_response_to ?? null;
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
  const isResearchPost = resolvedKind === "research";
  const isArticlePost = resolvedKind === "article";
  const articleFormatLabel = isArticlePost
    ? getArticleFormatLabel(resolveArticleFormat(post))
    : null;
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
  // responses), not the publication template below — see
  // PostConversationView.tsx.
  if (resolvedKind === "post") {
    return (
      <PostEngagementProvider postId={post.id} userId={userId} contentKind={resolvedKind}>
        <div className="relative">
          {articleJsonLd ? <ArticleJsonLd data={articleJsonLd} /> : null}
          {isPublished ? <ViewTracker slug={slug} wordCount={wordCount} /> : null}
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

  if (isResearchPost) {
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
            <ReadingProgressBar />
            <ViewTracker slug={slug} wordCount={wordCount} />
          </>
        ) : null}

        <header className="mx-auto max-w-[720px] bg-white pb-2 pt-1 sm:px-2 sm:pt-3">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            <span aria-hidden="true">‹</span> Back to feed
          </Link>

          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <span className="font-display text-[11px] font-bold uppercase tracking-[0.16em] text-purple-accent">
              Research
            </span>
            {post.citation_id || isReviewedWork(post) ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                {post.citation_id ? "Citable" : "Reviewed"}
              </span>
            ) : post.status !== "published" ? (
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${getResearchStatusTone(post.status)}`}
              >
                {formatResearchStatus(post.status)}
              </span>
            ) : null}
          </div>

          <h1 className="font-display mt-3 max-w-[700px] text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink sm:text-[40px]">
            {post.title}
          </h1>

          <Suspense fallback={<div className="mt-5 h-12 animate-pulse rounded-lg bg-gray-100" />}>
            <DetailAuthorRow
              post={post}
              author={author}
              authorName={authorName}
              userId={userId}
              showCoAuthors
              secondaryDataPromise={secondaryDataPromise}
              viewerDataPromise={viewerDataPromise}
            />
          </Suspense>
        </header>

        <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-10 px-4 pb-20 pt-8 sm:px-6 lg:grid-cols-[minmax(0,760px)_300px] lg:gap-[52px] lg:px-8">
          <main className="min-w-0">
            <Suspense fallback={null}>
              <PostPublishSuccessSection
                post={post}
                author={author}
                points={POST_POINTS[(post.type as PostType) ?? "blog"] ?? 10}
                secondaryDataPromise={secondaryDataPromise}
              />
            </Suspense>

            {post.status === "draft" ? (
              <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                This research record is a <strong>draft</strong> and is only
                visible to you.{" "}
                <Link
                  href={`/submit/research?draft=${post.id}`}
                  className="font-semibold underline"
                >
                  Edit &amp; submit
                </Link>
              </div>
            ) : null}

            <Suspense fallback={null}>
              <PostReviewStatusPanel
                post={post}
                secondaryDataPromise={secondaryDataPromise}
              />
            </Suspense>

            {post.audio_summary_url ? (
              <AudioSummaryPlayer audioUrl={post.audio_summary_url} />
            ) : null}

            <section id="abstract" className="mb-4 scroll-mt-24 rounded-xl bg-purple-tint/60 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-purple-accent">
                Abstract
              </p>
              <p className="mt-2 text-[16px] leading-[1.7] text-gray-800">
                {sanitizedExcerpt ?? "No abstract was provided for this research record."}
              </p>
            </section>

            {post.document_path ? (
              <section
                id="manuscript"
                className="mb-4 flex scroll-mt-24 items-center gap-3 rounded-xl border border-gray-200 bg-white p-3.5"
              >
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-purple-accent text-[10px] font-bold tracking-wide text-white"
                >
                  PDF
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {post.document_original_name ?? "Research manuscript"}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {formatDocumentSize(post.document_size_bytes) ?? "PDF"}
                  </span>
                </span>
                <a
                  href={`/api/research-document/${post.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-lg bg-gray-100 px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-gray-200"
                >
                  View manuscript
                </a>
              </section>
            ) : (
              <div id="manuscript" className="mb-4 scroll-mt-24 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">Manuscript unavailable</p>
                <p className="mt-1 text-sm leading-6 text-amber-800">
                  This research record does not currently have a PDF attached. The
                  abstract and metadata remain visible until the document is
                  restored or attached by the author or editorial team.
                </p>
              </div>
            )}

            {post.tags && post.tags.length > 0 ? (
              <div className="mb-8 flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/topics/${encodeURIComponent(tag)}`}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[13px] text-gray-600 transition-colors hover:border-emerald-brand/40 hover:text-emerald-brand"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            ) : null}

            <Suspense fallback={<SectionSkeleton rows={4} />}>
              <PostReferencesAndCitation
                post={post}
                author={author}
                secondaryDataPromise={secondaryDataPromise}
              />
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

            {/* The conversation comes directly after the actions row — nothing
                may sit between a reader finishing the paper and the responses. */}
            <Suspense fallback={<SectionSkeleton rows={3} />}>
              <PostResponsesSection
                post={post}
                author={author}
                userId={userId}
                secondaryDataPromise={secondaryDataPromise}
              />
            </Suspense>

            <div className="mt-10">
              <Suspense fallback={<SectionSkeleton rows={3} />}>
                <AuthorAndCollaborationSection
                  post={post}
                  author={author}
                  userId={userId}
                  authorName={authorName}
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

          <Suspense
            fallback={
              <aside className="hidden lg:block">
                <div className="sticky top-24 space-y-4">
                  <SectionSkeleton rows={5} />
                  <SectionSkeleton rows={4} />
                </div>
              </aside>
            }
          >
            <ResearchDossierSidebar
              post={post}
              author={author}
              userId={userId}
              sanitizedContent={sanitizedContent}
              sanitizedExcerpt={sanitizedExcerpt}
              wordCount={wordCount}
              parentPostId={parentPostId}
              isPublished={isPublished}
              secondaryDataPromise={secondaryDataPromise}
              viewerDataPromise={viewerDataPromise}
            />
          </Suspense>
        </div>
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
          <ViewTracker slug={slug} wordCount={wordCount} />
        </>
      ) : null}

      <header className="mx-auto max-w-[720px] bg-white pb-2 pt-1 sm:px-2 sm:pt-3">
        <div>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            <span aria-hidden="true">‹</span> Back to feed
          </Link>

          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                articleFormatLabel === "Policy Brief"
                  ? "bg-purple-tint text-purple-accent"
                  : "bg-gold-tint text-gold-ink"
              }`}
            >
              Article{articleFormatLabel ? ` · ${articleFormatLabel}` : ""}
            </span>
            <span className="text-[12px] font-medium text-gray-400">{readTime} min read</span>
          </div>

          <div className="mt-4">
            <Suspense fallback={null}>
              <ParentPostLink parentPostId={parentPostId} mode="editorial" />
            </Suspense>
          </div>

          {displayTitle ? (
            <h1 className="font-display max-w-[700px] text-[30px] font-semibold leading-[1.08] tracking-[-0.02em] text-ink sm:text-[40px]">
              {displayTitle}
            </h1>
          ) : null}

          <Suspense fallback={<div className="mt-5 h-12 animate-pulse rounded-lg bg-gray-100" />}>
            <DetailAuthorRow
              post={post}
              author={author}
              authorName={authorName}
              userId={userId}
              secondaryDataPromise={secondaryDataPromise}
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
        <div className="mx-auto mt-6 max-w-[720px]">
          <PostCover
            src={post.cover_image_url}
            alt={post.title}
            type={post.type}
            content_kind={post.content_kind}
            article_format={post.article_format}
            sizes="(max-width: 760px) calc(100vw - 32px), 720px"
            priority
            className="aspect-[16/9] w-full rounded-[10px] border border-gray-200 bg-gray-100"
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
              points={POST_POINTS[(post.type as PostType) ?? "blog"] ?? 10}
              secondaryDataPromise={secondaryDataPromise}
            />
          </Suspense>

          {post.status === "draft" ? (
            <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              This post is a <strong>draft</strong> and is only visible to you.{" "}
              <Link href={`/edit/${post.slug}`} className="font-semibold underline">
                Edit &amp; publish
              </Link>
            </div>
          ) : null}

          <Suspense fallback={null}>
            <PostReviewStatusPanel
              post={post}
              secondaryDataPromise={secondaryDataPromise}
            />
          </Suspense>

          {post.audio_summary_url ? (
            <AudioSummaryPlayer audioUrl={post.audio_summary_url} />
          ) : null}

          <div className="article-journal-body article-redesign-body relative mb-12 sm:mb-16">
            <HighlightShare containerId="post-article-prose" postSlug={post.slug} postId={post.id} />
            <div
              id="post-article-prose"
              className="article-journal-body prose prose-gray max-w-[680px] prose-lg prose-a:text-emerald-brand prose-headings:font-semibold prose-headings:tracking-normal prose-headings:text-gray-900"
              dangerouslySetInnerHTML={{ __html: contentWithIds }}
            />
          </div>

          <Suspense fallback={<SectionSkeleton rows={4} />}>
            <PostReferencesAndCitation
              post={post}
              author={author}
              secondaryDataPromise={secondaryDataPromise}
            />
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

          {/* The conversation comes directly after the actions row — nothing
              may sit between a reader finishing the piece and the responses. */}
          <Suspense fallback={<SectionSkeleton rows={3} />}>
            <PostResponsesSection
              post={post}
              author={author}
              userId={userId}
              secondaryDataPromise={secondaryDataPromise}
            />
          </Suspense>

          <div className="mt-10">
            <Suspense fallback={<SectionSkeleton rows={3} />}>
              <AuthorAndCollaborationSection
                post={post}
                author={author}
                userId={userId}
                authorName={authorName}
                secondaryDataPromise={secondaryDataPromise}
                viewerDataPromise={viewerDataPromise}
                showCollaboration={false}
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
