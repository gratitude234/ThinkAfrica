"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canPublish } from "@/lib/roles";
import {
  getEditorialReviewState,
  publishReviewedPost,
  recordEditorDecision,
  requiresEditorialWorkflow,
} from "@/lib/reviewWorkflow";
import type { EditorDecision } from "@/lib/types";

async function requireEditorAccess() {
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

  const isBootstrapAdmin = user.email === process.env.ADMIN_EMAIL;
  const hasEditorialRole =
    profile?.role === "admin" ||
    profile?.role === "editor" ||
    (profile?.role ? canPublish(profile.role) : false);

  if (!isBootstrapAdmin && !hasEditorialRole) {
    return { supabase, user, error: "You do not have permission to review posts." };
  }

  return { supabase, user, error: null };
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
  const { supabase, error: accessError } = await requireEditorAccess();
  if (accessError) return { error: accessError };

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

  revalidateEditorialPaths(post.slug);
  return { error: null };
}

export async function submitEditorialDecision(input: {
  postId: string;
  decision: EditorDecision;
  notes?: string;
}) {
  const { supabase, user, error: accessError } = await requireEditorAccess();
  if (accessError || !user) return { error: accessError };

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
      editorId: user.id,
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
            editorId: user.id,
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
          authorName: authorProfile?.full_name ?? "A ThinkAfrika author",
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

  revalidateEditorialPaths(post.slug, post.citation_id);
  return { error: null };
}
