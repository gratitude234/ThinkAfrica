"use server";

import { revalidatePath } from "next/cache";
import {
  createAdminActionClient,
  recordAdminAuditEvent,
  type AdminContext,
} from "@/lib/adminAccess";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEmailResult, sendUserEmail } from "@/lib/email";
import { getPostDisplayTitle } from "@/lib/postDisplay";

type AdminClient = ReturnType<typeof createAdminClient>;

function actionError(error: unknown, fallback: string) {
  return { error: error instanceof Error ? error.message : fallback };
}

type ReportRow = {
  id: string;
  target_type: "post" | "comment" | "user";
  target_post_id: string | null;
  target_comment_id: string | null;
  target_user_id: string | null;
  reason: string;
  status: string;
};

async function getReport(admin: AdminClient, reportId: string) {
  const { data } = await admin
    .from("reports")
    .select("id, target_type, target_post_id, target_comment_id, target_user_id, reason, status")
    .eq("id", reportId)
    .maybeSingle<ReportRow>();

  return data ?? null;
}

async function markReport(
  admin: AdminClient,
  context: AdminContext,
  reportId: string,
  status: "resolved" | "dismissed",
  resolutionAction: string
) {
  const { error } = await admin
    .from("reports")
    .update({
      status,
      resolved_by: context.userId,
      resolved_at: new Date().toISOString(),
      resolution_action: resolutionAction,
    })
    .eq("id", reportId);

  if (error) throw new Error(error.message);
}

export async function resolveReport(reportId: string) {
  try {
    const { admin, context } = await createAdminActionClient("moderation.manage");
    await markReport(admin, context, reportId, "resolved", "none");

    await recordAdminAuditEvent({
      admin,
      context,
      action: "moderation.report_resolved",
      targetTable: "reports",
      targetId: reportId,
    });

    revalidatePath("/admin/moderation");
    return { error: null };
  } catch (error) {
    return actionError(error, "Unable to resolve report.");
  }
}

export async function dismissReport(reportId: string) {
  try {
    const { admin, context } = await createAdminActionClient("moderation.manage");
    await markReport(admin, context, reportId, "dismissed", "none");

    await recordAdminAuditEvent({
      admin,
      context,
      action: "moderation.report_dismissed",
      targetTable: "reports",
      targetId: reportId,
    });

    revalidatePath("/admin/moderation");
    return { error: null };
  } catch (error) {
    return actionError(error, "Unable to dismiss report.");
  }
}

export async function removeReportedPost(reportId: string) {
  try {
    const { admin, context } = await createAdminActionClient("moderation.manage");
    const report = await getReport(admin, reportId);

    if (!report?.target_post_id) {
      return { error: "This report is not attached to a post." };
    }

    const { data: post } = await admin
      .from("posts")
      .select("id, title, slug, status, author_id")
      .eq("id", report.target_post_id)
      .maybeSingle();

    if (!post) return { error: "This post no longer exists." };
    if (post.status === "removed") return { error: "This post is already removed." };

    const { error: updateError } = await admin
      .from("posts")
      .update({ status: "removed" })
      .eq("id", post.id);

    if (updateError) return { error: updateError.message };

    await markReport(admin, context, reportId, "resolved", "post_removed");

    // "Your post" already precedes the reference below, so a titleless
    // Post gets the plain "Your post" phrase rather than a redundant
    // "Your post your post".
    const displayTitle = getPostDisplayTitle(post);
    const postLabel = displayTitle ? `Your post "${displayTitle}"` : "Your post";

    const { error: notificationError } = await admin.from("notifications").insert({
      user_id: post.author_id,
      type: "moderation_post_removed",
      message: `${postLabel} was removed for breaking our community guidelines.`,
      link: "/editorial-standards",
      post_id: post.id,
      read: false,
    });

    if (notificationError) {
      console.error(`Failed to create removal notification: ${notificationError.message}`);
    }

    const emailResult = await sendUserEmail({
      recipientId: post.author_id,
      subject: "Your post was removed from Indegenius",
      preview: "A post of yours was removed by our moderation team.",
      title: "Post removed",
      intro: `${postLabel} was removed because it breaks our community guidelines. If you believe this was a mistake, reply to this email.`,
      ctaLabel: "Read our guidelines",
      ctaPath: "/editorial-standards",
      idempotencyKey: `moderation:post_removed:${post.id}`,
      preferenceKey: "email_account_security",
    });
    logEmailResult(`moderation_post_removed:${post.id}`, emailResult);

    await recordAdminAuditEvent({
      admin,
      context,
      action: "moderation.post_removed",
      targetTable: "posts",
      targetId: post.id,
      metadata: { reportId, reason: report.reason },
    });

    revalidatePath("/admin/moderation");
    revalidatePath("/");
    revalidatePath(`/post/${post.slug}`);
    return { error: null };
  } catch (error) {
    return actionError(error, "Unable to remove post.");
  }
}

export async function restoreRemovedPost(postId: string) {
  try {
    const { admin, context } = await createAdminActionClient("moderation.manage");

    const { data: post } = await admin
      .from("posts")
      .select("id, slug, status")
      .eq("id", postId)
      .maybeSingle();

    if (!post) return { error: "This post no longer exists." };
    if (post.status !== "removed") {
      return { error: "Only removed posts can be restored." };
    }

    const { error: updateError } = await admin
      .from("posts")
      .update({ status: "published" })
      .eq("id", postId);

    if (updateError) return { error: updateError.message };

    await recordAdminAuditEvent({
      admin,
      context,
      action: "moderation.post_restored",
      targetTable: "posts",
      targetId: postId,
    });

    revalidatePath("/admin/moderation");
    revalidatePath("/");
    revalidatePath(`/post/${post.slug}`);
    return { error: null };
  } catch (error) {
    return actionError(error, "Unable to restore post.");
  }
}

export async function hideReportedComment(reportId: string) {
  try {
    const { admin, context } = await createAdminActionClient("moderation.manage");
    const report = await getReport(admin, reportId);

    if (!report?.target_comment_id) {
      return { error: "This report is not attached to a comment." };
    }

    const { data: comment } = await admin
      .from("comments")
      .select("id, author_id, hidden_at, posts!comments_post_id_fkey (slug)")
      .eq("id", report.target_comment_id)
      .maybeSingle();

    if (!comment) return { error: "This comment no longer exists." };
    if (comment.hidden_at) return { error: "This comment is already hidden." };

    const { error: updateError } = await admin
      .from("comments")
      .update({
        hidden_at: new Date().toISOString(),
        hidden_by: context.userId,
      })
      .eq("id", comment.id);

    if (updateError) return { error: updateError.message };

    await markReport(admin, context, reportId, "resolved", "comment_hidden");

    const { error: notificationError } = await admin.from("notifications").insert({
      user_id: comment.author_id,
      type: "moderation_comment_hidden",
      message: "One of your comments was hidden for breaking our community guidelines.",
      link: "/editorial-standards",
      comment_id: comment.id,
      read: false,
    });

    if (notificationError) {
      console.error(`Failed to create comment-hidden notification: ${notificationError.message}`);
    }

    await recordAdminAuditEvent({
      admin,
      context,
      action: "moderation.comment_hidden",
      targetTable: "comments",
      targetId: comment.id,
      metadata: { reportId, reason: report.reason },
    });

    const postSlug = Array.isArray(comment.posts)
      ? (comment.posts[0] as { slug?: string } | undefined)?.slug
      : (comment.posts as { slug?: string } | null)?.slug;

    revalidatePath("/admin/moderation");
    if (postSlug) revalidatePath(`/post/${postSlug}`);
    return { error: null };
  } catch (error) {
    return actionError(error, "Unable to hide comment.");
  }
}

export async function unhideComment(commentId: string) {
  try {
    const { admin, context } = await createAdminActionClient("moderation.manage");

    const { error: updateError } = await admin
      .from("comments")
      .update({ hidden_at: null, hidden_by: null })
      .eq("id", commentId);

    if (updateError) return { error: updateError.message };

    await recordAdminAuditEvent({
      admin,
      context,
      action: "moderation.comment_unhidden",
      targetTable: "comments",
      targetId: commentId,
    });

    revalidatePath("/admin/moderation");
    return { error: null };
  } catch (error) {
    return actionError(error, "Unable to unhide comment.");
  }
}

export async function suspendUser(input: {
  userId: string;
  reason: string;
  reportId?: string | null;
}) {
  try {
    const { admin, context } = await createAdminActionClient("moderation.manage");

    if (input.userId === context.userId) {
      return { error: "You cannot suspend your own account." };
    }

    const reason = input.reason.trim();
    if (!reason) {
      return { error: "Add a short reason for the suspension." };
    }

    const { data: target } = await admin
      .from("profiles")
      .select("id, role, full_name, suspended_at")
      .eq("id", input.userId)
      .maybeSingle();

    if (!target) return { error: "This account no longer exists." };
    if (target.role === "admin") {
      return { error: "Administrators cannot be suspended." };
    }

    const { data: authUser } = await admin.auth.admin.getUserById(input.userId);
    if (
      process.env.ADMIN_EMAIL &&
      authUser?.user?.email === process.env.ADMIN_EMAIL
    ) {
      return { error: "Administrators cannot be suspended." };
    }

    if (target.suspended_at) {
      return { error: "This account is already suspended." };
    }

    const { error: updateError } = await admin
      .from("profiles")
      .update({
        suspended_at: new Date().toISOString(),
        suspended_reason: reason,
      })
      .eq("id", input.userId);

    if (updateError) return { error: updateError.message };

    if (input.reportId) {
      await markReport(admin, context, input.reportId, "resolved", "user_suspended");
    }

    const { error: notificationError } = await admin.from("notifications").insert({
      user_id: input.userId,
      type: "account_suspended",
      message:
        "Your account has been suspended. You can still browse, but posting, commenting, and messaging are disabled.",
      link: "/editorial-standards",
      read: false,
    });

    if (notificationError) {
      console.error(`Failed to create suspension notification: ${notificationError.message}`);
    }

    const emailResult = await sendUserEmail({
      recipientId: input.userId,
      subject: "Your Indegenius account has been suspended",
      preview: "Your account has been suspended by our moderation team.",
      title: "Account suspended",
      intro: `Your account has been suspended for breaking our community guidelines (${reason}). You can still browse Indegenius, but posting, commenting, and messaging are disabled. If you believe this was a mistake, reply to this email.`,
      ctaLabel: "Read our guidelines",
      ctaPath: "/editorial-standards",
      idempotencyKey: `moderation:suspend:${input.userId}:${new Date().toISOString().slice(0, 10)}`,
      preferenceKey: "email_account_security",
    });
    logEmailResult(`moderation_suspend:${input.userId}`, emailResult);

    await recordAdminAuditEvent({
      admin,
      context,
      action: "moderation.user_suspended",
      targetTable: "profiles",
      targetId: input.userId,
      metadata: { reason, reportId: input.reportId ?? null },
    });

    revalidatePath("/admin/moderation");
    return { error: null };
  } catch (error) {
    return actionError(error, "Unable to suspend user.");
  }
}

export async function unsuspendUser(userId: string) {
  try {
    const { admin, context } = await createAdminActionClient("moderation.manage");

    const { error: updateError } = await admin
      .from("profiles")
      .update({ suspended_at: null, suspended_reason: null })
      .eq("id", userId);

    if (updateError) return { error: updateError.message };

    await recordAdminAuditEvent({
      admin,
      context,
      action: "moderation.user_unsuspended",
      targetTable: "profiles",
      targetId: userId,
    });

    revalidatePath("/admin/moderation");
    return { error: null };
  } catch (error) {
    return actionError(error, "Unable to unsuspend user.");
  }
}
