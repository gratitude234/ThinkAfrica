import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import UserAvatar from "@/components/ui/UserAvatar";
import AuthorRelationshipControls from "@/components/profile/AuthorRelationshipControls";
import ReportButton from "@/components/moderation/ReportButton";
import BackLink from "@/components/ui/BackLink";
import PostImage from "@/components/post/PostImage";
import type { PostCardData } from "@/components/post/PostCard";
import PublishedToast from "./PublishedToast";
import PostActionsRow from "./PostActionsRow";
import DiscussionSection from "./DiscussionSection";
import { getPostDisplayTitle } from "@/lib/postDisplay";
import { formatRelativeTime, POST_POINTS, type PostType } from "@/lib/utils";

interface ConversationAuthor {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  avatar_url: string | null;
}

interface ConversationPost {
  id: string;
  slug: string;
  title: string | null;
  type: string;
  status: string;
  created_at: string;
  published_at: string | null;
  cover_image_url: string | null;
  tags: string[] | null;
  in_response_to: string | null;
}

interface ConversationSecondary {
  likeCount: number;
  responseCount: number;
  responseCards: PostCardData[];
  relatedPosts: Array<{ id: string; title: string | null; slug: string }>;
}

interface ConversationViewer {
  userLiked: boolean;
  userBookmarked: boolean;
  userFollowsAuthor: boolean;
  userSubscribedToAuthor: boolean;
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

async function ParentContextLine({ parentPostId }: { parentPostId: string }) {
  const supabase = await createClient();
  const { data: parent } = await supabase
    .from("posts")
    .select("title, slug")
    .eq("id", parentPostId)
    .eq("status", "published")
    .maybeSingle();

  if (!parent) return null;

  return (
    <p className="mb-4 text-sm text-gray-500">
      <span aria-hidden="true">↩ </span>
      Responding to{" "}
      <Link
        href={`/post/${parent.slug}`}
        className="font-semibold text-gray-700 hover:text-emerald-brand hover:underline"
      >
        {getPostDisplayTitle(parent) ?? "this post"}
      </Link>
    </p>
  );
}

/**
 * The detail page for a short, titleless Post — a conversation view, not a
 * publication template: content, one actions row, then the responses. The
 * article/research kinds keep their own richer templates in page.tsx.
 */
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
  const [secondary, viewer] = await Promise.all([
    secondaryDataPromise,
    viewerDataPromise,
  ]);
  const isPublished = post.status === "published";
  const isOwnPost = Boolean(userId && author && userId === author.id);
  const relatedPost = secondary.relatedPosts[0] ?? null;
  const displayTitle = getPostDisplayTitle(post);
  const topics = post.tags ?? [];

  return (
    <div className="mx-auto max-w-[640px] pb-20">
      <PublishedToast
        postId={post.id}
        postType={post.type}
        title={metadataTitle}
        slug={post.slug}
        points={POST_POINTS[(post.type as PostType) ?? "blog"] ?? 10}
        username={author?.username ?? ""}
        relatedTarget={
          relatedPost
            ? {
                id: relatedPost.id,
                title: getPostDisplayTitle(relatedPost) ?? "another post",
                slug: relatedPost.slug,
              }
            : null
        }
      />

      <BackLink className="inline-flex min-h-11 items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2">
        <span aria-hidden="true">‹</span> Back
      </BackLink>

      {post.status === "draft" ? (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          This post is a <strong>draft</strong> and is only visible to you.{" "}
          <Link href={`/edit/${post.slug}`} className="font-semibold underline">
            Edit &amp; publish
          </Link>
        </div>
      ) : null}

      {author ? (
        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={`/${author.username}`} className="shrink-0">
              <UserAvatar
                name={authorName}
                src={author.avatar_url}
                size={48}
                className="overflow-hidden rounded-full"
              />
            </Link>
            <div className="min-w-0">
              <Link
                href={`/${author.username}`}
                className="block truncate text-[16px] font-bold text-ink transition-colors hover:text-emerald-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
              >
                {authorName}
              </Link>
              {author.university ? (
                <p className="truncate text-[14px] leading-5 text-gray-500">{author.university}</p>
              ) : null}
              <p className="text-[13px] leading-5 text-gray-400">
                {formatRelativeTime(post.published_at ?? post.created_at)}
              </p>
            </div>
          </div>
          {isOwnPost ? null : (
            <AuthorRelationshipControls
              authorId={author.id}
              authorName={authorName}
              currentUserId={userId}
              initialFollowing={viewer.userFollowsAuthor}
              initialSubscribed={viewer.userSubscribedToAuthor}
              variant="icon"
              source="post_header"
              postId={post.id}
            />
          )}
        </div>
      ) : null}

      <div className="mt-7">
        {post.in_response_to ? (
          <ParentContextLine parentPostId={post.in_response_to} />
        ) : null}
        {/* Titleless Posts render no heading at all rather than a fabricated
            one -- but a Post that does carry a title showed it in the feed and
            nowhere here, which also left the page with no h1. */}
        {displayTitle ? (
          <h1 className="mb-3 font-display text-[26px] font-semibold leading-[1.25] text-ink sm:text-[30px]">
            {displayTitle}
          </h1>
        ) : null}
        <div
          className="text-[19px] leading-[1.62] text-gray-900 [&_a]:text-emerald-brand [&_a]:underline [&_p]:my-4 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
        {post.cover_image_url ? (
          <PostImage
            src={post.cover_image_url}
            alt="Image attached to this post"
            type={post.type}
            sizes="(max-width: 680px) calc(100vw - 32px), 640px"
            priority
            wrapperClassName="mt-5"
            className="w-full overflow-hidden rounded-xl bg-gray-100"
          />
        ) : null}
      </div>

      <div className="mt-7">
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
          responseCount={secondary.responseCount}
        />
        {userId && author && !isOwnPost ? (
          <p className="mt-2 text-right">
            <ReportButton
              targetType="post"
              targetId={post.id}
              targetLabel={`"${metadataTitle}"`}
              variant="text"
              className="text-xs text-gray-400 hover:text-red-600"
            />
          </p>
        ) : null}
      </div>

      {topics.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {topics.map((topic) => (
            <Link
              key={topic}
              href={`/topics/${encodeURIComponent(topic)}`}
              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[13px] text-gray-600 transition-colors hover:border-emerald-brand/40 hover:text-emerald-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
            >
              #{topic}
            </Link>
          ))}
        </div>
      ) : null}

      <DiscussionSection
        postId={post.id}
        userId={userId}
        userProfileId={userId}
        responseCount={secondary.responseCount}
        responseCards={secondary.responseCards}
        isPublished={isPublished}
      />
    </div>
  );
}
