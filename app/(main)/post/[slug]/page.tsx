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
  POST_TYPE_LABELS,
  POST_POINTS,
  sanitizePostExcerpt,
  getPostMetaDescription,
  type PostType,
} from "@/lib/utils";
import LikeButton from "./LikeButton";
import BookmarkButton from "./BookmarkButton";
import CommentsLoader from "./CommentsLoader";
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
import EditorialTrustPanel from "@/components/editorial/EditorialTrustPanel";
import ResponseStartLink, {
  type ResponseIntent,
} from "@/components/post/ResponseStartLink";
import { getCollaborationSummary } from "@/lib/collaboration";
import { getMessageEligibility } from "@/lib/messaging";
import { getEditorialTrustSummary } from "@/lib/editorialTrust";
import { getPostQualitySummary } from "@/lib/postQuality";
import { sanitizePostHtml } from "@/lib/sanitizePostHtml";

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
  title: string;
  slug: string;
}

interface PostRecord {
  id: string;
  title: string;
  slug: string;
  content: string | null;
  excerpt: string | null;
  type: string;
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

interface ResponsePostRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  published_at: string | null;
  profiles:
    | ResponsePostProfile
    | ResponsePostProfile[]
    | null;
}

const RESPONSE_PROMPTS: Array<{
  intent: ResponseIntent;
  label: string;
  body: string;
}> = [
  {
    intent: "extend",
    label: "Extend this idea",
    body: "Build on the strongest point with another angle from class, campus, or your community.",
  },
  {
    intent: "challenge",
    label: "Challenge the argument",
    body: "Respond with a respectful counterpoint, objection, or different interpretation.",
  },
  {
    intent: "evidence",
    label: "Add evidence or an example",
    body: "Bring in a source, statistic, case, or lived observation that sharpens the discussion.",
  },
];

interface ResponsePostProfile {
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  verified?: boolean;
}

interface RelatedPost {
  id: string;
  title: string;
  slug: string;
  type: string;
  published_at: string | null;
  created_at: string;
  cover_image_url: string | null;
  profiles: { full_name: string | null; username: string } | null;
}

interface SecondaryData {
  references: ReferenceRecord[];
  coAuthors: CoAuthorRecord[];
  responsePosts: Array<Omit<ResponsePostRow, "profiles"> & { profiles: ResponsePostProfile | null }>;
  reviews: Array<{
    assigned_at: string | null;
    submitted_at: string | null;
    recommendation: string | null;
    round: number | null;
  }>;
  decisions: Array<{ decision: string | null; created_at: string | null; round: number | null }>;
  versions: Array<{ id: string; version_kind: string | null; round: number | null; created_at: string | null }>;
  likeCount: number;
  commentCount: number;
  bookmarkCount: number;
  relatedPosts: RelatedPost[];
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

function extractHeadings(content: string): { id: string; text: string; level: number }[] {
  const regex = /<h([23])[^>]*>(.*?)<\/h[23]>/gi;
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) matches.push(match);

  return matches.map((item, index) => ({
    id: `heading-${index}`,
    text: item[2].replace(/<[^>]*>/g, ""),
    level: parseInt(item[1], 10),
  }));
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

function isReviewedWork(post: { type?: string | null; citation_id?: string | null }) {
  return Boolean(post.citation_id) || post.type === "research" || post.type === "policy_brief";
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
    headline: post.title,
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

function PublicationSignalPill({
  label,
  value,
  tone = "gray",
}: {
  label: string;
  value: string;
  tone?: "gray" | "emerald" | "sky" | "purple";
}) {
  const toneClass = {
    gray: "border-gray-200 bg-white/90 text-gray-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    sky: "border-sky-200 bg-sky-50 text-sky-800",
    purple: "border-purple-200 bg-purple-50 text-purple-800",
  };

  return (
    <div className={`min-w-[96px] rounded-xl border px-3 py-2.5 ${toneClass[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[12px] font-semibold">{value}</p>
    </div>
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

function ResearchDocumentPanel({ post }: { post: PostRecord }) {
  if (post.type !== "research") return null;

  const size = formatDocumentSize(post.document_size_bytes) ?? "Size unavailable";
  const archiveAvailable = Boolean(post.citation_id);

  return (
    <section
      id="manuscript"
      className="mb-8 scroll-mt-24 rounded-xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)] sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Manuscript PDF
          </p>
          <h2 className="font-display mt-2 text-2xl font-semibold leading-tight text-slate-950">
            {post.document_original_name ?? "Research manuscript"}
          </h2>
          <p className="mt-2 max-w-[58ch] text-sm leading-6 text-slate-600">
            The research record is presented as an abstract plus the submitted
            PDF manuscript. PDF access uses the protected Indegenius document
            route and opens in a new tab.
          </p>
        </div>
        <span
          className={`inline-flex w-fit shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${getResearchStatusTone(
            post.status
          )}`}
        >
          {formatResearchStatus(post.status)}
        </span>
      </div>

      {post.document_path ? (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Format
              </p>
              <p className="mt-1 font-semibold text-slate-900">
                {post.document_mime_type?.includes("pdf") ? "PDF" : "Document"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                File size
              </p>
              <p className="mt-1 font-semibold text-slate-900">{size}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Archive
              </p>
              <p className="mt-1 font-semibold text-slate-900">
                {archiveAvailable ? "Citation archived" : "Pending archive"}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={`/api/research-document/${post.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              Open PDF
            </a>
            {post.citation_id ? (
              <>
                <CopyCitationIdButton citationId={post.citation_id} />
                <Link
                  href={`/publication/${post.citation_id}`}
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 transition-colors hover:bg-sky-50"
                >
                  Citation archive
                </Link>
              </>
            ) : null}
          </div>

          {post.citation_id ? (
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Citation ID:{" "}
              <span className="font-mono font-semibold text-slate-800">
                {post.citation_id}
              </span>
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            Manuscript unavailable
          </p>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            This research record does not currently have a PDF attached. The
            abstract and metadata remain visible, but the manuscript cannot be
            opened until the document is restored or attached by the author or
            editorial team.
          </p>
        </div>
      )}
    </section>
  );
}

function throwPostQueryError(slug: string, stage: "metadata" | "page", error: unknown): never {
  console.error(`[post/${slug}] ${stage} query failed`, error);
  throw new Error(`Failed to load post "${slug}".`);
}

function getBasicQualitySummary({
  post,
  author,
  sanitizedContent,
  wordCount,
  parentPostId,
}: {
  post: PostRecord;
  author: AuthorProfile | null;
  sanitizedContent: string;
  wordCount: number;
  parentPostId: string | null;
}) {
  return getPostQualitySummary({
    type: post.type,
    status: post.status,
    title: post.title,
    excerpt: post.excerpt,
    content: sanitizedContent,
    wordCount,
    tags: post.tags ?? [],
    citationId: post.citation_id ?? null,
    isResponse: Boolean(parentPostId),
    author,
    referenceCount: 0,
    responseCount: 0,
    reviewCount: 0,
    completedReviewCount: 0,
    commentCount: 0,
    likeCount: 0,
    bookmarkCount: 0,
  });
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
    responseCount: secondary.responsePosts.length,
    reviewCount: secondary.reviews.length,
    completedReviewCount: secondary.reviews.filter((review) =>
      Boolean(review.submitted_at)
    ).length,
    commentCount: secondary.commentCount,
    likeCount: secondary.likeCount,
    bookmarkCount: secondary.bookmarkCount,
  });
}

async function getSecondaryData(
  postId: string,
  tags: string[],
  isPublished: boolean
): Promise<SecondaryData> {
  const supabase = await createClient();

  const [
    { count: likeCount },
    { data: referencesRaw },
    { data: coAuthorsRaw },
    { data: responsePostsRaw },
    { data: reviewsRaw },
    { data: decisionsRaw },
    { data: versionsRaw },
    { count: commentCount },
    { count: bookmarkCount },
    relatedResult,
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
    supabase
      .from("posts")
      .select(
        "id, title, slug, excerpt, published_at, profiles!posts_author_id_fkey(username, full_name, avatar_url, verified)"
      )
      .eq("in_response_to", postId)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(10),
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
      .from("comments")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId),
    supabase
      .from("bookmarks")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId),
    isPublished && tags.length > 0
      ? supabase
          .from("posts")
          .select(
            "id, title, slug, type, published_at, created_at, cover_image_url, profiles!posts_author_id_fkey (full_name, username)"
          )
          .eq("status", "published")
          .neq("id", postId)
          .overlaps("tags", tags)
          .order("published_at", { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [], error: null }),
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

  const responsePosts = ((responsePostsRaw ?? []) as ResponsePostRow[]).map(
    (response) => ({
      ...response,
      profiles: Array.isArray(response.profiles)
        ? response.profiles[0] ?? null
        : response.profiles,
    })
  );

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
    responsePosts,
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
    commentCount: commentCount ?? 0,
    bookmarkCount: bookmarkCount ?? 0,
    relatedPosts,
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

function CommentsSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-5 w-24 rounded bg-gray-200" />
      {[...Array(3)].map((_, index) => (
        <div key={index} className="flex gap-3">
          <div className="h-8 w-8 shrink-0 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-28 rounded bg-gray-200" />
            <div className="h-3 w-full rounded bg-gray-100" />
            <div className="h-3 w-4/5 rounded bg-gray-100" />
          </div>
        </div>
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
          {(parentPost as ParentPostRef).title}
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

async function PublicationSignalBlock({
  post,
  author,
  secondaryDataPromise,
  variant = "hero",
}: {
  post: PostRecord;
  author?: AuthorProfile | null;
  secondaryDataPromise: Promise<SecondaryData>;
  variant?: "hero" | "standalone";
}) {
  if (post.status !== "published") return null;

  const { references, reviews, decisions, versions } = await secondaryDataPromise;
  const reviewed = isReviewedWork(post);
  const typeLabel = POST_TYPE_LABELS[post.type as PostType] ?? post.type;
  const editorialSummary = getEditorialTrustSummary({
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

  const signalPills = (
    <>
      <PublicationSignalPill label="Format" value={typeLabel} />
      <PublicationSignalPill
        label="Review"
        value={reviewed ? "Reviewed" : "Community"}
        tone={reviewed ? "emerald" : "gray"}
      />
      <PublicationSignalPill
        label="Citation"
        value={post.citation_id ? "Archived" : "Not archived"}
        tone={post.citation_id ? "sky" : "gray"}
      />
      <PublicationSignalPill
        label="Sources"
        value={references.length > 0 ? `${references.length} refs` : "No refs"}
        tone={references.length > 0 ? "emerald" : "gray"}
      />
      {variant === "standalone" && author ? (
        <PublicationSignalPill
          label="Author"
          value={author.verified ? "Verified" : "Profile"}
          tone={author.verified ? "emerald" : "gray"}
        />
      ) : null}
    </>
  );

  if (variant === "standalone") {
    return (
      <section className="mb-9">
        <div className="grid grid-cols-2 gap-2 min-[430px]:grid-cols-4 sm:flex sm:flex-wrap">
          {signalPills}
        </div>
        {editorialSummary.applies ? (
          <div className="mt-4">
            <EditorialTrustPanel
              summary={editorialSummary}
              description="Reviewed and citable work includes stronger editorial context, sources, and archived publication metadata for readers."
              actionHref={post.citation_id ? `/publication/${post.citation_id}` : null}
              actionSource="post_editorial_trust"
              actionKey="citation_archive"
              compact
            />
          </div>
        ) : null}
      </section>
    );
  }

  if (editorialSummary.applies) {
    return (
      <div className="mt-5">
        <EditorialTrustPanel
          summary={editorialSummary}
          description="Reviewed and citable work includes stronger editorial context, sources, and archived publication metadata for readers."
          actionHref={post.citation_id ? `/publication/${post.citation_id}` : null}
          actionSource="post_editorial_trust"
          actionKey="citation_archive"
          compact
        />
      </div>
    );
  }

  return (
    <section className="mt-6 rounded-xl border border-white/20 bg-white/10 p-3.5 backdrop-blur-sm sm:rounded-lg sm:p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">{signalPills}</div>
        {post.citation_id ? (
          <Link
            href={`/publication/${post.citation_id}`}
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-white/25 bg-white/20 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/25"
          >
            Citation archive
          </Link>
        ) : null}
      </div>
    </section>
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
      title={post.title}
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

async function MobileCredibilitySection({
  post,
  author,
  sanitizedContent,
  wordCount,
  parentPostId,
  isPublished,
  secondaryDataPromise,
}: {
  post: PostRecord;
  author: AuthorProfile | null;
  sanitizedContent: string;
  wordCount: number;
  parentPostId: string | null;
  isPublished: boolean;
  secondaryDataPromise: Promise<SecondaryData>;
}) {
  const secondary = await secondaryDataPromise;
  const summary = getFullQualitySummary({
    post,
    author,
    sanitizedContent,
    wordCount,
    parentPostId,
    secondary,
  });

  return (
    <div className="mb-8">
      <CredibilityPanel postId={post.id} summary={summary} isPublished={isPublished} />
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
            title={post.title}
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
    <div className="mb-8 flex flex-col gap-3 border-y border-[#EDE9E2] py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <LikeButton
          postId={post.id}
          initialLiked={viewer.userLiked}
          initialCount={secondary.likeCount}
          userId={userId}
        />
        <BookmarkButton
          postId={post.id}
          initialBookmarked={viewer.userBookmarked}
          userId={userId}
        />
      </div>
      <ShareButtons
        title={post.title}
        slug={post.slug}
        excerpt={sanitizedExcerpt}
        authorName={author?.full_name ?? null}
      />
      {typeof post.read_count === "number" && post.read_count > 0 ? (
        <span className="text-[11px] font-medium text-gray-400">
          {post.read_count.toLocaleString()}{" "}
          {post.read_count === 1 ? "read" : "reads"}
        </span>
      ) : null}
      {userId && author && userId !== author.id ? (
        <ReportButton
          targetType="post"
          targetId={post.id}
          targetLabel={`"${post.title}"`}
          variant="text"
          className="lg:hidden"
        />
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
}: {
  post: PostRecord;
  author: AuthorProfile | null;
  userId: string | null;
  authorName: string;
  secondaryDataPromise: Promise<SecondaryData>;
  viewerDataPromise: Promise<ViewerData>;
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
    responseCount: secondary.responsePosts.length,
    coauthorCount: coAuthors.length,
    isFollowingAuthor: viewer.userFollowsAuthor,
    messageEligible: viewer.messageEligibility?.eligible ?? false,
    messageReason: viewer.messageEligibility?.reason ?? null,
  });

  return (
    <>
      {post.status === "published" ? (
        <CollaborationPanel summary={collaborationSummary} authorName={authorName} />
      ) : null}
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
    </>
  );
}

async function PostRelatedSection({
  secondaryDataPromise,
}: {
  secondaryDataPromise: Promise<SecondaryData>;
}) {
  const { relatedPosts } = await secondaryDataPromise;
  if (relatedPosts.length === 0) return null;

  return (
    <section className="mb-9">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          Related
        </h2>
        <span className="h-px flex-1 bg-gray-200" aria-hidden="true" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {relatedPosts.map((item) => (
          <Link
            key={item.id}
            href={`/post/${item.slug}`}
            className="group flex overflow-hidden rounded-lg border border-gray-200 bg-white transition-all hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] sm:flex-col"
          >
            <div className="h-[92px] w-[112px] shrink-0 overflow-hidden sm:h-[96px] sm:w-full">
              <PostCover
                src={item.cover_image_url}
                alt={item.title}
                type={item.type}
                sizes="200px"
                className="h-full w-full"
                imageClassName="object-cover"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col p-3">
              <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-gray-900 transition-colors group-hover:text-emerald-brand">
                {item.title}
              </p>
              <p className="mt-auto pt-2 text-[10px] text-gray-400">
                {item.profiles?.full_name ?? item.profiles?.username}
              </p>
            </div>
          </Link>
        ))}
      </div>
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
      title={post.title}
      slug={post.slug}
      points={points}
      username={author?.username ?? ""}
      relatedTarget={
        related
          ? {
              id: related.id,
              title: related.title,
              slug: related.slug,
            }
          : null
      }
    />
  );
}

function ResponsePromptPanel({ postId }: { postId: string }) {
  return (
    <section className="mb-10 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-[#E0FAF0] p-4 sm:rounded-lg sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
            Respond to this idea
          </p>
          <h2 className="font-display mt-1 text-[21px] font-semibold leading-tight text-gray-950 sm:text-[22px]">
            Add your argument to the thread
          </h2>
        </div>
        <p className="max-w-sm text-[13px] leading-6 text-emerald-900/75">
          Choose the angle that best fits what you want to say next.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {RESPONSE_PROMPTS.map((prompt) => (
          <ResponseStartLink
            key={prompt.intent}
            postId={postId}
            source="article_response_prompt"
            starter="response"
            responseIntent={prompt.intent}
            className="group flex min-h-[112px] flex-col justify-between rounded-xl border border-emerald-100 bg-white p-4 text-left transition-all hover:-translate-y-px hover:border-emerald-300 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] sm:min-h-[124px] sm:rounded-lg"
          >
            <span>
              <span className="block text-sm font-semibold text-gray-950 transition-colors group-hover:text-emerald-700">
                {prompt.label}
              </span>
              <span className="mt-2 block text-sm leading-6 text-gray-600">
                {prompt.body}
              </span>
            </span>
            <span className="mt-4 text-xs font-semibold text-emerald-700">
              Start response
            </span>
          </ResponseStartLink>
        ))}
      </div>
    </section>
  );
}

async function PostResponsesSection({
  secondaryDataPromise,
}: {
  secondaryDataPromise: Promise<SecondaryData>;
}) {
  const { responsePosts } = await secondaryDataPromise;
  if (responsePosts.length === 0) return null;

  return (
    <section id="responses" className="mt-10 scroll-mt-24">
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
        Responses ({responsePosts.length})
      </h2>
      <div className="space-y-4">
        {responsePosts.map((response) => {
          const responseAuthor = response.profiles;

          return (
            <Link
              key={response.id}
              href={`/post/${response.slug}`}
              className="flex gap-4 rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] sm:rounded-lg"
            >
              <div className="w-1 flex-shrink-0 self-stretch rounded-full bg-emerald-brand" />
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <UserAvatar
                    name={
                      responseAuthor?.full_name ??
                      responseAuthor?.username ??
                      "Unknown"
                    }
                    src={responseAuthor?.avatar_url ?? null}
                    size={20}
                  />
                  <span className="text-xs text-gray-500">
                    <span className="font-medium text-gray-700">
                      {responseAuthor?.full_name ?? responseAuthor?.username ?? "Unknown"}
                    </span>
                    {" / "}
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 not-italic">
                      Response
                    </span>
                  </span>
                </div>
                <p className="text-sm font-semibold leading-snug text-gray-900">
                  {response.title}
                </p>
                {response.excerpt ? (
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                    {response.excerpt}
                  </p>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

async function PostSidebar({
  post,
  author,
  userId,
  headings,
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
  headings: { id: string; text: string; level: number }[];
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

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24 space-y-4">
        {isPublished ? (
          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">
              Reader actions
            </h2>
            <div className="space-y-2 [&_a]:w-full [&_button]:w-full">
              <LikeButton
                postId={post.id}
                initialLiked={viewer.userLiked}
                initialCount={secondary.likeCount}
                userId={userId}
              />
              <BookmarkButton
                postId={post.id}
                initialBookmarked={viewer.userBookmarked}
                userId={userId}
              />
              <ShareButtons
                title={post.title}
                slug={post.slug}
                excerpt={sanitizedExcerpt}
                authorName={author?.full_name ?? null}
              />
              {post.citation_id ? (
                <Link
                  href={`/publication/${post.citation_id}`}
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-sky-200 hover:text-sky-700"
                >
                  Cite this
                </Link>
              ) : null}
              <ResponseStartLink
                postId={post.id}
                source="post_sidebar"
                className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-emerald-brand px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37]"
              >
                Write a response
              </ResponseStartLink>
              {userId && author && userId !== author.id ? (
                <ReportButton
                  targetType="post"
                  targetId={post.id}
                  targetLabel={`"${post.title}"`}
                />
              ) : null}
            </div>
          </section>
        ) : null}
        <CredibilityPanel postId={post.id} summary={summary} isPublished={isPublished} />
        <TableOfContents headings={headings} />
        {author ? (
          <section className="rounded-lg bg-gray-950 p-4 text-white">
            <h2 className="font-display text-[15px] font-semibold">
              Follow this author
            </h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-white/55">
              Get new work by {author.full_name ?? author.username} in your feed.
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
                  className="inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-white/10 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/15"
                >
                  View dashboard
                </Link>
              ) : (
                <Link
                  href={`/login?redirectTo=${encodeURIComponent(`/post/${post.slug}`)}`}
                  className="inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-emerald-brand px-3 text-xs font-semibold text-white transition-colors hover:bg-[#0E4B37]"
                >
                  Follow author
                </Link>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

function ResearchMetaTile({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "emerald" | "sky" | "amber";
}) {
  const toneClass = {
    slate: "border-slate-200 bg-white text-slate-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    sky: "border-sky-200 bg-sky-50 text-sky-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
  };

  return (
    <div className={`rounded-lg border px-3 py-3 ${toneClass[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-60">
        {label}
      </p>
      <p className="mt-1 truncate text-[12.5px] font-semibold">{value}</p>
    </div>
  );
}

async function ResearchHero({
  post,
  author,
  authorName,
  sanitizedExcerpt,
  secondaryDataPromise,
}: {
  post: PostRecord;
  author: AuthorProfile | null;
  authorName: string;
  sanitizedExcerpt: string | null;
  secondaryDataPromise: Promise<SecondaryData>;
}) {
  const { coAuthors } = await secondaryDataPromise;
  const coAuthorNames = coAuthors
    .filter((record) => record.user_id !== author?.id)
    .map((record) => record.profile?.full_name ?? record.profile?.username)
    .filter(Boolean) as string[];
  const authorLine = [authorName, ...coAuthorNames].filter(Boolean).join(", ");
  const statusLabel = formatResearchStatus(post.status);

  return (
    <header className="relative left-1/2 -mt-6 w-[calc(100vw-16px)] -translate-x-1/2 overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.22),transparent_32%),linear-gradient(135deg,#020617_0%,#0f172a_48%,#12322d_100%)] px-4 py-12 text-white sm:px-6 sm:py-16 lg:px-8">
      <div
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
        aria-hidden="true"
      />
      <div className="relative z-10 mx-auto max-w-[1200px]">
        <div className="max-w-[900px]">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white">
              Research manuscript
            </span>
            <span className="rounded-full border border-white/15 bg-white/[0.08] px-3 py-1 text-[10.5px] font-semibold text-white/75">
              {statusLabel}
            </span>
            {post.tags?.slice(0, 4).map((tag, index) => (
              <Link
                key={tag}
                href={`/topics/${encodeURIComponent(tag)}`}
                className={`rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[10.5px] font-medium text-white/65 transition-colors hover:border-white/35 hover:text-white ${
                  index >= 3 ? "hidden sm:inline-flex" : ""
                }`}
              >
                {tag}
              </Link>
            ))}
          </div>

          <h1 className="font-display max-w-[860px] text-[32px] font-semibold leading-[1.12] tracking-normal text-white sm:text-[48px] sm:leading-[1.06] lg:text-[58px]">
            {post.title}
          </h1>

          <div className="mt-6 max-w-[780px] border-l-2 border-emerald-300/70 pl-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-100/75">
              Abstract
            </p>
            <p className="font-display mt-2 line-clamp-4 text-[17px] italic leading-[1.68] text-white/80 sm:line-clamp-5 sm:text-[21px]">
              {sanitizedExcerpt ?? "Abstract not provided for this research record."}
            </p>
          </div>

          <div className="mt-9 grid gap-5 border-t border-white/10 pt-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            {author ? (
              <div className="flex items-center gap-3">
                <Link href={`/${author.username}`} className="shrink-0">
                  <UserAvatar
                    name={authorName}
                    src={author.avatar_url}
                    size={46}
                    className="flex-shrink-0 overflow-hidden rounded-full ring-2 ring-white/20"
                  />
                </Link>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
                    Author line
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {authorLine || authorName}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-white/50">
                    {[author.field_of_study, author.university]
                      .filter(Boolean)
                      .join(" / ")}
                  </p>
                </div>
              </div>
            ) : null}
            <div className="grid gap-2 text-left text-[12px] text-white/65 sm:grid-cols-3 lg:min-w-[360px]">
              <div>
                <p className="font-bold uppercase tracking-[0.14em] text-white/40">
                  Date
                </p>
                <p className="mt-1 font-semibold text-white/80">
                  {formatDate(post.published_at ?? post.created_at)}
                </p>
              </div>
              <div>
                <p className="font-bold uppercase tracking-[0.14em] text-white/40">
                  Round
                </p>
                <p className="mt-1 font-semibold text-white/80">
                  Round {post.current_round ?? 1}
                </p>
              </div>
              <div>
                <p className="font-bold uppercase tracking-[0.14em] text-white/40">
                  Archive
                </p>
                <p className="mt-1 font-semibold text-white/80">
                  {post.citation_id ? "Citation ready" : "Pending citation"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

async function ResearchMetadataStrip({
  post,
  secondaryDataPromise,
}: {
  post: PostRecord;
  secondaryDataPromise: Promise<SecondaryData>;
}) {
  const { references, versions } = await secondaryDataPromise;
  const latestVersion = versions.length > 0 ? versions[versions.length - 1] : null;
  const size = formatDocumentSize(post.document_size_bytes);
  const versionLabel = latestVersion
    ? `${getVersionKindLabel(latestVersion.version_kind)} / Round ${
        latestVersion.round ?? post.current_round ?? 1
      }`
    : `Round ${post.current_round ?? 1}`;

  return (
    <section className="mx-auto mt-4 grid max-w-[1200px] grid-cols-2 gap-2 px-4 sm:-mt-8 sm:px-6 md:grid-cols-3 lg:grid-cols-6 lg:px-8">
      <ResearchMetaTile
        label="Format"
        value={post.document_path ? "PDF manuscript" : "Abstract only"}
        tone={post.document_path ? "slate" : "amber"}
      />
      <ResearchMetaTile
        label="Review"
        value={formatResearchStatus(post.status)}
        tone={
          post.status === "published"
            ? "emerald"
            : post.status === "pending_revision"
              ? "amber"
              : "sky"
        }
      />
      <ResearchMetaTile
        label="Citation"
        value={post.citation_id ? "Archived" : "Pending"}
        tone={post.citation_id ? "sky" : "slate"}
      />
      <ResearchMetaTile
        label="PDF size"
        value={size ?? "Unavailable"}
        tone={post.document_path ? "slate" : "amber"}
      />
      <ResearchMetaTile
        label="References"
        value={references.length > 0 ? `${references.length} listed` : "None listed"}
        tone={references.length > 0 ? "emerald" : "slate"}
      />
      <ResearchMetaTile label="Version" value={versionLabel} />
    </section>
  );
}

function ResearchAbstractSection({
  sanitizedExcerpt,
}: {
  sanitizedExcerpt: string | null;
}) {
  return (
    <section
      id="abstract"
      className="mb-8 scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 sm:p-6"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        Abstract
      </p>
      <p className="font-display mt-3 text-[19px] leading-[1.78] text-slate-800 sm:text-[23px]">
        {sanitizedExcerpt ?? "No abstract was provided for this research record."}
      </p>
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

async function ResearchMobileTimeline({
  post,
  secondaryDataPromise,
}: {
  post: PostRecord;
  secondaryDataPromise: Promise<SecondaryData>;
}) {
  const secondary = await secondaryDataPromise;

  return (
    <div className="mb-8 lg:hidden">
      <ResearchReviewTimeline post={post} secondary={secondary} />
    </div>
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
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
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
                  initialCount={secondary.likeCount}
                  userId={userId}
                />
                <BookmarkButton
                  postId={post.id}
                  initialBookmarked={viewer.userBookmarked}
                  userId={userId}
                />
                <ShareButtons
                  title={post.title}
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

        <CredibilityPanel postId={post.id} summary={summary} isPublished={isPublished} />
        <ResearchReviewTimeline post={post} secondary={secondary} />
        <TableOfContents headings={dossierHeadings} />

        {author ? (
          <section className="rounded-lg bg-slate-950 p-4 text-white">
            <h2 className="font-display text-[15px] font-semibold">
              Follow this researcher
            </h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-white/55">
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
                  className="inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-white/10 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/15"
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
  const coverUrl = (post as { cover_image_url?: string | null }).cover_image_url;
  const description = getPostMetaDescription({
    excerpt: post.excerpt,
    content: (post as { content?: string | null }).content,
    fallback: `Read this post by ${authorLabel} on Indegenius`,
  });
  // TODO(gratitude): confirm production domain — SITE_URL is a placeholder until then.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? SITE_URL;
  const ogImageUrl = `${appUrl}/api/og?${new URLSearchParams({
    title: post.title,
    author: author?.full_name ?? "",
    university: author?.university ?? "",
    type: post.type ?? "essay",
  }).toString()}`;
  const ogImage = coverUrl ?? ogImageUrl;

  return {
    title: `${post.title} - Indegenius`,
    description,
    alternates: { canonical: canonicalPath(`/post/${post.slug}`) },
    openGraph: {
      title: post.title,
      description,
      url: `${appUrl}/post/${post.slug}`,
      siteName: "Indegenius",
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description,
      images: [ogImage],
    },
  };
}

function getPostHeroMode(): "editorial" | "magazine" {
  return "magazine";
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
      id, title, slug, content, excerpt, type, tags, status, author_id,
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
  const headings = extractHeadings(sanitizedContent);
  const contentWithIds = renderReferenceShortcodes(
    injectHeadingIds(sanitizedContent)
  );
  const authorName = author?.full_name ?? author?.username ?? "Anonymous";
  const parentPostId = post.in_response_to ?? null;
  const basicQualitySummary = getBasicQualitySummary({
    post,
    author,
    sanitizedContent,
    wordCount,
    parentPostId,
  });
  const userId = user?.id ?? null;
  const secondaryDataPromise = getSecondaryData(post.id, post.tags ?? [], isPublished);
  const viewerDataPromise = getViewerData({
    postId: post.id,
    userId,
    authorId: author?.id ?? null,
    supabase,
  });
  const isResearchPost = post.type === "research";
  const postHeroMode = getPostHeroMode();
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

  if (isResearchPost) {
    return (
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

        <Suspense
          fallback={
            <header className="relative left-1/2 -mt-6 h-[420px] w-[calc(100vw-16px)] -translate-x-1/2 bg-slate-950" />
          }
        >
          <ResearchHero
            post={post}
            author={author}
            authorName={authorName}
            sanitizedExcerpt={sanitizedExcerpt}
            secondaryDataPromise={secondaryDataPromise}
          />
        </Suspense>

        <div
          className="relative left-1/2 h-14 w-[calc(100vw-16px)] -translate-x-1/2 bg-gradient-to-b from-slate-950/10 to-canvas"
          aria-hidden="true"
        />

        <Suspense
          fallback={
            <section className="mx-auto mt-4 grid max-w-[1200px] grid-cols-2 gap-2 px-4 sm:-mt-8 sm:px-6 md:grid-cols-3 lg:grid-cols-6 lg:px-8">
              {[...Array(6)].map((_, index) => (
                <div
                  key={index}
                  className="h-[66px] animate-pulse rounded-lg border border-slate-200 bg-white"
                />
              ))}
            </section>
          }
        >
          <ResearchMetadataStrip
            post={post}
            secondaryDataPromise={secondaryDataPromise}
          />
        </Suspense>

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

            <ResearchAbstractSection sanitizedExcerpt={sanitizedExcerpt} />
            <ResearchDocumentPanel post={post} />

            <Suspense fallback={<SectionSkeleton rows={3} />}>
              <ResearchMobileTimeline
                post={post}
                secondaryDataPromise={secondaryDataPromise}
              />
            </Suspense>

            <Suspense fallback={<SectionSkeleton rows={2} />}>
              <MobileCredibilitySection
                post={post}
                author={author}
                sanitizedContent={sanitizedContent}
                wordCount={wordCount}
                parentPostId={parentPostId}
                isPublished={isPublished}
                secondaryDataPromise={secondaryDataPromise}
              />
            </Suspense>

            <Suspense fallback={<SectionSkeleton rows={4} />}>
              <PostReferencesAndCitation
                post={post}
                author={author}
                secondaryDataPromise={secondaryDataPromise}
              />
            </Suspense>

            {isPublished ? <ResponsePromptPanel postId={post.id} /> : null}

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

            <hr className="my-9 border-gray-200/80" />

            <Suspense fallback={<SectionSkeleton rows={3} />}>
              <PostRelatedSection secondaryDataPromise={secondaryDataPromise} />
            </Suspense>

            <hr className="mb-8 border-gray-200/80" />

            <Suspense fallback={<CommentsSkeleton />}>
              <CommentsLoader
                postId={post.id}
                userId={userId}
                userProfileId={userId}
              />
            </Suspense>

            <Suspense fallback={<SectionSkeleton rows={3} />}>
              <PostResponsesSection secondaryDataPromise={secondaryDataPromise} />
            </Suspense>
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
    );
  }

  return (
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

      {postHeroMode === "editorial" ? (
        <header className="relative left-1/2 -mt-6 w-[calc(100vw-16px)] -translate-x-1/2 overflow-hidden border-t-[3px] border-emerald-brand bg-canvas">
          <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
            {/* Kicker row */}
            <div className="mb-3.5 flex flex-wrap items-center gap-2.5 font-sans">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-brand">
                {basicQualitySummary.contentLabel}
              </span>
              <span className="h-[3px] w-[3px] rounded-full bg-ink-muted opacity-50" aria-hidden="true" />
              <span className="text-[12px] text-ink-muted">{readTime} min read</span>
              <span className="h-[3px] w-[3px] rounded-full bg-ink-muted opacity-50" aria-hidden="true" />
              <span className="text-[12px] text-ink-muted">{wordCount.toLocaleString()} words</span>
            </div>

            {/* Tags */}
            {post.tags && post.tags.length > 0 ? (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {post.tags.slice(0, 5).map((tag, index) => (
                  <Link
                    key={tag}
                    href={`/topics/${encodeURIComponent(tag)}`}
                    className={`inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-0.5 text-[10.5px] font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900 ${index >= 3 ? "hidden sm:inline-flex" : ""}`}
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            ) : null}

            <Suspense fallback={null}>
              <ParentPostLink parentPostId={parentPostId} mode="editorial" />
            </Suspense>

            <h1 className="font-display max-w-[760px] text-[32px] font-bold leading-[1.1] tracking-[-0.015em] text-ink sm:text-[50px] sm:leading-[1.04] lg:text-[52px]">
              {post.title}
            </h1>

            {sanitizedExcerpt ? (
              <p className="font-display mt-4 max-w-[640px] text-[16px] font-normal italic leading-[1.62] text-gray-600 sm:text-[19px] sm:leading-[1.65]">
                {sanitizedExcerpt}
              </p>
            ) : null}

            {author ? (
              <div className="mt-6 flex max-w-[760px] flex-wrap items-center gap-3 border-t border-gray-100 pt-3.5 sm:flex-nowrap sm:gap-4">
                <Link href={`/${author.username}`} className="shrink-0">
                  <UserAvatar
                    name={authorName}
                    src={author.avatar_url}
                    size={44}
                    className="flex-shrink-0 overflow-hidden rounded-full ring-1 ring-gray-200"
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/${author.username}`}
                      className="text-[13.5px] font-semibold text-ink transition-colors hover:text-emerald-brand"
                    >
                      {authorName}
                    </Link>
                    {author.verified ? (
                      <span
                        title={author.verified_type ? `Verified ${author.verified_type}` : "Verified"}
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-brand px-2 py-0.5 text-[9.5px] font-bold text-white"
                      >
                        {"\u2713"}{" "}
                        {author.verified_type
                          ? author.verified_type.charAt(0).toUpperCase() + author.verified_type.slice(1)
                          : "Verified"}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-ink-muted">
                    {[author.field_of_study, author.university].filter(Boolean).join(" / ")}
                  </p>
                </div>
                <div className="w-full shrink-0 border-t border-gray-100 pt-3 text-left sm:ml-auto sm:w-auto sm:border-t-0 sm:pt-0 sm:text-right">
                  <p className="text-[13px] font-semibold text-ink">
                    {formatDate(post.published_at ?? post.created_at)}
                  </p>
                  {typeof post.read_count === "number" && post.read_count > 0 ? (
                    <p className="mt-0.5 text-[10.5px] text-ink-muted">
                      {post.read_count.toLocaleString()} reads
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <Suspense fallback={null}>
              <HeaderCoAuthors
                authorId={author?.id ?? null}
                secondaryDataPromise={secondaryDataPromise}
                mode="editorial"
              />
            </Suspense>
          </div>
        </header>
      ) : (
        <header className="relative left-1/2 -mt-6 w-[calc(100vw-16px)] -translate-x-1/2 overflow-hidden bg-gradient-to-br from-[#022c22] via-[#064e3b] to-[#115e59] px-4 py-14 text-white sm:px-6 sm:py-16 lg:px-8">
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.14) 1px, transparent 0)",
              backgroundSize: "22px 22px",
            }}
            aria-hidden="true"
          />
          <div className="relative z-10 mx-auto max-w-[1200px]">
            {/* Kicker row */}
            <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
                {basicQualitySummary.contentLabel}
              </span>
              <span className="h-[3px] w-[3px] rounded-full bg-white opacity-40" aria-hidden="true" />
              <span className="text-[12px] text-white/60">{readTime} min read</span>
              <span className="h-[3px] w-[3px] rounded-full bg-white opacity-40" aria-hidden="true" />
              <span className="text-[12px] text-white/60">{wordCount.toLocaleString()} words</span>
            </div>

            {/* Tags */}
            {post.tags && post.tags.length > 0 ? (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {post.tags.slice(0, 5).map((tag, index) => (
                  <Link
                    key={tag}
                    href={`/topics/${encodeURIComponent(tag)}`}
                    className={`inline-flex items-center rounded-full border border-white/15 bg-white/[0.08] px-3 py-0.5 text-[10.5px] font-medium text-white/75 transition-colors hover:border-white/35 hover:text-white ${index >= 3 ? "hidden sm:inline-flex" : ""}`}
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            ) : null}

            <Suspense fallback={null}>
              <ParentPostLink parentPostId={parentPostId} mode="magazine" />
            </Suspense>

            <h1 className="font-display max-w-[760px] text-[32px] font-bold leading-[1.12] tracking-normal text-white sm:text-[50px] sm:leading-[1.04] lg:text-[56px]">
              {post.title}
            </h1>

            {sanitizedExcerpt ? (
              <p className="font-display mt-4 line-clamp-4 max-w-[650px] text-[16px] font-normal italic leading-[1.62] text-white/80 sm:line-clamp-none sm:text-[21px] sm:leading-[1.55]">
                {sanitizedExcerpt}
              </p>
            ) : null}

            {author ? (
              <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/10 pt-3.5 sm:flex-nowrap sm:gap-4">
                <Link href={`/${author.username}`} className="shrink-0">
                  <UserAvatar
                    name={authorName}
                    src={author.avatar_url}
                    size={44}
                    className="flex-shrink-0 overflow-hidden rounded-full ring-2 ring-white/25"
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/${author.username}`}
                      className="text-[13.5px] font-semibold text-white transition-colors hover:text-emerald-100"
                    >
                      {authorName}
                    </Link>
                    {author.verified ? (
                      <span
                        title={author.verified_type ? `Verified ${author.verified_type}` : "Verified"}
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-brand px-2 py-0.5 text-[9.5px] font-bold text-white"
                      >
                        {"\u2713"}{" "}
                        {author.verified_type
                          ? author.verified_type.charAt(0).toUpperCase() + author.verified_type.slice(1)
                          : "Verified"}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-white/55">
                    {[author.field_of_study, author.university].filter(Boolean).join(" / ")}
                  </p>
                </div>
                <div className="w-full shrink-0 border-t border-white/10 pt-3 text-left sm:ml-auto sm:w-auto sm:border-t-0 sm:pt-0 sm:text-right">
                  <p className="text-[12px] font-semibold text-white/75">
                    {formatDate(post.published_at ?? post.created_at)}
                  </p>
                  {typeof post.read_count === "number" && post.read_count > 0 ? (
                    <p className="mt-0.5 text-[10.5px] text-white/45">
                      {post.read_count.toLocaleString()} reads
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <Suspense fallback={null}>
              <HeaderCoAuthors
                authorId={author?.id ?? null}
                secondaryDataPromise={secondaryDataPromise}
                mode="magazine"
              />
            </Suspense>
          </div>
        </header>
      )}

      {postHeroMode === "magazine" ? (
        <div
          className="relative left-1/2 h-12 w-[calc(100vw-16px)] -translate-x-1/2 bg-gradient-to-b from-[#115e59]/20 to-canvas"
          aria-hidden="true"
        />
      ) : (
        <div className="h-6" aria-hidden="true" />
      )}

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-start gap-0 px-4 pb-20 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_272px] lg:gap-[52px] lg:px-8">
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

          <Suspense fallback={<SectionSkeleton rows={2} />}>
            <PublicationSignalBlock
              post={post}
              author={author}
              secondaryDataPromise={secondaryDataPromise}
              variant="standalone"
            />
          </Suspense>

          {post.audio_summary_url ? (
            <AudioSummaryPlayer audioUrl={post.audio_summary_url} />
          ) : null}

          <div className="article-journal-body relative mb-10 sm:mb-16">
            <HighlightShare containerId="post-article-prose" postSlug={post.slug} postId={post.id} />
            <div
              id="post-article-prose"
              className="article-journal-body prose prose-gray max-w-[680px] prose-lg prose-a:text-emerald-brand prose-headings:font-semibold prose-headings:tracking-normal prose-headings:text-gray-900"
              dangerouslySetInnerHTML={{ __html: contentWithIds }}
            />
          </div>

          {isPublished ? <ResponsePromptPanel postId={post.id} /> : null}

          <Suspense fallback={<SectionSkeleton rows={2} />}>
            <MobileCredibilitySection
              post={post}
              author={author}
              sanitizedContent={sanitizedContent}
              wordCount={wordCount}
              parentPostId={parentPostId}
              isPublished={isPublished}
              secondaryDataPromise={secondaryDataPromise}
            />
          </Suspense>

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

          <hr className="my-9 border-gray-200/80" />

          <Suspense fallback={<SectionSkeleton rows={3} />}>
            <PostRelatedSection secondaryDataPromise={secondaryDataPromise} />
          </Suspense>

          <hr className="mb-8 border-gray-200/80" />

          <Suspense fallback={<CommentsSkeleton />}>
            <CommentsLoader
              postId={post.id}
              userId={userId}
              userProfileId={userId}
            />
          </Suspense>

          <Suspense fallback={<SectionSkeleton rows={3} />}>
            <PostResponsesSection secondaryDataPromise={secondaryDataPromise} />
          </Suspense>
        </main>

        <Suspense
          fallback={
            <aside className="hidden lg:block">
              <div className="sticky top-24 space-y-4">
                <SectionSkeleton rows={5} />
                <SectionSkeleton rows={3} />
              </div>
            </aside>
          }
        >
          <PostSidebar
            post={post}
            author={author}
            userId={userId}
            headings={headings}
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
  );
}
