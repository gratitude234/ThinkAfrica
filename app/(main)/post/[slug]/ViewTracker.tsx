"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { trackActivationEvent } from "@/lib/activationEvents";

const SESSION_KEY = (slug: string) => `ta_viewed_${slug}`;

export default function ViewTracker({
  slug,
  authorId,
  userId,
}: {
  slug: string;
  authorId: string;
  userId: string | null;
}) {
  useEffect(() => {
    // Skip author self-views
    if (userId && userId === authorId) return;

    // Skip if already counted this session (e.g. came from feed impression)
    if (sessionStorage.getItem(SESSION_KEY(slug))) return;

    sessionStorage.setItem(SESSION_KEY(slug), "1");
    const supabase = createClient();
    supabase.rpc("increment_view_count", { post_slug: slug });
    trackActivationEvent({ event: "post_opened", metadata: { slug } });
  }, [slug, authorId, userId]);

  return null;
}
