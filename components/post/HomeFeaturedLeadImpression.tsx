"use client";

import { useRef } from "react";
import HomeFeaturedLead, { type HomeFeaturedPost } from "./HomeFeaturedLead";
import { useViewImpression } from "@/lib/useViewImpression";

export default function HomeFeaturedLeadImpression({
  post,
}: {
  post: HomeFeaturedPost;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useViewImpression(
    ref,
    post.slug,
    "home_featured",
    post.feed_exposure
  );

  return (
    <div ref={ref}>
      <HomeFeaturedLead post={post} />
    </div>
  );
}
