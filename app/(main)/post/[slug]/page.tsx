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
import AuthorBioCard from "./AuthorBioCard";
import HighlightShare from "./HighlightShare";
import PublishedToast from "./PublishedToast";
import PostCover from "@/components/post/PostCover";
import PostConversationView from "./PostConversationView";
import DiscussionSection from "./DiscussionSection";
import PostActionsRow from "./PostActionsRow";
import PublicationIdentity from "./PublicationIdentity";
import PublicationMoreMenu from "./PublicationMoreMenu";
import { sanitizePostHtml } from "@/lib/sanitizePostHtml";
import { stripLeadingEmptyParagraphs } from "@/lib/articleTypography";
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

interface AuthorPublication {
  id: string;
  title: string | null;
  slug: string;
  content_kind?: string | null;
  published_at: string | null;
  created_at: string;
  excerpt: string | null;
  content: string | null;
}

interface SecondaryData {
  references: ReferenceRecord[];
  commentCount: number;
  likeCount: number;
  bookmarkCount: number;
  moreFromAuthor: AuthorPublication[];
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

function injectHeadingIds(content: string): string {
  let index = 0;
  return content.replace(
    /<h([23])([^>]*)>([\s\S]*?)<\/h[23]>/gi,
    (_match, level: string, attrs: string, inner: string) => {
      const id = `heading-${index++}`;
      return `<h${level}${attrs} id="${id}">${inner}</h${level}>`;
    }
  );
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

function formatPublicationDate(value: string | null): string {
  const date = new Date(value ?? Date.now());
  const currentYear = new Date().getFullYear();
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === currentYear ? {} : { year: "numeric" as const }),
  }).format(date);
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
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

async function getSecondaryData(
  postId: string,
  isPublished: boolean,
  authorId: string | null,
  viewerId: string | null
): Promise<SecondaryData> {
  const supabase = await createClient();
  const repository = postPageRepository(supabase);

  const [counts, collections, moreFromAuthor] = await Promise.all([
    repository.counts(postId),
    repository.collections(postId, viewerId),
    isPublished && authorId
      ? repository.moreFromAuthor(postId, authorId, 3, viewerId)
      : Promise.resolve([]),
  ]);

  return {
    references: collections.references as ReferenceRecord[],
    commentCount: counts.commentCount,
    likeCount: counts.likeCount,
    bookmarkCount: counts.bookmarkCount,
    moreFromAuthor: moreFromAuthor as AuthorPublication[],
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

  const viewerState = await postPageRepository(supabase).viewerState(
    postId,
    userId,
    authorId ?? null
  );

  return {
    userLiked: viewerState.liked,
    userBookmarked: viewerState.bookmarked,
    userFollowsAuthor: viewerState.following,
  };
}

function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3 motion-reduce:animate-none">
      <div className="h-4 w-24 rounded bg-gray-200" />
      {[...Array(rows)].map((_, index) => (
        <div key={index} className="h-4 rounded bg-canvas" />
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
  readTime,
}: {
  readTime: number;
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
    <div className="mt-[18px] flex items-center gap-2.5 font-public-sans sm:mt-6 sm:gap-3">
      <Link href={`/${author.username}`} className="shrink-0">
        <UserAvatar
          name={authorName}
          src={author.avatar_url}
          size={40}
          className="!h-[34px] !w-[34px] overflow-hidden rounded-full sm:!h-10 sm:!w-10"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/${author.username}`}
          className="flex items-center gap-1.5 text-[13.5px] sm:text-[14.5px] font-semibold leading-5 text-ink transition-colors hover:text-emerald-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          <span className="truncate">{authorName}</span>
          <PublicationIdentity verified={author.verified} />
        </Link>
        {author.professional_title ? (
          <p className="mt-0.5 hidden truncate sm:block text-[12.5px] leading-5 text-[#69726D]">
            {author.professional_title}
          </p>
        ) : null}
        <p className="mt-0.5 text-[11.5px] text-ink-faint sm:hidden">
          {formatPublicationDate(post.published_at ?? post.created_at)} · {readTime} min read
        </p>
      </div>
      {isOwnPost ? null : (
        <FollowButton
          followingId={author.id}
          currentUserId={userId}
          initialFollowing={userId ? viewer.userFollowsAuthor : false}
          authorName={authorName}
          className="publication-follow"
          source="post_header"
          postId={post.id}
        />
      )}
      <PublicationMoreMenu
        postId={post.id}
        slug={post.slug}
        title={getPostMetadataTitle(post, author)}
        status={post.status}
        isOwner={isOwnPost}
        viewerId={userId}
        ownerUsername={author.username}
      />
    </div>
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
    <section id="references" className="mb-8 scroll-mt-24 border-t border-[#E9E5DE] pt-6">
      <div className="mb-4 flex items-center justify-between gap-3 font-public-sans">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          Sources
        </h2>
        <span className="text-[12px] text-ink-muted">{references.length} listed</span>
      </div>
      <ol className="font-public-sans">
        {references.map((reference, index) => (
          <li
            key={reference.id}
            id={`ref-${index + 1}`}
            className="flex gap-3 border-t border-divider py-3 text-[13px] leading-relaxed text-ink-soft first:border-t-0"
          >
            <span id={`ref-id-${reference.id}`} className="sr-only" aria-hidden="true" />
            <span className="min-w-[2rem] shrink-0 font-semibold text-emerald-ink">
              [{index + 1}]
            </span>
            <div>
              <p className="font-medium text-ink">{reference.title}</p>
              <p className="mt-0.5 text-[12px] text-ink-muted">
                {[reference.authors, reference.year, reference.source].filter(Boolean).join(" · ") ||
                  "Source details not provided"}
              </p>
              {reference.doi || reference.url ? (
                <p className="mt-1 text-[12px]">
                  {reference.doi ? <span className="mr-2 text-ink-muted">DOI: {reference.doi}</span> : null}
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
  const [secondary, viewer] = await Promise.all([secondaryDataPromise, viewerDataPromise]);

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
    />
  );
}

async function AuthorSection({
  post,
  author,
  userId,
  viewerDataPromise,
}: {
  post: PostRecord;
  author: AuthorProfile | null;
  userId: string | null;
  viewerDataPromise: Promise<ViewerData>;
}) {
  if (!author) return null;
  const viewer = await viewerDataPromise;

  return (
    <AuthorBioCard
      author={author}
      postId={post.id}
      userId={userId}
      initialFollowing={viewer.userFollowsAuthor}
    />
  );
}

async function MoreFromAuthorSection({
  author,
  secondaryDataPromise,
}: {
  author: AuthorProfile | null;
  secondaryDataPromise: Promise<SecondaryData>;
}) {
  if (!author) return null;
  const { moreFromAuthor } = await secondaryDataPromise;
  if (moreFromAuthor.length === 0) return null;

  const writerName = author.full_name ?? author.username;
  const shortName = writerName.trim().split(/\s+/)[0] || writerName;

  return (
    <section className="pb-8 pt-2 font-public-sans" aria-labelledby="more-from-author">
      <h2 id="more-from-author" className="publication-more-title text-[18px] font-semibold leading-tight text-ink">
        More from {shortName}
      </h2>
      <div className="mt-3">
        {moreFromAuthor.map((item) => {
          const isArticle = (item.content_kind ?? (item.title ? "article" : "post")) === "article";
          const itemTitle = item.title?.trim() || sanitizePostExcerpt(item.excerpt ?? item.content)?.trim() || "Post";
          const meta = isArticle
            ? `Article · ${estimateReadTime(item.content ?? "")} min read`
            : formatRelativeTime(item.published_at ?? item.created_at);

          return (
            <Link
              key={item.id}
              href={`/post/${item.slug}`}
              className="group block border-b border-[#E9E5DE] py-4 last:border-b-0"
            >
              <p className={isArticle ? "text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#8A5D1E]" : "text-[13px] text-ink-muted"}>{meta}</p>
              <p className={`mt-1 line-clamp-2 text-ink transition-colors group-hover:text-emerald-brand ${isArticle ? "publication-more-title text-[16.5px] font-semibold leading-[1.3]" : "text-[15px] leading-[1.4]"}`}>
                {itemTitle}
              </p>
            </Link>
          );
        })}
      </div>
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
  const { moreFromAuthor } = await secondaryDataPromise;
  const related = moreFromAuthor[0] ?? null;

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
              title: getPostMetadataTitle(related, author),
              slug: related.slug,
            }
          : null
      }
    />
  );
}

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
  const [post, user] = await Promise.all([getPostBySlug(slug), getCurrentUser()]);

  if (!post) return { title: "Post not found - Indegenius" };
  if (
    (post.status === "draft" || post.status === "pending" || post.status === "pending_revision") &&
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? SITE_URL;
  const ogImageUrl = `${appUrl}/api/og?${new URLSearchParams({
    title: metadataTitle,
    author: author?.full_name ?? "",
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
  const [post, user] = await Promise.all([getPostBySlug(slug), getCurrentUser()]);

  if (!post) notFound();
  if (post.status === "draft" && user?.id !== post.author_id) notFound();
  if (
    (post.status === "pending" || post.status === "pending_revision") &&
    user?.id !== post.author_id
  ) {
    notFound();
  }

  const isPublished = post.status === "published";
  const engagementToken = isPublished ? createPostEngagementToken(post.id, slug) : null;
  const author = getPostAuthor(post);
  const sanitizedContent = sanitizePostHtml(post.content);
  const sanitizedExcerpt = sanitizePostExcerpt(post.excerpt);
  const readTime = estimateReadTime(sanitizedContent);
  const wordCount = countWords(sanitizedContent);
  const headedContent = injectHeadingIds(stripLeadingEmptyParagraphs(sanitizedContent));
  const contentWithIds = renderReferenceShortcodes(headedContent);
  const authorName = author?.full_name ?? author?.username ?? "Anonymous";
  const displayTitle = getPostDisplayTitle(post);
  const metadataTitle = getPostMetadataTitle(post, author);
  const userId = user?.id ?? null;
  const secondaryDataPromise = getSecondaryData(post.id, isPublished, author?.id ?? null, userId);
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

  if (resolvedKind === "post") {
    return (
      <PostEngagementProvider postId={post.id} userId={userId} contentKind={resolvedKind}>
        <div className="publication-detail relative">
          {articleJsonLd ? <ArticleJsonLd data={articleJsonLd} /> : null}
          {isPublished ? (
            <ViewTracker slug={slug} wordCount={wordCount} engagementToken={engagementToken} />
          ) : null}
          <Suspense fallback={<SectionSkeleton rows={6} />}>
            <PostConversationView
              post={post}
              author={author}
              userId={userId}
              bodyHtml={contentWithIds}
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
      <div className="publication-detail relative">
        {articleJsonLd ? <ArticleJsonLd data={articleJsonLd} /> : null}
        {isPublished ? (
          <>
            <ReadingProgressBar />
            <ViewTracker slug={slug} wordCount={wordCount} engagementToken={engagementToken} />
          </>
        ) : null}

        <div className="mx-auto max-w-[740px] pb-20">
          <Suspense fallback={null}>
            <PostPublishSuccessSection
              post={post}
              author={author}
              secondaryDataPromise={secondaryDataPromise}
            />
          </Suspense>

          {post.status === "draft" ? (
            <div className="mb-6 rounded-xl border border-card-border bg-canvas p-4 font-public-sans text-sm text-ink-soft">
              This post is a <strong>draft</strong> and is only visible to you.{" "}
              <Link href={`/edit/${post.slug}`} className="font-semibold underline">
                Edit &amp; publish
              </Link>
            </div>
          ) : null}

          <header className="pt-2 sm:pt-4">
            {displayTitle ? (
              <h1 className="publication-article-title text-[36px] font-semibold leading-[1.16] tracking-[-0.01em] text-ink sm:text-[44px]">
                {displayTitle}
              </h1>
            ) : null}

            {sanitizedExcerpt ? (
              <p className="mt-3 max-w-[690px] font-public-sans text-[16px] leading-[1.5] sm:mt-4 sm:leading-[1.55] text-[#4B5550] sm:text-[19px]">
                {sanitizedExcerpt}
              </p>
            ) : null}

            <Suspense fallback={<div className="mt-6 h-10 animate-pulse rounded-lg bg-canvas motion-reduce:animate-none" />}>
              <DetailAuthorRow
                post={post}
                author={author}
                authorName={authorName}
                readTime={readTime}
                userId={userId}
                viewerDataPromise={viewerDataPromise}
              />
            </Suspense>

            <p className={`${author ? "hidden sm:block " : ""}mt-3 font-mono text-[12.5px] leading-5 text-[#79817D]`}>
              {formatPublicationDate(post.published_at ?? post.created_at)} · {readTime} min read
            </p>
          </header>

          {post.cover_image_url ? (
            <div className="mt-[18px] sm:mt-7">
              <PostCover
                fallbackClassName="publication-media-fallback"
                fallbackLabel="Image unavailable"
                src={post.cover_image_url}
                alt={post.title}
                content_kind={post.content_kind}
                sizes="(max-width: 780px) calc(100vw - 32px), 740px"
                priority
                className="aspect-[16/9] w-full overflow-hidden rounded-[8px] bg-canvas"
                imageClassName="object-cover"
              />
            </div>
          ) : null}

          <div className="pt-6 sm:pt-9">
            <div className="publication-article-body relative">
              <HighlightShare containerId="post-article-prose" />
              <div
                id="post-article-prose"
                dangerouslySetInnerHTML={{ __html: contentWithIds }}
              />
            </div>

            <div className="mt-10 sm:mt-12">
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

              <Suspense fallback={<SectionSkeleton rows={3} />}>
                <AuthorSection
                  post={post}
                  author={author}
                  userId={userId}
                  viewerDataPromise={viewerDataPromise}
                />
              </Suspense>

              {isPublished ? (
                <Suspense fallback={<SectionSkeleton rows={3} />}>
                  <MoreFromAuthorSection
                    author={author}
                    secondaryDataPromise={secondaryDataPromise}
                  />
                </Suspense>
              ) : null}

              <Suspense fallback={<SectionSkeleton rows={3} />}>
                <PostDiscussion
                  post={post}
                  userId={userId}
                  secondaryDataPromise={secondaryDataPromise}
                />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </PostEngagementProvider>
  );
}
