"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml, logEmailResult, sendUserEmail } from "@/lib/email";
import { requireNotSuspended } from "@/lib/suspension";
import { recordActivationEvent } from "@/lib/activationServer";
import { ENGAGEMENT_PUSH_COOLDOWN_MS, logPushResult, sendPushNotification } from "@/lib/push";
import { getPostDisplayTitle, getPostReferenceSuffix } from "@/lib/postDisplay";
import {
  DELETED_COMMENT_TOMBSTONE,
  deriveCommentPreview,
  getCommentBodyError,
  normalizeCommentText,
} from "@/lib/commentContent";
import { fetchCommentPage, type CommentPage } from "@/lib/commentThread";

type CommentAuthor = {
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

export type SubmittedComment = {
  id: string;
  content: string;
  created_at: string;
  updated_at: string | null;
  upvotes: number;
  parent_id: string | null;
  author_id: string;
  profiles: CommentAuthor | null;
};

type RawSubmittedComment = Omit<SubmittedComment, "profiles"> & {
  profiles: CommentAuthor | CommentAuthor[] | null;
};

const COMMENT_SELECT =
  "id, content, created_at, updated_at, upvotes, parent_id, author_id, profiles!comments_author_id_fkey (username, full_name, avatar_url)";

type SubmitCommentInput = {
  postId: string;
  content: string;
  parentId?: string | null;
};

function displayName(profile: CommentAuthor | null) {
  return profile?.full_name?.trim() || profile?.username?.trim() || "An Indegenius reader";
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
  // Never trust the client's own counter -- re-validate the normalized,
  // user-visible text with the same rule the composer displayed.
  const bodyError = getCommentBodyError(input.content);
  if (bodyError) return { error: bodyError };
  const content = normalizeCommentText(input.content);

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

  let parentId = input.parentId ?? null;
  let parentAuthorId: string | null = null;
  if (parentId) {
    const { data: parentComment, error: parentError } = await supabase
      .from("comments")
      .select("id, author_id, post_id, parent_id")
      .eq("id", parentId)
      .eq("post_id", input.postId)
      .maybeSingle();

    if (parentError) return { error: parentError.message };
    if (!parentComment) return { error: "Parent comment not found." };

    parentAuthorId = parentComment.author_id;
    // Threading stops at one level: replying to a reply attaches to the same
    // thread root rather than nesting further, so a phone-width thread can
    // never indent itself into a column of single words. The person being
    // answered is still the one notified.
    parentId = parentComment.parent_id ?? parentComment.id;
  }

  const { data, error } = await supabase
    .from("comments")
    .insert({
      post_id: input.postId,
      author_id: user.id,
      content,
      parent_id: parentId,
    })
    .select(COMMENT_SELECT)
    .single<RawSubmittedComment>();

  if (error) return { error: error.message };

  const comment = normalizeComment(data);
  const recipientId = parentAuthorId ?? post.author_id;

  if (recipientId && recipientId !== user.id) {
    const actorName = displayName(actorProfile);
    const commentKind = parentAuthorId ? "replied to your comment" : "commented on your post";
    const ctaPath = `/post/${post.slug}#comments`;
    // The client has no INSERT policy on notifications
    // (20260715000007_restrict_notification_inserts_to_admin.sql), so this must
    // go through the service role.
    const admin = createAdminClient();
    const { error: notificationError } = await admin.from("notifications").insert({
      user_id: recipientId,
      type: "comment",
      message: `${actorName} ${commentKind}${getPostReferenceSuffix(post)}`,
      link: ctaPath,
      actor_id: user.id,
      post_id: input.postId,
      comment_id: comment.id,
      read: false,
    });

    if (notificationError) {
      console.error(`Failed to create comment notification: ${notificationError.message}`);
    } else {
      const commentPreview = deriveCommentPreview(content);
      const emailResult = await sendUserEmail({
        recipientId,
        subject: parentAuthorId
          ? `${actorName} replied to your Indegenius comment`
          : `${actorName} commented on your Indegenius post`,
        preview: `${actorName} ${commentKind}.`,
        title: parentAuthorId ? "New reply to your comment" : "New comment on your post",
        // "commentKind" already says "...on your post" / "...to your comment",
        // so the title (when present) is an additional " on \"Title\"" clause
        // rather than a full replacement -- and is simply omitted when null,
        // instead of producing a redundant "...your post on your post.".
        intro: `${actorName} ${commentKind}${
          getPostDisplayTitle(post) ? ` on "${getPostDisplayTitle(post)}"` : ""
        }.`,
        bodyHtml: `<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#4b5563;border-left:3px solid #10b981;padding-left:14px;">${escapeHtml(commentPreview)}</p>`,
        bodyTextLines: [`Comment: ${commentPreview}`],
        ctaLabel: "Open discussion",
        ctaPath,
        idempotencyKey: `comment:${comment.id}:${recipientId}`,
        preferenceKey: "email_comments",
        cooldownMs: ENGAGEMENT_PUSH_COOLDOWN_MS,
      });
      logEmailResult(`comment:${comment.id}:${recipientId}`, emailResult);

      const pushResult = await sendPushNotification({
        recipientId,
        title: parentAuthorId ? "New reply to your comment" : "New comment on your post",
        body: `${actorName} ${commentKind}: ${commentPreview}`,
        path: ctaPath,
        preferenceKey: "push_comments",
        cooldownMs: ENGAGEMENT_PUSH_COOLDOWN_MS,
      });
      logPushResult(`comment:${comment.id}:${recipientId}`, pushResult);
    }
  }

  await recordActivationEvent({
    supabase,
    event: "comment_submitted",
    userId: user.id,
    metadata: { postId: input.postId, commentId: comment.id, isReply: Boolean(parentId) },
    source: "server_action",
    route: `/post/${post.slug}`,
  });

  revalidatePath(`/post/${post.slug}`);

  return { error: null, comment };
}

/**
 * The next page of top-level comments, oldest-ward of `cursor`. Runs on the
 * viewer's client so RLS keeps hidden comments out, and reuses the same reader
 * as the first page.
 */
export async function loadMoreComments(input: {
  postId: string;
  cursor: string | null;
}): Promise<{ error: string | null; page?: CommentPage }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  try {
    const page = await fetchCommentPage(supabase, {
      postId: input.postId,
      viewerId: user?.id ?? null,
      before: input.cursor,
    });
    return { error: null, page };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not load more comments.",
    };
  }
}

export async function updateComment(input: {
  commentId: string;
  content: string;
}): Promise<{ error: string | null; comment?: SubmittedComment }> {
  const bodyError = getCommentBodyError(input.content);
  if (bodyError) return { error: bodyError };
  const content = normalizeCommentText(input.content);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You must be signed in to edit a comment." };

  const suspensionError = await requireNotSuspended(user.id);
  if (suspensionError) return { error: suspensionError };

  // The RLS UPDATE policy already restricts this to the author's own rows, and
  // the column-level revoke keeps moderation and vote state out of reach; the
  // author_id filter is belt-and-braces so a wrong id fails as "not yours"
  // rather than silently updating nothing.
  const { data, error } = await supabase
    .from("comments")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", input.commentId)
    .eq("author_id", user.id)
    .select(`${COMMENT_SELECT}, posts!comments_post_id_fkey (slug)`)
    .maybeSingle<RawSubmittedComment & { posts: { slug: string } | { slug: string }[] | null }>();

  if (error) return { error: error.message };
  if (!data) return { error: "You can only edit your own comment." };

  const postRef = Array.isArray(data.posts) ? data.posts[0] : data.posts;
  if (postRef?.slug) revalidatePath(`/post/${postRef.slug}`);

  return { error: null, comment: normalizeComment(data) };
}

export async function deleteComment(input: {
  commentId: string;
}): Promise<{ error: string | null; tombstoned?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You must be signed in to delete a comment." };

  const { data: existing } = await supabase
    .from("comments")
    .select("id, author_id, posts!comments_post_id_fkey (slug)")
    .eq("id", input.commentId)
    .maybeSingle<{ id: string; author_id: string; posts: { slug: string } | { slug: string }[] | null }>();

  if (!existing || existing.author_id !== user.id) {
    return { error: "You can only delete your own comment." };
  }

  const { count: replyCount } = await supabase
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", input.commentId);

  const postRef = Array.isArray(existing.posts) ? existing.posts[0] : existing.posts;
  const revalidate = () => {
    if (postRef?.slug) revalidatePath(`/post/${postRef.slug}`);
  };

  if ((replyCount ?? 0) > 0) {
    const { error } = await supabase
      .from("comments")
      .update({ content: DELETED_COMMENT_TOMBSTONE, updated_at: new Date().toISOString() })
      .eq("id", input.commentId)
      .eq("author_id", user.id);

    if (error) return { error: error.message };
    revalidate();
    return { error: null, tombstoned: true };
  }

  const { error } = await supabase
    .from("comments")
    .delete()
    .eq("id", input.commentId)
    .eq("author_id", user.id);

  if (error) return { error: error.message };
  revalidate();

  return { error: null, tombstoned: false };
}
