"use server";

import { revalidatePath } from "next/cache";
import {
  createAdminActionClient,
  recordAdminAuditEvent,
} from "@/lib/adminAccess";
import {
  getEditorialReviewState,
  publishReviewedPost,
  recordEditorDecision,
  requiresEditorialWorkflow,
} from "@/lib/reviewWorkflow";
import type { EditorDecision } from "@/lib/types";

async function requireEditorAccess() {
  try {
    const { admin, context } = await createAdminActionClient("editorial.manage");
    return { supabase: admin, context, error: null };
  } catch (error) {
    return {
      supabase: null,
      context: null,
      error:
        error instanceof Error
          ? error.message
          : "You do not have permission to review posts.",
    };
  }
}

function revalidateEditorialPaths(slug?: string | null, citationId?: string | null) {
  revalidatePath("/admin/review");
  revalidatePath("/review");
  revalidatePath("/dashboard");
  revalidatePath("/");

  if (slug) {
    revalidatePath(`/post/${slug}`);
    revalidatePath(`/edit/${slug}`);
  }

  if (citationId) {
    revalidatePath(`/publication/${citationId}`);
  }
}

export async function assignReviewer(postId: string, reviewerId: string, round: number) {
  const { supabase, context, error: accessError } = await requireEditorAccess();
  if (accessError || !supabase || !context) return { error: accessError };

  const [{ data: reviewer }, { data: post }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", reviewerId).single(),
    supabase.from("posts").select("author_id, title, slug").eq("id", postId).single(),
  ]);

  if (!post || post.author_id === reviewerId) {
    return { error: "You cannot assign the author as a reviewer." };
  }

  if (
    reviewer?.role !== "reviewer" &&
    reviewer?.role !== "editor" &&
    reviewer?.role !== "admin"
  ) {
    return { error: "Selected user cannot review posts." };
  }

  const { error } = await supabase.from("post_reviews").upsert(
    {
      post_id: postId,
      reviewer_id: reviewerId,
      round,
    },
    {
      onConflict: "post_id,reviewer_id,round",
      ignoreDuplicates: true,
    }
  );

  if (error) return { error: error.message };

  await supabase.from("notifications").insert({
    user_id: reviewerId,
    type: "review_assigned",
    message: `You've been assigned to review: ${post.title}`,
    link: `/review/${postId}`,
    post_id: postId,
    read: false,
  });

  await recordAdminAuditEvent({
    admin: supabase,
    context,
    action: "editorial.reviewer_assigned",
    targetTable: "post_reviews",
    targetId: postId,
    metadata: {
      postId,
      reviewerId,
      round,
    },
  });

  revalidateEditorialPaths(post.slug);
  return { error: null };
}

export async function toggleFeaturedPost(postId: string, nextFeatured: boolean) {
  const { supabase, context, error: accessError } = await requireEditorAccess();
  if (accessError || !supabase || !context) {
    return { error: accessError, featured: !nextFeatured };
  }

  if (nextFeatured) {
    const { error: unfeatureError } = await supabase
      .from("posts")
      .update({ featured: false })
      .eq("featured", true);

    if (unfeatureError) {
      return { error: unfeatureError.message, featured: !nextFeatured };
    }
  }

  const { data: post, error } = await supabase
    .from("posts")
    .update({ featured: nextFeatured })
    .eq("id", postId)
    .select("slug")
    .single();

  if (error) {
    return { error: error.message, featured: !nextFeatured };
  }

  await recordAdminAuditEvent({
    admin: supabase,
    context,
    action: "editorial.featured_post_toggled",
    targetTable: "posts",
    targetId: postId,
    metadata: { featured: nextFeatured },
  });

  revalidatePath("/");
  revalidatePath("/admin/review");
  if (post?.slug) {
    revalidatePath(`/post/${post.slug}`);
  }

  return { error: null, featured: nextFeatured };
}

export async function submitEditorialDecision(input: {
  postId: string;
  decision: EditorDecision;
  notes?: string;
}) {
  const { supabase, context, error: accessError } = await requireEditorAccess();
  if (accessError || !supabase || !context) return { error: accessError };

  const reviewState = await getEditorialReviewState(input.postId);
  if (!reviewState.post) {
    return { error: "Post not found." };
  }

  const post = reviewState.post;

  if (requiresEditorialWorkflow(post.type) && !reviewState.readyForDecision) {
    return {
      error: reviewState.errors[0] ?? "This submission is not ready for an editor decision yet.",
    };
  }

  try {
    await recordEditorDecision({
      postId: input.postId,
      round: post.current_round,
      editorId: context.userId,
      decision: input.decision,
      notes: input.notes,
    });
  } catch (decisionError) {
    return {
      error:
        decisionError instanceof Error
          ? decisionError.message
          : "Unable to record the editorial decision.",
    };
  }

  if (input.decision === "accept") {
    try {
      const publication = requiresEditorialWorkflow(post.type)
        ? await publishReviewedPost({
            postId: input.postId,
            round: post.current_round,
            editorId: context.userId,
          })
        : null;

      if (!requiresEditorialWorkflow(post.type)) {
        const { error } = await supabase
          .from("posts")
          .update({ status: "published", published_at: new Date().toISOString() })
          .eq("id", input.postId);

        if (error) {
          return { error: error.message };
        }
      }

      const { data: authorProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", post.author_id)
        .maybeSingle();

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      void fetch(`${appUrl}/api/audio-summary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": process.env.ADMIN_SECRET ?? "",
        },
        body: JSON.stringify({
          postId: input.postId,
          title: post.title,
          content: post.content ?? "",
          authorName: authorProfile?.full_name ?? "A ThinkAfrica author",
          postType: post.type,
        }),
      }).catch(() => {});

      await supabase.from("notifications").insert({
        user_id: post.author_id,
        type: "post_published",
        message: `Your ${post.type === "policy_brief" ? "policy brief" : post.type} "${
          post.title
        }" has been accepted and published${
          publication?.citationId ? `. Citation ID: ${publication.citationId}` : "."
        }`,
        link: publication?.citationId ? `/publication/${publication.citationId}` : `/post/${post.slug}`,
        post_id: input.postId,
        read: false,
      });

      await recordAdminAuditEvent({
        admin: supabase,
        context,
        action: "editorial.decision_recorded",
        targetTable: "posts",
        targetId: input.postId,
        metadata: {
          decision: input.decision,
          postType: post.type,
          round: post.current_round,
          citationId: publication?.citationId ?? post.citation_id,
        },
      });

      revalidateEditorialPaths(post.slug, publication?.citationId ?? post.citation_id);
      return { error: null };
    } catch (publishError) {
      return {
        error:
          publishError instanceof Error
            ? publishError.message
            : "Unable to publish this submission.",
      };
    }
  }

  if (input.decision === "request_revision") {
    const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("posts")
      .update({ status: "pending_revision", revision_due_at: dueDate })
      .eq("id", input.postId);

    if (error) {
      return { error: error.message };
    }

    await supabase.from("notifications").insert({
      user_id: post.author_id,
      type: "revision_requested",
      message: input.notes?.trim()
        ? `Revision requested for "${post.title}": ${input.notes.trim()}`
        : `Revision requested for "${post.title}". Visit your dashboard for the editor decision and reviewer notes.`,
      link: `/edit/${post.slug}`,
      post_id: input.postId,
      read: false,
    });

    await recordAdminAuditEvent({
      admin: supabase,
      context,
      action: "editorial.decision_recorded",
      targetTable: "posts",
      targetId: input.postId,
      metadata: {
        decision: input.decision,
        postType: post.type,
        round: post.current_round,
        revisionDueAt: dueDate,
      },
    });

    revalidateEditorialPaths(post.slug, post.citation_id);
    return { error: null };
  }

  const { error } = await supabase.from("posts").update({ status: "rejected" }).eq("id", input.postId);
  if (error) {
    return { error: error.message };
  }

  await supabase.from("notifications").insert({
    user_id: post.author_id,
    type: "post_rejected",
    message: input.notes?.trim()
      ? `Your submission "${post.title}" was rejected: ${input.notes.trim()}`
      : `Your submission "${post.title}" was rejected. Visit your dashboard for the editorial decision.`,
    link: "/dashboard",
    post_id: input.postId,
    read: false,
  });

  await recordAdminAuditEvent({
    admin: supabase,
    context,
    action: "editorial.decision_recorded",
    targetTable: "posts",
    targetId: input.postId,
    metadata: {
      decision: input.decision,
      postType: post.type,
      round: post.current_round,
    },
  });

  revalidateEditorialPaths(post.slug, post.citation_id);
  return { error: null };
}
