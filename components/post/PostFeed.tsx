"use client";

import { useState } from "react";
import PostCard, { PostCardData } from "./PostCard";

const FILTER_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Blog", value: "blog" },
  { label: "Essay", value: "essay" },
  { label: "Research", value: "research" },
  { label: "Policy Brief", value: "policy_brief" },
];

interface PostFeedProps {
  posts: PostCardData[];
}

export default function PostFeed({ posts }: PostFeedProps) {
  const [activeFilter, setActiveFilter] = useState("all");

  const filtered =
    activeFilter === "all"
      ? posts
      : posts.filter((p) => p.type === activeFilter);

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => setActiveFilter(option.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeFilter === option.value
                ? "bg-emerald-brand text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:border-emerald-brand hover:text-emerald-brand"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Posts grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium mb-1">No posts yet</p>
          <p className="text-sm">
            {activeFilter === "all"
              ? "Be the first to publish on ThinkAfrica."
              : `No ${activeFilter.replace("_", " ")} posts yet.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
