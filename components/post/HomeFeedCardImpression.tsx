"use client";

import { useRef } from "react";
import HomeFeedCard from "./HomeFeedCard";
import type { PostCardData } from "./PostCard";
import { useViewImpression } from "@/lib/useViewImpression";

export default function HomeFeedCardImpression({
  post,
  currentUserId,
  surface,
  priority = false,
}: {
  post: PostCardData;
  currentUserId: string | null;
  surface: "home" | "following" | "subscriptions" | "topics" | "latest";
  priority?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useViewImpression(ref, post.slug, surface, post.feed_exposure);

  return (
    <div ref={ref}>
      <HomeFeedCard
        post={post}
        currentUserId={currentUserId}
        surface={surface}
        priority={priority}
      />
    </div>
  );
}
