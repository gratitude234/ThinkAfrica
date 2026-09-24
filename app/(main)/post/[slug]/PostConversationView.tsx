import PublicationIdentity from "./PublicationIdentity";
import Link from "next/link";
import UserAvatar from "@/components/ui/UserAvatar";
import PostImage from "@/components/post/PostImage";
import PublishedToast from "./PublishedToast";
import PostActionsRow from "./PostActionsRow";
import DiscussionSection from "./DiscussionSection";
import PublicationMoreMenu from "./PublicationMoreMenu";
import { getPostDisplayTitle, getPostMetadataTitle } from "@/lib/postDisplay";
import { formatRelativeTime } from "@/lib/utils";

interface ConversationAuthor {
  verified?: boolean;
  id: string;
  username: string;
  full_name: string | null;
  professional_title?: string | null;
  avatar_url: string | null;
}

interface ConversationPost {
  id: string;
  slug: string;
  title: string | null;
  content_kind?: string | null;
  status: string;
  created_at: string;
  published_at: string | null;
  cover_image_url: string | null;
  tags: string[] | null;
}

interface ConversationSecondary {
  references: Array<{
    id: string;
    title: string | null;
    authors: string | null;
    year: number | null;
    source: string | null;
    doi: string | null;
    url: string | null;
  }>;
  commentCount: number;
  likeCount: number;
  bookmarkCount: number;
  moreFromAuthor: Array<{
    id: string;
    title: string | null;
    slug: string;
    content_kind?: string | null;
    published_at: string | null;
    created_at: string;
    excerpt: string | null;
    content: string | null;
  }>;
}

interface ConversationViewer {
  userLiked: boolean;
  userBookmarked: boolean;
  userFollowsAuthor: boolean;
}

interface PostConversationViewProps {
  post: ConversationPost;
  author: ConversationAuthor | null;
  userId: string | null;
  bodyHtml: string;
  sanitizedExcerpt: string | null;
  authorName: string;
  metadataTitle: string;
  secondaryDataPromise: Promise<ConversationSecondary>;
  viewerDataPromise: Promise<ConversationViewer>;
}

export default async function PostConversationView({
  post,
  author,
  userId,
  bodyHtml,
  sanitizedExcerpt,
  authorName,
  metadataTitle,
  secondaryDataPromise,
  viewerDataPromise,
}: PostConversationViewProps) {
  const [secondary, viewer] = await Promise.all([secondaryDataPromise, viewerDataPromise]);
  const isPublished = post.status === "published";
  const isOwnPost = Boolean(userId && author && userId === author.id);
  const relatedPost = secondary.moreFromAuthor[0] ?? null;
  const displayTitle = getPostDisplayTitle(post);

  return (
    <div className="mx-auto max-w-[700px] pb-20 font-public-sans">
      <PublishedToast
        postId={post.id}
        contentKind={post.content_kind ?? null}
        title={metadataTitle}
        slug={post.slug}
        username={author?.username ?? ""}
        relatedTarget={
          relatedPost
            ? {
                id: relatedPost.id,
                title: getPostMetadataTitle(relatedPost, author),
                slug: relatedPost.slug,
              }
            : null
        }
      />

      {post.status === "draft" ? (
        <div className="mb-6 rounded-xl border border-card-border bg-canvas p-4 text-sm text-ink-soft">
          This post is a <strong>draft</strong> and is only visible to you.{" "}
          <Link href={`/edit/${post.slug}`} className="font-semibold underline">
            Edit &amp; publish
          </Link>
        </div>
      ) : null}

      {author ? (
        <header className="flex items-center gap-3 pt-2 sm:pt-4">
          <Link href={`/${author.username}`} className="shrink-0">
            <UserAvatar
              name={authorName}
              src={author.avatar_url}
              size={38}
              className="overflow-hidden rounded-full"
            />
          </Link>
          <div className="min-w-0 flex-1 text-[13.5px] leading-5">
            <Link
              href={`/${author.username}`}
              className="inline-flex max-w-full items-center gap-1.5 align-middle font-semibold text-ink transition-colors hover:text-emerald-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
            >
              <span className="truncate">{authorName}</span>
              <PublicationIdentity verified={author.verified} />
            </Link>
            <span className="text-[#7A817D]"> · {formatRelativeTime(post.published_at ?? post.created_at)}</span>
          </div>
          <PublicationMoreMenu
            postId={post.id}
            slug={post.slug}
            title={metadataTitle}
            status={post.status}
            isOwner={isOwnPost}
            viewerId={userId}
            ownerUsername={author.username}
            compact
          />
        </header>
      ) : null}

      <div className="mt-5 sm:mt-6">
        {displayTitle ? (
          <h1 className="publication-article-title mb-3 text-[26px] font-semibold leading-tight text-ink">
            {displayTitle}
          </h1>
        ) : null}
        <div className="publication-post-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />

        {post.cover_image_url ? (
          <PostImage
            fallbackClassName="publication-media-fallback"
                fallbackLabel="Image unavailable"
                src={post.cover_image_url}
            alt="Image attached to this post"
            content_kind={post.content_kind}
            sizes="(max-width: 560px) calc(100vw - 32px), 520px"
            priority
            wrapperClassName="mt-5 max-w-[520px]"
            className="w-full overflow-hidden rounded-[8px] bg-canvas"
          />
        ) : null}

        {secondary.references.length > 0 ? (
          <section className="mt-8 border-t border-[#E9E5DE] pt-6" aria-labelledby="conversation-sources">
            <h2 id="conversation-sources" className="text-[13px] font-semibold text-ink">Sources</h2>
            <ol className="mt-3 space-y-3 text-[13px] text-ink-soft">
              {secondary.references.map((reference, index) => (
                <li key={reference.id} id={`ref-${index + 1}`} className="flex gap-3">
                  <span id={`ref-id-${reference.id}`} className="sr-only" aria-hidden="true" />
                  <span className="text-ink-muted">{index + 1}.</span>
                  <span>
                    {reference.url ? (
                      <a
                        href={reference.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-emerald-brand underline-offset-2 hover:underline"
                      >
                        {reference.title || reference.source || reference.url}
                      </a>
                    ) : (
                      <span className="font-semibold text-ink">{reference.title || reference.source}</span>
                    )}
                    {[reference.authors, reference.source, reference.year].filter(Boolean).length > 0 ? (
                      <span className="block text-ink-muted">
                        {[reference.authors, reference.source, reference.year].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>

      {isPublished ? <div className="mb-7 mt-7">
        <PostActionsRow
          postId={post.id}
          slug={post.slug}
          title={metadataTitle}
          excerpt={sanitizedExcerpt}
          authorName={author?.full_name ?? null}
          userId={userId}
          initialLiked={viewer.userLiked}
          initialLikeCount={secondary.likeCount}
          initialBookmarked={viewer.userBookmarked}
          commentCount={secondary.commentCount}
        />
      </div> : null}

      <DiscussionSection
        postId={post.id}
        userId={userId}
        userProfileId={userId}
        isPublished={isPublished}
        commentCount={secondary.commentCount}
      />
    </div>
  );
}
