"use client";

import { useRef } from "react";
import PostCard, { type PostCardData } from "./PostCard";
import { useViewImpression } from "@/lib/useViewImpression";

interface PostCardImpressionProps {
  post: PostCardData;
  variant?: "standard" | "featured";
  currentUserId?: string | null;
  surface?: string;
}

export default function PostCardImpression({
  post,
  variant,
  surface = "feed",
}: PostCardImpressionProps) {
  const ref = useRef<HTMLDivElement>(null);
  useViewImpression(ref, post.slug, surface);

  return (
    <div ref={ref}>
      <PostCard post={post} variant={variant} />
    </div>
  );
}
