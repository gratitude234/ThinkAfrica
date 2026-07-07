import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEmailResult, sendUserEmail } from "@/lib/email";

const REMINDER_THRESHOLD_DAYS = 5;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(
    Date.now() - REMINDER_THRESHOLD_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: dueReviews, error } = await admin
    .from("post_reviews")
    .select(
      "id, post_id, reviewer_id, posts!post_reviews_post_id_fkey(title, slug)"
    )
    .is("submitted_at", null)
    .is("removed_at", null)
    .is("reminded_at", null)
    .lte("assigned_at", cutoff);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let remindersSent = 0;

  for (const review of dueReviews ?? []) {
    const post = Array.isArray(review.posts) ? review.posts[0] : review.posts;
    if (!post) continue;

    const { error: notificationError } = await admin.from("notifications").insert({
      user_id: review.reviewer_id,
      type: "review_reminder",
      message: `Reminder: your review for "${post.title}" is still pending.`,
      link: `/review/${review.post_id}`,
      post_id: review.post_id,
      read: false,
    });

    if (!notificationError) {
      const emailResult = await sendUserEmail({
        recipientId: review.reviewer_id,
        subject: "Reminder: an Indegenius review is waiting on you",
        preview: `Just a friendly reminder about "${post.title}".`,
        title: "Your review is still pending",
        intro: `Just a friendly reminder that you have a review pending for "${post.title}". No rush, but the author is waiting to hear back.`,
        ctaLabel: "Open review",
        ctaPath: `/review/${review.post_id}`,
        idempotencyKey: `review-reminder:${review.id}`,
      });
      logEmailResult(`review_reminder:${review.id}`, emailResult);
    }

    await admin
      .from("post_reviews")
      .update({ reminded_at: new Date().toISOString() })
      .eq("id", review.id);

    remindersSent += 1;
  }

  return NextResponse.json({ remindersSent });
}
