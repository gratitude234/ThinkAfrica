import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Badge from "@/components/ui/Badge";
import Tag from "@/components/ui/Tag";
import { formatDate } from "@/lib/utils";
import LikeButton from "./LikeButton";
import CommentsSection from "./CommentsSection";
import ViewTracker from "./ViewTracker";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  // Fetch post with author
  const { data: post } = await supabase
    .from("posts")
    .select(
      `
      id, title, slug, content, excerpt, type, tags, status,
      created_at, published_at, view_count,
      profiles!posts_author_id_fkey (id, username, full_name, university, field_of_study, bio, avatar_url)
    `
    )
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (!post) notFound();

  const author = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch likes count and user's like status
  const { count: likeCount } = await supabase
    .from("likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", post.id);

  let userLiked = false;
  if (user) {
    const { data: existingLike } = await supabase
      .from("likes")
      .select("user_id")
      .eq("post_id", post.id)
      .eq("user_id", user.id)
      .single();
    userLiked = !!existingLike;
  }

  // Fetch comments with author profiles
  const { data: commentsRaw } = await supabase
    .from("comments")
    .select(
      "id, content, created_at, profiles!comments_author_id_fkey (username, full_name, avatar_url)"
    )
    .eq("post_id", post.id)
    .is("parent_id", null)
    .order("created_at", { ascending: true });

  const comments = (commentsRaw ?? []).map((c) => ({
    ...c,
    profiles: Array.isArray(c.profiles) ? c.profiles[0] : c.profiles,
  }));

  // Get user's profile id for comments
  let userProfileId: string | null = null;
  if (user) {
    userProfileId = user.id;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <ViewTracker slug={slug} />

      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Badge type={post.type} />
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {post.tags.map((tag: string) => (
                <Tag key={tag} label={tag} />
              ))}
            </div>
          )}
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-4 leading-tight">
          {post.title}
        </h1>

        {/* Author */}
        {author && (
          <div className="flex items-center justify-between">
            <Link href={`/${author.username}`} className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold">
                {author.full_name?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
              <div>
                <p className="font-medium text-gray-900 group-hover:text-emerald-brand transition-colors">
                  {author.full_name}
                </p>
                <p className="text-xs text-gray-400">
                  {author.university} ·{" "}
                  {formatDate(post.published_at ?? post.created_at)}
                </p>
              </div>
            </Link>
            <LikeButton
              postId={post.id}
              initialLiked={userLiked}
              initialCount={likeCount ?? 0}
              userId={user?.id ?? null}
            />
          </div>
        )}
      </header>

      {/* Divider */}
      <hr className="border-gray-200 mb-8" />

      {/* Content */}
      <div
        className="prose prose-gray max-w-none mb-12 prose-headings:text-gray-900 prose-a:text-emerald-brand"
        dangerouslySetInnerHTML={{ __html: post.content ?? "" }}
      />

      {/* View count */}
      <div className="text-xs text-gray-400 mb-8">
        {post.view_count} {post.view_count === 1 ? "view" : "views"}
      </div>

      <hr className="border-gray-200 mb-8" />

      {/* Comments */}
      <CommentsSection
        postId={post.id}
        initialComments={comments as Parameters<typeof CommentsSection>[0]["initialComments"]}
        userId={user?.id ?? null}
        userProfileId={userProfileId}
      />
    </div>
  );
}
