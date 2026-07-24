import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import UserAvatar from "@/components/ui/UserAvatar";
import FollowButton from "@/components/ui/FollowButton";
import ReportButton from "@/components/moderation/ReportButton";
import HomeFeedCard from "@/components/post/HomeFeedCard";
import PostCover from "@/components/post/PostCover";
import ResponseStartLink from "@/components/post/ResponseStartLink";
import type { PostCardData } from "@/components/post/PostCard";
import PublishedToast from "./PublishedToast";
import PostActionsRow from "./PostActionsRow";
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
  type: string;
  status: string;
  created_at: string;
  published_at: string | null;
  cover_image_url: string | null;
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

      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
      >
        <span aria-hidden="true">‹</span> Back to feed
      </Link>

      <div className="mt-2">
        <span className="rounded-full bg-green-tint px-3 py-1 text-xs font-semibold text-emerald-brand">
          Post
        </span>
      </div>

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
      ) : null}

      <div className="mt-7">
        {post.in_response_to ? (
          <ParentContextLine parentPostId={post.in_response_to} />
        ) : null}
        <div
          className="text-[19px] leading-[1.62] text-gray-900 [&_a]:text-emerald-brand [&_a]:underline [&_p]:my-4 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
        {post.cover_image_url ? (
          <PostCover
            src={post.cover_image_url}
            alt="Image attached to this post"
            type={post.type}
            sizes="(max-width: 680px) calc(100vw - 32px), 640px"
            priority
            className="mt-5 w-full overflow-hidden rounded-xl bg-gray-100"
            imageClassName="w-full object-cover"
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

      <section id="responses" className="mt-10 scroll-mt-24">
        <h2 className="font-display text-[26px] font-semibold text-ink">
          Responses · {secondary.responseCount}
        </h2>

        {secondary.responseCards.length === 0 ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-white px-6 py-8 text-center">
            <p className="text-[15px] text-gray-500">
              No responses yet. Be the first to weigh in.
            </p>
            {isPublished ? (
              <div className="mt-5 flex justify-center">
                <ResponseStartLink
                  postId={post.id}
                  source="responses_empty_state"
                  userId={userId}
                  className="inline-flex min-h-11 items-center rounded-lg bg-emerald-brand px-6 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
                >
                  Respond
                </ResponseStartLink>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4">
            {secondary.responseCards.map((response) => (
              <HomeFeedCard
                key={response.id}
                post={response}
                currentUserId={userId}
                surface="latest"
                respondingTo={{
                  title: metadataTitle,
                  author: authorName,
                  slug: post.slug,
                  authorUsername: author?.username ?? null,
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
