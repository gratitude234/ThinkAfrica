"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canReview } from "@/lib/roles";
import type { ReviewRecommendation } from "@/lib/types";

async function requireReviewer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, error: "You must be signed in." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile?.role || !canReview(profile.role)) {
    return { supabase, user, error: "You do not have permission to review posts." };
  }

  return { supabase, user, error: null };
}

export async function submitReview(input: {
  postId: string;
  recommendation: ReviewRecommendation;
  notes: string;
}) {
  const { supabase, user, error: accessError } = await requireReviewer();
  if (accessError || !user) return { error: accessError };

  const { data: reviewRow, error } = await supabase
    .from("post_reviews")
    .update({
      recommendation: input.recommendation,
      notes: input.notes.trim() || null,
      submitted_at: new Date().toISOString(),
    })
    .eq("post_id", input.postId)
    .eq("reviewer_id", user.id)
    .is("recommendation", null)
    .is("removed_at", null)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!reviewRow) return { error: "Review assignment not found." };

  revalidatePath("/review");
  revalidatePath(`/review/${input.postId}`);
  revalidatePath("/admin/review");
  revalidatePath("/dashboard");
  return { error: null };
}

export async function checkReviewCompletion(postId: string) {
  const { error: accessError } = await requireReviewer();
  if (accessError) return { error: accessError };

  revalidatePath("/review");
  revalidatePath(`/review/${postId}`);
  revalidatePath("/admin/review");
  return { error: null };
}
