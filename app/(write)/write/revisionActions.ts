"use server";

import { createClient } from "@/lib/supabase/server";
import { sanitizePostHtml } from "@/lib/sanitizePostHtml";
import { contributionText, type ContributionSnapshot } from "@/lib/contribution";

/**
 * Forces a restore point, ignoring the throttle that governs autosave
 * snapshots.
 *
 * Restoring an older revision overwrites the canvas, so the work being
 * replaced has to be recoverable too. Without this, restoring within three
 * minutes of the last snapshot would discard everything written since it, and
 * "recover my paragraphs" would become a way to lose them.
 */
export async function captureRevisionNow(input: {
  postId: string;
  snapshot: ContributionSnapshot;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const content = sanitizePostHtml(input.snapshot.content);
  const bodyText = contributionText(content);

  const { error } = await supabase.rpc("record_post_revision", {
    target_post_id: input.postId,
    p_title: input.snapshot.title,
    p_excerpt: input.snapshot.excerpt,
    p_content: content,
    p_word_count: bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0,
    p_min_interval: "0 seconds",
  });

  return { error: error?.message ?? null };
}
