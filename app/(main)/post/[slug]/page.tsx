import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import Badge from "@/components/ui/Badge";
import Tag from "@/components/ui/Tag";
import { formatDate } from "@/lib/utils";
import LikeButton from "./LikeButton";
import BookmarkButton from "./BookmarkButton";
import CommentsLoader from "./CommentsLoader";
import ViewTracker from "./ViewTracker";
import ReadingProgressBar from "./ReadingProgressBar";
import ShareButtons from "./ShareButtons";
import AuthorBioCard from "./AuthorBioCard";

interface PageProps {
  params: Promise<{ slug: string }>;
}

function estimateReadTime(content: string): number {
  const text = content.replace(/<[^>]*>/g, " ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function extractHeadings(content: string): { id: string; text: string; level: number }[] {
  const regex = /<h([23])[^>]*>(.*?)<\/h[23]>/gi;
  const matches: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) matches.push(m);
  return matches.map((m, i) => ({
    id: `heading-${i}`,
    text: m[2].replace(/<[^>]*>/g, ""),
    level: parseInt(m[1]),
  }));
}

function injectHeadingIds(content: string): string {
  let i = 0;
  return content.replace(/<h([23])([^>]*)>(.*?)<\/h[23]>/gi, (_, level, attrs, text) => {
    const id = `heading-${i++}`;
    return `<h${level}${attrs} id="${id}">${text}</h${level}>`;
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("posts")
    .select("title, excerpt, cover_image_url, slug, profiles!posts_author_id_fkey(full_name)")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (!post) return { title: "Post not found — ThinkAfrica" };

  const author = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;
  const coverUrl = (post as { cover_image_url?: string | null }).cover_image_url;

  return {
    title: `${post.title} — ThinkAfrica`,
    description: post.excerpt ?? `Read this post by ${author?.full_name} on ThinkAfrica`,
    openGraph: {
      title: post.title,
      description: post.excerpt ?? "",
      url: `https://thinkafrika.com/post/${post.slug}`,
      siteName: "ThinkAfrica",
      images: coverUrl ? [{ url: coverUrl, width: 1200, height: 630 }] : [],
      type: "article",
    },
    twitter: {
      card: coverUrl ? "summary_large_image" : "summary",
      title: post.title,
      description: post.excerpt ?? "",
      images: coverUrl ? [coverUrl] : [],
    },
  };
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: post } = await supabase
    .from("posts")
    .select(
      `
      id, title, slug, content, excerpt, type, tags, status,
      created_at, published_at, view_count, cover_image_url,
      profiles!posts_author_id_fkey (id, username, full_name, university, field_of_study, bio, avatar_url)
    `
    )
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (!post) notFound();

  const author = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;
  const coverImageUrl = (post as { cover_image_url?: string | null }).cover_image_url;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { count: likeCount } = await supabase
    .from("likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", post.id);

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
    id: string; title: string; slug: string; type: string; published_at: string | null; created_at: string;
    profiles: { full_name: string; username: string } | null;
  }> = [];
  if (post.tags && post.tags.length > 0) {
    const { data: relatedRaw } = await supabase
      .from("posts")
      .select("id, title, slug, type, published_at, created_at, profiles!posts_author_id_fkey (full_name, username)")
      .eq("status", "published")
      .neq("id", post.id)
      .overlaps("tags", post.tags)
      .order("published_at", { ascending: false })
      .limit(3);

    relatedPosts = (relatedRaw ?? []).map((p) => ({
      ...p,
      profiles: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles,
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

  const readTime = estimateReadTime(post.content ?? "");
  const headings = extractHeadings(post.content ?? "");
  const contentWithIds = injectHeadingIds(post.content ?? "");

  return (
    <div className="relative">
      <ReadingProgressBar />
      <ViewTracker slug={slug} />

      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main content */}
          <div className="lg:col-span-3">
            <div className="max-w-3xl">
              {/* Cover image */}
              {coverImageUrl && (
                <div className="mb-8 rounded-xl overflow-hidden">
                  <img
                    src={coverImageUrl}
                    alt={post.title}
                    className="w-full object-cover"
                    style={{ maxHeight: "400px" }}
                  />
                </div>
              )}

              {/* Header */}
              <header className="mb-8">
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <Badge type={post.type} />
                  {post.tags && post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {post.tags.map((tag: string) => (
                        <Link key={tag} href={`/topics/${encodeURIComponent(tag)}`}>
                          <Tag label={tag} />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                <h1 className="text-3xl font-bold text-gray-900 mb-4 leading-tight">
                  {post.title}
                </h1>

                {author && (
                  <div className="flex items-center justify-between flex-wrap gap-3">
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
                          {formatDate(post.published_at ?? post.created_at)} ·{" "}
                          {readTime} min read
                        </p>
                      </div>
                    </Link>
                    <div className="flex items-center gap-2">
                      <BookmarkButton
                        postId={post.id}
                        initialBookmarked={userBookmarked}
                        userId={user?.id ?? null}
                      />
                      <LikeButton
                        postId={post.id}
                        initialLiked={userLiked}
                        initialCount={likeCount ?? 0}
                        userId={user?.id ?? null}
                      />
                    </div>
                  </div>
                )}
              </header>

              <hr className="border-gray-200 mb-8" />

              {/* Content */}
              <div
                className="prose prose-gray max-w-none mb-8 prose-headings:text-gray-900 prose-a:text-emerald-brand"
                dangerouslySetInnerHTML={{ __html: contentWithIds }}
              />

              {/* Share + views */}
              <div className="flex items-center justify-between flex-wrap gap-3 mb-8">
                <ShareButtons title={post.title} slug={post.slug} />
                <span className="text-xs text-gray-400">
                  {post.view_count} {post.view_count === 1 ? "view" : "views"}
                </span>
              </div>

              <hr className="border-gray-200 mb-8" />

              {/* Author bio card */}
              {author && (
                <AuthorBioCard
                  author={author}
                  userId={user?.id ?? null}
                  initialFollowing={userFollowsAuthor}
                />
              )}

              <hr className="border-gray-200 my-8" />

              {/* Related posts */}
              {relatedPosts.length > 0 && (
                <section className="mb-8">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Related Posts</h2>
                  <div className="space-y-3">
                    {relatedPosts.map((p) => (
                      <Link
                        key={p.id}
                        href={`/post/${p.slug}`}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900 group-hover:text-emerald-brand transition-colors">
                            {p.title}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {p.profiles?.full_name} · {formatDate(p.published_at ?? p.created_at)}
                          </p>
                        </div>
                        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              <hr className="border-gray-200 mb-8" />

              {/* Comments — streams in after article renders */}
              <Suspense
                fallback={
                  <div className="space-y-4 animate-pulse">
                    <div className="h-5 w-24 bg-gray-200 rounded" />
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-28 bg-gray-200 rounded" />
                          <div className="h-3 w-full bg-gray-100 rounded" />
                          <div className="h-3 w-4/5 bg-gray-100 rounded" />
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
            </div>
          </div>

          {/* Table of contents sidebar */}
          {headings.length > 0 && (
            <aside className="hidden lg:block lg:col-span-1">
              <div className="sticky top-24">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Contents
                </h3>
                <nav className="space-y-1">
                  {headings.map((h) => (
                    <a
                      key={h.id}
                      href={`#${h.id}`}
                      className={`block text-sm text-gray-500 hover:text-emerald-brand transition-colors leading-snug ${
                        h.level === 3 ? "pl-3" : ""
                      }`}
                    >
                      {h.text}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
