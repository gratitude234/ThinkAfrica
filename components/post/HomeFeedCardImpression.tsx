"use client";

import { useRef } from "react";
import HomeFeedCard, { type ArticlePresentation } from "./HomeFeedCard";
import type { PostCardData } from "./PostCard";
import { useViewImpression } from "@/lib/useViewImpression";

export default function HomeFeedCardImpression({
  post,
  currentUserId,
  surface,
  priority = false,
  articlePresentation,
}: {
  post: PostCardData;
  currentUserId: string | null;
  surface: "home" | "following" | "subscriptions" | "topics" | "latest";
  priority?: boolean;
  articlePresentation?: ArticlePresentation;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useViewImpression(ref, post.slug, surface);

  return (
    <div ref={ref}>
      <HomeFeedCard
        post={post}
        currentUserId={currentUserId}
        surface={surface}
        priority={priority}
        articlePresentation={articlePresentation}
      />
    </div>
  );
}
