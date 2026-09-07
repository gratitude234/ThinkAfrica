"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  postMutationMessage,
  resubmitRevision,
  updateDraftComposition,
} from "@/lib/postMutations";
import {
  getTopicValuesValidationError,
  normalizeTagValue,
} from "@/lib/tags";
import { sanitizePostHtml } from "@/lib/sanitizePostHtml";
import { createVersionSnapshot, requiresEditorialWorkflow } from "@/lib/reviewWorkflow";
import { resolveArticleFormat, resolveContentKind } from "@/lib/contentModel";
import type { PostReferenceRecord } from "@/lib/types";
import type { PostType } from "@/lib/utils";

type ReferenceInput = Omit<PostReferenceRecord, "post_id"> & {
  id?: string;
};

function normalizeReferences(references: ReferenceInput[]) {
  return references
    .map((reference) => ({
      ...reference,
      title: reference.title?.trim() ?? "",
      authors: reference.authors?.trim() || null,
      source: reference.source?.trim() || null,
      url: reference.url?.trim() || null,
      doi: reference.doi?.trim() || null,
      raw: reference.raw?.trim() || null,
      ref_type: reference.ref_type ?? "other",
    }))
    .filter((reference) => {
      return Boolean(
        reference.title ||
          reference.authors ||
          reference.source ||
          reference.url ||
          reference.doi ||
          reference.raw
      );
    });
}

function validateReferences(postType: PostType, references: ReferenceInput[]) {
  const normalized = normalizeReferences(references);

  for (const reference of normalized) {
    if (!reference.title) {
      return "Each reference needs a title before you can continue.";
    }

    if (!reference.source && !reference.url && !reference.doi && !reference.raw) {
      return "Each reference needs a source, URL, DOI, or note so it can be verified.";
    }
  }

  if (requiresEditorialWorkflow(postType) && normalized.length === 0) {
    return "Research and policy briefs need at least one structured reference.";
  }

  return null;
}

async function syncReferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string,
  references: ReferenceInput[]
) {
  const normalized = normalizeReferences(references);
  const { data: existingRows } = await supabase
    .from("post_references")
    .select("id")
    .eq("post_id", postId);

  const existingIds = new Set((existingRows ?? []).map((row) => row.id));
  const incomingIds = new Set(
    normalized.map((reference) => reference.id).filter(Boolean) as string[]
  );

  const idsToDelete = Array.from(existingIds).filter((id) => !incomingIds.has(id));

  if (idsToDelete.length > 0) {
    await supabase
      .from("post_references")
      .delete()
      .eq("post_id", postId)
      .in("id", idsToDelete);
  }

  for (let index = 0; index < normalized.length; index += 1) {
    const reference = normalized[index];
    const payload = {
      post_id: postId,
      display_order: index,
      ref_type: reference.ref_type ?? "other",
      authors: reference.authors,
      title: reference.title,
      year: reference.year ?? null,
      source: reference.source,
      url: reference.url,
      doi: reference.doi,
      raw: reference.raw,
    };

    if (reference.id && !reference.id.startsWith("temp-")) {
      await supabase
        .from("post_references")
        .update(payload)
        .eq("id", reference.id)
        .eq("post_id", postId);
    } else {
      await supabase.from("post_references").insert(payload);
    }
  }
}

export async function saveEditedPost(input: {
  postId: string;
  title: string;
  excerpt: string;
  content: string;
  tags: string[];
  coverImageUrl: string;
  authorNote: string;
  references: ReferenceInput[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const { data: post } = await supabase
    .from("posts")
    .select("author_id, slug, type, content_kind, article_format, status, current_round")
    .eq("id", input.postId)
    .single();

  if (!post || post.author_id !== user.id) {
    return { error: "You do not have permission to edit this post." };
  }

  if (post.type === "research") {
    return {
      error: "Research papers must be revised through the research submission flow.",
    };
  }

  if (post.status === "published" && requiresEditorialWorkflow(post.type)) {
    return {
      error:
        "Published research and policy briefs are locked after acceptance so their citation record stays stable.",
    };
  }

  // Editing never reclassifies a post, and never drives its own workflow
  // transition from client input -- there is no client-supplied `postType`,
  // `currentStatus`, or `currentRound` trusted here at all. Every check and
  // every write below uses only the post's own stored, freshly-fetched
  // values, so a modified request (e.g. claiming `currentStatus: "published"`
  // for a post that is actually "pending_revision") cannot skip the
  // author-note requirement or self-publish unreviewed work.
  const effectiveType = post.type as PostType;
  const effectiveContentKind = resolveContentKind(post);
  const effectiveArticleFormat = resolveArticleFormat(post);

  const referenceError = validateReferences(effectiveType, input.references);
  if (referenceError) {
    return { error: referenceError };
  }
  const tagError = getTopicValuesValidationError(input.tags);
  if (tagError) {
    return { error: tagError };
  }

  if (
    post.status === "pending_revision" &&
    requiresEditorialWorkflow(post.type) &&
    !input.authorNote.trim()
  ) {
    return { error: "Add an author response note before resubmitting this revision." };
  }

  await syncReferences(supabase, input.postId, input.references);

  const sanitizedContent = sanitizePostHtml(input.content);
  const actor = { kind: "author" as const, userId: user.id };

  // Two writes where there was one, and deliberately in this order.
  //
  // The single statement saved the revision and resubmitted it together, which
  // reads like the safer shape and was not: it carried no status predicate and
  // nobody checked how many rows it touched, so a submission an editor accepted
  // between the read above and this write was silently overwritten. Splitting
  // it puts both operations behind the domain, where each carries the state it
  // was authorized against.
  //
  // Content first. If the resubmission then fails, the writer's revision is
  // saved and the post is still in revision, which is a state they can retry
  // from. The reverse ordering loses the revision.
  const composed = await updateDraftComposition({ supabase, actor }, input.postId, {
    title: input.title.trim(),
    excerpt: input.excerpt,
    content: sanitizedContent,
    tags: input.tags.map(normalizeTagValue).filter(Boolean),
    type: effectiveType,
    content_kind: effectiveContentKind,
    article_format: effectiveArticleFormat,
    cover_image_url: input.coverImageUrl || null,
  });

  if (!composed.ok) {
    return { error: postMutationMessage(composed.failure) };
  }

  if (post.status === "pending_revision") {
    const resubmitted = await resubmitRevision({ supabase, actor }, input.postId, {
      current_round: post.current_round + 1,
    });

    if (!resubmitted.ok) {
      return { error: postMutationMessage(resubmitted.failure) };
    }
  }

  if (post.status === "pending_revision") {
    const admin = createAdminClient();

    try {
      await createVersionSnapshot({
        admin,
        postId: input.postId,
        round: post.current_round,
        versionKind: "revision",
        authorNote: input.authorNote,
        submittedBy: user.id,
      });
    } catch (snapshotError) {
      return {
        error:
          snapshotError instanceof Error
            ? snapshotError.message
            : "Failed to capture the revision snapshot.",
      };
    }
  }

  revalidatePath("/dashboard");
  revalidatePath(`/edit/${post.slug}`);
  revalidatePath(`/post/${post.slug}`);
  revalidatePath("/admin/review");

  return { error: null };
}
