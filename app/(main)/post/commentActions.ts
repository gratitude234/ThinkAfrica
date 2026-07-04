"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { escapeHtml, logEmailResult, sendUserEmail } from "@/lib/email";
import { requireNotSuspended } from "@/lib/suspension";

type CommentAuthor = {
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

export type SubmittedComment = {
  id: string;
  content: string;
  created_at: string;
  upvotes: number;
  parent_id: string | null;
  profiles: CommentAuthor | null;
};

type RawSubmittedComment = Omit<SubmittedComment, "profiles"> & {
  profiles: CommentAuthor | CommentAuthor[] | null;
};

type SubmitCommentInput = {
  postId: string;
  content: string;
  parentId?: string | null;
};

function displayName(profile: CommentAuthor | null) {
  return profile?.full_name?.trim() || profile?.username?.trim() || "A ThinkAfrica reader";
}

function excerpt(value: string, maxLength = 180) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function normalizeComment(comment: RawSubmittedComment): SubmittedComment {
  return {
    ...comment,
    upvotes: comment.upvotes ?? 0,
    profiles: Array.isArray(comment.profiles)
      ? comment.profiles[0] ?? null
      : comment.profiles,
  };
}

export async function submitComment(input: SubmitCommentInput): Promise<{
  error: string | null;
  comment?: SubmittedComment;
}> {
  const content = input.content.trim();
  if (!content) return { error: "Comment cannot be empty." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to comment." };
  }

  const suspensionError = await requireNotSuspended(user.id);
  if (suspensionError) {
    return { error: suspensionError };
  }

  const parentId = input.parentId ?? null;
  const [{ data: post, error: postError }, { data: actorProfile }] =
    await Promise.all([
      supabase
        .from("posts")
        .select("author_id, title, slug")
        .eq("id", input.postId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("username, full_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

  if (postError) return { error: postError.message };
  if (!post) return { error: "Post not found." };

  let parentAuthorId: string | null = null;
  if (parentId) {
    const { data: parentComment, error: parentError } = await supabase
      .from("comments")
      .select("id, author_id, post_id")
      .eq("id", parentId)
      .eq("post_id", input.postId)
      .maybeSingle();

    if (parentError) return { error: parentError.message };
    if (!parentComment) return { error: "Parent comment not found." };

    parentAuthorId = parentComment.author_id;
  }

  const { data, error } = await supabase
    .from("comments")
    .insert({
      post_id: input.postId,
      author_id: user.id,
      content,
      parent_id: parentId,
    })
    .select(
      "id, content, created_at, upvotes, parent_id, profiles!comments_author_id_fkey (username, full_name, avatar_url)"
    )
    .single<RawSubmittedComment>();

  if (error) return { error: error.message };

  const comment = normalizeComment(data);
  const recipientId = parentId ? parentAuthorId : post.author_id;

  if (recipientId && recipientId !== user.id) {
    const actorName = displayName(actorProfile);
    const commentKind = parentId ? "replied to your comment" : "commented on your post";
    const ctaPath = `/post/${post.slug}#comments`;
    const { error: notificationError } = await supabase.from("notifications").insert({
      user_id: recipientId,
      type: "comment",
      message: `${actorName} ${commentKind}: ${post.title}`,
      link: ctaPath,
      actor_id: user.id,
      post_id: input.postId,
      comment_id: comment.id,
      read: false,
    });

    if (notificationError) {
      console.error(`Failed to create comment notification: ${notificationError.message}`);
    } else {
      const commentPreview = excerpt(content);
      const emailResult = await sendUserEmail({
        recipientId,
        subject: parentId
          ? `${actorName} replied to your ThinkAfrica comment`
          : `${actorName} commented on your ThinkAfrica post`,
        preview: `${actorName} ${commentKind}.`,
        title: parentId ? "New reply to your comment" : "New comment on your post",
        intro: `${actorName} ${commentKind} on "${post.title}".`,
        bodyHtml: `<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#4b5563;border-left:3px solid #10b981;padding-left:14px;">${escapeHtml(commentPreview)}</p>`,
        bodyTextLines: [`Comment: ${commentPreview}`],
        ctaLabel: "Open discussion",
        ctaPath,
        idempotencyKey: `comment:${comment.id}:${recipientId}`,
        preferenceKey: "email_comments",
      });
      logEmailResult(`comment:${comment.id}:${recipientId}`, emailResult);
    }
  }

  revalidatePath(`/post/${post.slug}`);

  return { error: null, comment };
}
