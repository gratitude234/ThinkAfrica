"use client";

import { useEffect, useState } from "react";
import PostCard from "@/components/post/PostCard";
import type { PostCardData } from "@/components/post/PostCard";
import { createClient } from "@/lib/supabase/client";

const POST_TYPE_FILTERS = [
  { label: "All", value: "all" },
  { label: "Blog", value: "blog" },
  { label: "Essay", value: "essay" },
  { label: "Research", value: "research" },
  { label: "Policy", value: "policy_brief" },
];

function BookmarkSkeletons() {
  return (
    <div className="space-y-4 animate-pulse">
      {[...Array(3)].map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-2xl border border-gray-100 bg-white"
        >
          <div className="aspect-[16/9] w-full bg-gray-200" />
          <div className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <div className="h-5 w-16 rounded-full bg-gray-200" />
              <div className="h-3 w-12 rounded bg-gray-100" />
            </div>
            <div className="h-5 w-4/5 rounded bg-gray-200" />
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-3/4 rounded bg-gray-100" />
            <div className="mt-2 flex items-center gap-3 border-t border-gray-100 pt-2">
              <div className="h-8 w-8 rounded-full bg-gray-200" />
              <div className="space-y-1.5">
                <div className="h-3 w-28 rounded bg-gray-200" />
                <div className="h-2.5 w-20 rounded bg-gray-100" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function typeLabel(filter: string) {
  const match = POST_TYPE_FILTERS.find((item) => item.value === filter);
  return match?.label.toLowerCase() ?? "filtered";
}

export default function BookmarksPage() {
  const [allPosts, setAllPosts] = useState<PostCardData[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        window.location.href = "/login?redirectTo=/bookmarks";
        return;
      }

      const { data } = await supabase
        .from("bookmarks")
        .select(
          `post_id, posts!bookmarks_post_id_fkey (
            id, title, slug, excerpt, type, tags, created_at, published_at, view_count, cover_image_url,
            profiles!posts_author_id_fkey (username, full_name, university, avatar_url, verified, verified_type)
          )`
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      const mapped = (data ?? [])
        .map((bookmark) => {
          const post = Array.isArray(bookmark.posts)
            ? bookmark.posts[0]
            : bookmark.posts;
          if (!post) return null;
          return {
            ...post,
            profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
          } as PostCardData;
        })
        .filter(Boolean) as PostCardData[];

      setAllPosts(mapped);
      setLoading(false);
    });
  }, []);

  const filtered =
    filter === "all"
      ? allPosts
      : allPosts.filter((post) => post.type === filter);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Bookmarks</h1>
        <p className="mt-1 text-sm text-gray-500">
          Posts you&apos;ve saved for later.
        </p>
      </div>

      {loading ? (
        <BookmarkSkeletons />
      ) : allPosts.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-20 text-center">
          <svg
            className="mx-auto mb-4 h-12 w-12 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
            />
          </svg>
          <p className="font-medium text-gray-500">No bookmarks yet</p>
          <p className="mt-1 text-sm text-gray-400">
            Your saved posts will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2">
            {POST_TYPE_FILTERS.map((item) => {
              const count =
                item.value === "all"
                  ? allPosts.length
                  : allPosts.filter((post) => post.type === item.value).length;

              if (item.value !== "all" && count === 0) return null;

              return (
                <button
                  key={item.value}
                  onClick={() => setFilter(item.value)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    filter === item.value
                      ? "bg-emerald-brand text-white"
                      : "border border-gray-200 bg-white text-gray-600 hover:border-emerald-300"
                  }`}
                >
                  {item.label}
                  {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-gray-400">
              <p className="text-lg font-medium">
                No {typeLabel(filter)} bookmarks
              </p>
              <p className="mt-1 text-sm">
                Save a {typeLabel(filter)} to find it here later.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
