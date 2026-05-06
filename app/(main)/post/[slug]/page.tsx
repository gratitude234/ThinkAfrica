import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import Tag from "@/components/ui/Tag";
import UserAvatar from "@/components/ui/UserAvatar";
import {
  formatDate,
  POST_POINTS,
  sanitizePostExcerpt,
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
import AudioSummaryPlayer from "@/components/post/AudioSummaryPlayer";
import PostCover from "@/components/post/PostCover";
import CollaborationPanel from "@/components/collaboration/CollaborationPanel";
import CredibilityPanel from "@/components/post/CredibilityPanel";
import ResponseStartLink from "@/components/post/ResponseStartLink";
import { getCollaborationSummary } from "@/lib/collaboration";
import { getMessageEligibility } from "@/lib/messaging";
import { getPostQualitySummary } from "@/lib/postQuality";
import { sanitizePostHtml } from "@/lib/sanitizePostHtml";

interface PageProps {
  params: Promise<{ slug: string }>;
}

interface ResponsePostRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  published_at: string | null;
  profiles:
    | {
        username: string;
        full_name: string | null;
        avatar_url: string | null;
        verified?: boolean;
      }
    | {
        username: string;
        full_name: string | null;
        avatar_url: string | null;
        verified?: boolean;
      }[];
}

interface ParentPostRef {
  id: string;
  title: string;
  slug: string;
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

function throwPostQueryError(slug: string, stage: "metadata" | "page", error: unknown): never {
  console.error(`[post/${slug}] ${stage} query failed`, error);
  throw new Error(`Failed to load post "${slug}".`);
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
      "title, excerpt, cover_image_url, slug, status, author_id, type, profiles!posts_author_id_fkey(full_name, university)"
    )
    .eq("slug", slug)
    .in("status", ["published", "pending", "pending_revision", "draft"])
    .maybeSingle();

  if (postError) {
    throwPostQueryError(slug, "metadata", postError);
  }

  if (!post) return { title: "Post not found - ThinkAfrica" };
  // Drafts and in-review posts are only visible to the author (and assigned reviewers/co-authors)
  if (
    (post.status === "draft" ||
      post.status === "pending" ||
      post.status === "pending_revision") &&
    user?.id !== post.author_id
  ) {
    return { title: "Post not found - ThinkAfrica" };
  }

  const author = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;
  const coverUrl = (post as { cover_image_url?: string | null }).cover_image_url;
  const description = sanitizePostExcerpt(post.excerpt);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://thinkafrica.com";
  const ogImageUrl = `${appUrl}/api/og?${new URLSearchParams({
    title: post.title,
    author: author?.full_name ?? "",
    university: author?.university ?? "",
    type: post.type ?? "essay",
  }).toString()}`;
  const ogImage = coverUrl ?? ogImageUrl;

  return {
    title: `${post.title} - ThinkAfrica`,
    description: description ?? `Read this post by ${author?.full_name} on ThinkAfrica`,
    openGraph: {
      title: post.title,
      description: description ?? "",
      url: `${appUrl}/post/${post.slug}`,
      siteName: "ThinkAfrica",
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: description ?? "",
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

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select(
      `
      id, title, slug, content, excerpt, type, tags, status, author_id,
      created_at, published_at, view_count, cover_image_url, citation_id,
      in_response_to,
      audio_summary_url,
      profiles!posts_author_id_fkey (id, username, full_name, university, field_of_study, bio, avatar_url, verified, verified_type)
    `
    )
    .eq("slug", slug)
    .in("status", ["published", "pending", "pending_revision", "draft"])
    .maybeSingle();

  if (postError) {
    throwPostQueryError(slug, "page", postError);
  }

  if (!post) notFound();

  // Draft posts: only visible to the author
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
  const author = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;
  const coverImageUrl = (post as { cover_image_url?: string | null }).cover_image_url;
  const audioSummaryUrl = (
    post as typeof post & { audio_summary_url?: string | null }
  ).audio_summary_url ?? null;
  const parentPostId = (post as typeof post & { in_response_to?: string | null })
    .in_response_to ?? null;
  let parentPost: ParentPostRef | null = null;

  if (parentPostId) {
    const { data: parentPostData, error: parentPostError } = await supabase
      .from("posts")
      .select("id, title, slug")
      .eq("id", parentPostId)
      .eq("status", "published")
      .maybeSingle();

    if (parentPostError) {
      console.error(`[post/${slug}] parent post query failed`, parentPostError);
    } else {
      parentPost = parentPostData;
    }
  }

  const [
    { count: likeCount },
    { data: referencesRaw },
    { data: coAuthorsRaw },
    { data: responsePostsRaw },
    { data: reviewsRaw },
    { count: commentCount },
    { count: bookmarkCount },
  ] = await Promise.all([
    supabase
      .from("likes")
      .select("*", { count: "exact", head: true })
      .eq("post_id", post.id),
    supabase
      .from("post_references")
      .select("*")
      .eq("post_id", post.id)
      .order("display_order", { ascending: true }),
    supabase
      .from("post_authors")
      .select(
        "user_id, display_order, corresponding_author, accepted_at, profile:profiles!post_authors_user_id_fkey(username, full_name)"
      )
      .eq("post_id", post.id)
      .not("accepted_at", "is", null)
      .order("display_order", { ascending: true }),
    supabase
      .from("posts")
      .select(
        "id, title, slug, excerpt, published_at, profiles!posts_author_id_fkey(username, full_name, avatar_url, verified)"
      )
      .eq("in_response_to", post.id)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(10),
    supabase.from("post_reviews").select("submitted_at").eq("post_id", post.id),
    supabase
      .from("comments")
      .select("*", { count: "exact", head: true })
      .eq("post_id", post.id),
    supabase
      .from("bookmarks")
      .select("*", { count: "exact", head: true })
      .eq("post_id", post.id),
  ]);

  let userLiked = false;
  let userBookmarked = false;
  if (user) {
    const [{ data: existingLike }, { data: existingBookmark }] = await Promise.all([
      supabase
        .from("likes")
        .select("user_id")
        .eq("post_id", post.id)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("bookmarks")
        .select("user_id")
        .eq("post_id", post.id)
        .eq("user_id", user.id)
        .single(),
    ]);
    userLiked = !!existingLike;
    userBookmarked = !!existingBookmark;
  }

  const userProfileId: string | null = user?.id ?? null;

  let relatedPosts: Array<{
    id: string;
    title: string;
    slug: string;
    type: string;
    published_at: string | null;
    created_at: string;
    profiles: { full_name: string; username: string } | null;
  }> = [];
  if (isPublished && post.tags && post.tags.length > 0) {
    const { data: relatedRaw } = await supabase
      .from("posts")
      .select(
        "id, title, slug, type, published_at, created_at, profiles!posts_author_id_fkey (full_name, username)"
      )
      .eq("status", "published")
      .neq("id", post.id)
      .overlaps("tags", post.tags)
      .order("published_at", { ascending: false })
      .limit(3);

    relatedPosts = (relatedRaw ?? []).map((item) => ({
      ...item,
      profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles,
    }));
  }

  let userFollowsAuthor = false;
  if (user && author) {
    const { data: followData } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", user.id)
      .eq("following_id", author.id)
      .single();
    userFollowsAuthor = !!followData;
  }

  const messageEligibility =
    user && author ? await getMessageEligibility(supabase, user.id, author.id) : null;

  const references = referencesRaw ?? [];
  const acceptedAuthors = (coAuthorsRaw ?? []).map((item) => ({
    ...item,
    profile: Array.isArray(item.profile) ? item.profile[0] : item.profile,
  }));
  const responsePosts = ((responsePostsRaw ?? []) as ResponsePostRow[]).map(
    (response) => ({
      ...response,
      profiles: Array.isArray(response.profiles)
        ? response.profiles[0]
        : response.profiles,
    })
  );
  const primaryAuthorRecord = acceptedAuthors.find((record) => record.user_id === author?.id) ?? null;
  const coAuthors = acceptedAuthors.filter((record) => record.user_id !== author?.id);
  const citationAuthors = (
    acceptedAuthors.length > 0
      ? acceptedAuthors.map((authorRecord) => ({
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

  const sanitizedContent = sanitizePostHtml(post.content);
  const sanitizedExcerpt = sanitizePostExcerpt(post.excerpt);
  const readTime = estimateReadTime(sanitizedContent);
  const wordCount = countWords(sanitizedContent);
  const headings = extractHeadings(sanitizedContent);
  const contentWithIds = renderReferenceShortcodes(
    injectHeadingIds(sanitizedContent)
  );
  const authorName = author?.full_name ?? author?.username ?? "Anonymous";
  const qualitySummary = getPostQualitySummary({
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
    referenceCount: references.length,
    responseCount: responsePosts.length,
    reviewCount: reviewsRaw?.length ?? 0,
    completedReviewCount:
      reviewsRaw?.filter((review) => Boolean(review.submitted_at)).length ?? 0,
    commentCount: commentCount ?? 0,
    likeCount: likeCount ?? 0,
    bookmarkCount: bookmarkCount ?? 0,
  });
  const collaborationSummary = getCollaborationSummary({
    postId: post.id,
    postSlug: post.slug,
    authorId: author?.id ?? null,
    viewerId: user?.id ?? null,
    responseCount: responsePosts.length,
    coauthorCount: coAuthors.length,
    isFollowingAuthor: userFollowsAuthor,
    messageEligible: messageEligibility?.eligible ?? false,
    messageReason: messageEligibility?.reason ?? null,
  });

  return (
    <div className="relative">
      {isPublished ? (
        <>
          <ReadingBar
            postId={post.id}
            userId={user?.id ?? null}
            initialLiked={userLiked}
            initialLikeCount={likeCount ?? 0}
            initialBookmarked={userBookmarked}
            title={post.title}
            slug={post.slug}
          />
          <ReadingProgressBar />
          <ViewTracker slug={slug} />
        </>
      ) : null}

      <PublishedToast
        title={post.title}
        slug={post.slug}
        points={POST_POINTS[(post.type as PostType) ?? "blog"] ?? 10}
        username={author?.username ?? ""}
      />

      <div className="mx-auto max-w-[1180px]">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            <div className="max-w-[760px]">
              {post.status === "draft" ? (
                <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                  This post is a <strong>draft</strong> and is only visible to you.{" "}
                  <Link href={`/edit/${post.slug}`} className="font-semibold underline">
                    Edit &amp; publish
                  </Link>
                </div>
              ) : null}

              {post.status === "pending" || post.status === "pending_revision" ? (
                <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  This submission is in the editorial workflow. We&apos;ll
                  notify you when a final decision is recorded.{" "}
                  <Link href="/dashboard" className="font-semibold underline">
                    View dashboard
                  </Link>
                </div>
              ) : null}

              <header className="mb-7 sm:mb-8">
                {/* Kicker - post type + word count + read time */}
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-brand sm:mb-5">
                  {qualitySummary.contentLabel}
                  <span className="mx-2 text-gray-300">/</span>
                  <span className="text-ink-muted">
                    {wordCount.toLocaleString()} words / {readTime} min read
                  </span>
                </p>

                {parentPost ? (
                  <Link
                    href={`/post/${parentPost.slug}`}
                    className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-emerald-600"
                  >
                    <span aria-hidden="true">{"\u21A9"}</span>
                    <span>
                      In response to:{" "}
                      <span className="font-medium text-gray-600">{parentPost.title}</span>
                    </span>
                  </Link>
                ) : null}

                {/* Tags - moved below kicker, before title */}
                {post.tags && post.tags.length > 0 ? (
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {post.tags.map((tag: string) => (
                      <Link key={tag} href={`/topics/${encodeURIComponent(tag)}`}>
                        <Tag label={tag} />
                      </Link>
                    ))}
                  </div>
                ) : null}

                {/* Title - enlarged to match journal scale */}
                <h1 className="font-display mb-4 text-[36px] font-semibold leading-[1.06] tracking-tight text-ink sm:mb-5 sm:text-[46px]">
                  {post.title}
                </h1>

                {/* Deck / standfirst - rendered from excerpt if present */}
                {sanitizedExcerpt ? (
                  <p className="font-display mb-6 text-lg font-normal italic leading-[1.45] text-gray-600 sm:text-[21px]">
                    {sanitizedExcerpt}
                  </p>
                ) : null}

                {coverImageUrl ? (
                  <div className="mb-6 overflow-hidden rounded-2xl">
                    <PostCover
                      src={coverImageUrl}
                      alt={post.title}
                      type={post.type}
                      sizes="(max-width: 760px) 100vw, 760px"
                      priority
                      className="aspect-[16/9] w-full"
                      imageClassName="object-cover object-center"
                    />
                  </div>
                ) : null}

                {author ? (
                  <div className="flex items-center gap-4 border-y border-gray-100 py-4">
                    <Link href={`/${author.username}`} className="shrink-0">
                      <UserAvatar
                        name={authorName}
                        src={author.avatar_url}
                        size={48}
                        className="flex-shrink-0"
                      />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/${author.username}`}
                          className="text-[14px] font-semibold text-gray-900 transition-colors hover:text-emerald-700"
                        >
                          {authorName}
                        </Link>
                        {author.verified ? (
                          <span
                            title={author.verified_type ? `Verified ${author.verified_type}` : "Verified"}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white"
                          >
                            {"\u2713"} {author.verified_type ? author.verified_type.charAt(0).toUpperCase() + author.verified_type.slice(1) : "Verified"}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[12px] text-gray-500">
                        {[author.field_of_study, author.university].filter(Boolean).join(" \u00b7 ")}
                      </p>
                    </div>
                    <div className="ml-auto shrink-0 text-right">
                      <p className="text-[12.5px] font-semibold text-gray-700">
                        {formatDate(post.published_at ?? post.created_at)}
                      </p>
                      {post.view_count ? (
                        <p className="text-[11px] text-gray-400">{post.view_count.toLocaleString()} reads</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {coAuthors.length > 0 ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {coAuthors.map((coAuthor) => (
                      <Link
                        key={coAuthor.user_id}
                        href={`/${coAuthor.profile?.username}`}
                        className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:border-emerald-200 hover:text-emerald-brand"
                      >
                        {coAuthor.corresponding_author ? "Corresponding / " : ""}
                        {coAuthor.profile?.full_name ?? coAuthor.profile?.username}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </header>

              <div className="mb-7 lg:hidden">
                <CredibilityPanel
                  postId={post.id}
                  summary={qualitySummary}
                  isPublished={isPublished}
                />
              </div>

              {audioSummaryUrl ? (
                <AudioSummaryPlayer audioUrl={audioSummaryUrl} />
              ) : null}

              <hr className="mb-8 border-gray-200" />

              <div className="article-journal-body relative mb-8">
                <HighlightShare containerId="post-article-prose" />
                <div
                  id="post-article-prose"
                  className="article-journal-body prose prose-gray max-w-none prose-lg prose-a:text-emerald-brand prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-gray-900"
                  dangerouslySetInnerHTML={{ __html: contentWithIds }}
                />
              </div>

              {references.length > 0 ? (
                <section className="mb-8 border-t border-gray-200 pt-6">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                      References
                    </h2>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                      {references.length} listed
                    </span>
                  </div>
                  <ol>
                    {references.map((reference, index) => (
                      <li
                        key={reference.id}
                        id={`ref-${index + 1}`}
                        className="flex gap-3 border-t border-gray-100 py-3 text-sm leading-relaxed text-gray-600 first:border-t-0"
                      >
                        <span className="min-w-[2rem] shrink-0 font-bold text-emerald-600">
                          [{index + 1}]
                        </span>
                        <div>
                          <p className="font-medium text-gray-900">
                            {reference.title}
                          </p>
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

              {isPublished && post.citation_id ? (
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

              {isPublished ? (
                <>
                  {/* Unified action strip - like, bookmark, share consolidated here */}
                  <div className="mb-8 flex flex-col gap-4 border-y border-gray-200 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                      <LikeButton
                        postId={post.id}
                        initialLiked={userLiked}
                        initialCount={likeCount ?? 0}
                        userId={user?.id ?? null}
                      />
                      <BookmarkButton
                        postId={post.id}
                        initialBookmarked={userBookmarked}
                        userId={user?.id ?? null}
                      />
                    </div>
                    <ShareButtons
                      title={post.title}
                      slug={post.slug}
                      excerpt={sanitizedExcerpt}
                      authorName={author?.full_name ?? null}
                    />
                    <span className="text-xs text-gray-400">
                      {post.view_count?.toLocaleString()}{" "}
                      {post.view_count === 1 ? "view" : "views"}
                    </span>
                  </div>

                  {author ? (
                    <CollaborationPanel
                      summary={collaborationSummary}
                      authorName={authorName}
                    />
                  ) : null}
                </>
              ) : null}

              {author ? (
                <AuthorBioCard
                  author={author}
                  userId={user?.id ?? null}
                  initialFollowing={userFollowsAuthor}
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
              ) : null}

              <hr className="my-8 border-gray-200" />

              {relatedPosts.length > 0 ? (
                <section className="mb-8">
                  <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                    Related
                  </h2>
                  <div className="grid grid-cols-3 gap-3">
                    {relatedPosts.map((item) => (
                      <Link
                        key={item.id}
                        href={`/post/${item.slug}`}
                        className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md"
                      >
                        <div className="h-[96px] overflow-hidden">
                          <PostCover
                            src={null}
                            alt={item.title}
                            type={item.type}
                            sizes="200px"
                            className="h-full w-full"
                            imageClassName="object-cover"
                          />
                        </div>
                        <div className="flex flex-1 flex-col p-3">
                          <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-gray-900 transition-colors group-hover:text-emerald-brand">
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
              ) : null}

              <hr className="mb-8 border-gray-200" />

              <Suspense
                fallback={
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
                }
              >
                <CommentsLoader
                  postId={post.id}
                  userId={user?.id ?? null}
                  userProfileId={userProfileId}
                />
              </Suspense>

              {responsePosts.length > 0 ? (
                <section id="responses" className="mt-10 scroll-mt-24">
                  <h2 className="mb-4 text-lg font-semibold text-gray-900">
                    Responses ({responsePosts.length})
                  </h2>
                  <div className="space-y-4">
                    {responsePosts.map((response) => {
                      const responseAuthor = response.profiles;

                      return (
                        <Link
                          key={response.id}
                          href={`/post/${response.slug}`}
                          className="flex gap-4 rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm"
                        >
                          <div className="w-1 flex-shrink-0 self-stretch rounded-full bg-emerald-400" />
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
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 italic">
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
              ) : null}
            </div>
          </div>

          <aside className="hidden lg:block">
            <div className="space-y-4">
              <TableOfContents headings={headings} />
              <CredibilityPanel
                postId={post.id}
                summary={qualitySummary}
                isPublished={isPublished}
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
