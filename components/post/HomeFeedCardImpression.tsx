"use client";

import { useRef } from "react";
import HomeFeedCard from "./HomeFeedCard";
import type { PostCardData } from "./PostCard";
import type { HomeFeedTab } from "@/lib/homeFeedTabs";
import { useViewImpression } from "@/lib/useViewImpression";

export default function HomeFeedCardImpression({
  post,
  currentUserId,
  surface,
  priority = false,
}: {
  post: PostCardData;
  currentUserId: string | null;
  surface: HomeFeedTab;
  priority?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useViewImpression(ref, post.slug, surface, post.feed_exposure);

  return (
    <div ref={ref}>
      <HomeFeedCard
        post={post}
        currentUserId={currentUserId}
        priority={priority}
      />
    </div>
  );
}
