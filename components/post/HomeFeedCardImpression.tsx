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
  showSurfaceReason = true,
}: {
  post: PostCardData;
  currentUserId: string | null;
  surface: "home" | "following" | "subscriptions" | "topics" | "latest";
  priority?: boolean;
  showSurfaceReason?: boolean;
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
        showSurfaceReason={showSurfaceReason}
      />
    </div>
  );
}
