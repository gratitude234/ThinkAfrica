"use server";

import { createClient } from "@/lib/supabase/server";
import {
  isReportReason,
  type ReportReason,
  type ReportTargetType,
} from "@/components/moderation/reportReasons";

const MAX_DETAILS_LENGTH = 1000;

type SubmitReportInput = {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
};

export async function submitReport(input: SubmitReportInput): Promise<{
  error: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to report content." };
  }

  if (!isReportReason(input.reason)) {
    return { error: "Choose a reason for this report." };
  }

  if (!["post", "comment", "user"].includes(input.targetType)) {
    return { error: "Unsupported report target." };
  }

  const details = input.details?.trim().slice(0, MAX_DETAILS_LENGTH) || null;

  let ownerId: string | null = null;

  if (input.targetType === "post") {
    const { data: post } = await supabase
      .from("posts")
      .select("id, author_id")
      .eq("id", input.targetId)
      .maybeSingle();

    if (!post) return { error: "This content is no longer available." };
    ownerId = post.author_id as string;
  } else if (input.targetType === "comment") {
    const { data: comment } = await supabase
      .from("comments")
      .select("id, author_id")
      .eq("id", input.targetId)
      .maybeSingle();

    if (!comment) return { error: "This content is no longer available." };
    ownerId = comment.author_id as string;
  } else {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", input.targetId)
      .maybeSingle();

    if (!profile) return { error: "This account is no longer available." };
    ownerId = profile.id as string;
  }

  if (ownerId === user.id) {
    return { error: "You cannot report your own content." };
  }

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    target_type: input.targetType,
    target_post_id: input.targetType === "post" ? input.targetId : null,
    target_comment_id: input.targetType === "comment" ? input.targetId : null,
    target_user_id: input.targetType === "user" ? input.targetId : null,
    reason: input.reason,
    details,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        error: "You already have an open report for this. Our team will review it.",
      };
    }
    return { error: error.message };
  }

  return { error: null };
}
