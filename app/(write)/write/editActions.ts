"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sanitizePostHtml } from "@/lib/sanitizePostHtml";
import { getTopicValuesValidationError, MAX_LONG_FORM_TOPICS, normalizeAndDedupeTopicValues } from "@/lib/tags";
import { resolveContentKind } from "@/lib/contentModel";
import type { ContributionSnapshot } from "@/lib/contribution";
import {
  getPersistedReferenceId,
  hasReferenceContent,
  validateCitationReferences,
  type ReferenceLike,
} from "@/lib/postReferences";

/**
 * Carries `id` through into the snapshot. The body's inline citations anchor to
 * these ids, so a source that already exists on the live post has to come back
 * out of the edit draft as the same row rather than as a lookalike copy.
 */
function normalizeReferences(references: ContributionSnapshot["references"]) {
  return references
    .map((reference, index) => ({
      id: getPersistedReferenceId(reference.id),
      display_order: index,
      ref_type: reference.ref_type ?? "other",
      authors: reference.authors?.trim() || null,
      title: reference.title?.trim() ?? "",
      year: reference.year ?? null,
      source: reference.source?.trim() || null,
      url: reference.url?.trim() || null,
      doi: reference.doi?.trim() || null,
      raw: reference.raw?.trim() || null,
    }))
    .filter(hasReferenceContent);
}

async function editablePublishedPost(postId: string, userId: string) {
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("posts")
    .select("id, slug, author_id, status, type, content_kind, citation_id, published_version_id")
    .eq("id", postId)
    .maybeSingle();
  const locked =
    !post ||
    post.author_id !== userId ||
    post.status !== "published" ||
    post.type === "policy_brief" ||
    resolveContentKind(post) === "research" ||
    Boolean(post.citation_id) ||
    Boolean(post.published_version_id);
  return { supabase, post: locked ? null : post };
}

export async function savePublishedEditDraft(input: {
  postId: string;
  snapshot: ContributionSnapshot;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in.", editDraftId: null as string | null };

  const editable = await editablePublishedPost(input.postId, user.id);
  if (!editable.post) {
    return { error: "This publication is locked or unavailable.", editDraftId: null as string | null };
  }
  const tagError = getTopicValuesValidationError(input.snapshot.tags);
  if (tagError) return { error: tagError, editDraftId: null as string | null };

  const references = normalizeReferences(input.snapshot.references);
  const incompleteReference = references.find(
    (reference) => !reference.title || (!reference.source && !reference.url && !reference.doi && !reference.raw)
  );
  if (incompleteReference) {
    return { error: "Each source needs a title and a publication, URL, DOI, or note.", editDraftId: null as string | null };
  }

  const { data, error } = await editable.supabase
    .from("post_edit_drafts")
    .upsert(
      {
        post_id: input.postId,
        author_id: user.id,
        title: input.snapshot.title.trim() || null,
        excerpt: input.snapshot.excerpt,
        content: sanitizePostHtml(input.snapshot.content),
        tags: normalizeAndDedupeTopicValues(input.snapshot.tags, MAX_LONG_FORM_TOPICS),
        cover_image_url: input.snapshot.coverImageUrl || null,
        reference_snapshot: references,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "post_id" }
    )
    .select("id")
    .single();

  return { error: error?.message ?? null, editDraftId: data?.id ?? null };
}

export async function applyPublishedEditDraft(input: { editDraftId: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in.", slug: null as string | null };

  // Publishing checks this; updating a live publication has to check it too, or
  // an edit that drops a cited source leaves a dead [source] link in public.
  const { data: draft } = await supabase
    .from("post_edit_drafts")
    .select("content, reference_snapshot")
    .eq("id", input.editDraftId)
    .eq("author_id", user.id)
    .maybeSingle();
  if (!draft) return { error: "This edit draft is unavailable.", slug: null as string | null };

  const citationError = validateCitationReferences(
    draft.content ?? "",
    Array.isArray(draft.reference_snapshot) ? (draft.reference_snapshot as ReferenceLike[]) : []
  );
  if (citationError) return { error: citationError, slug: null as string | null };

  const { data, error } = await supabase.rpc("apply_post_edit_draft", {
    target_draft_id: input.editDraftId,
  });
  if (error) return { error: error.message, slug: null as string | null };

  const slug = typeof data === "string" ? data : null;
  revalidatePath("/");
  revalidatePath("/dashboard");
  if (slug) revalidatePath(`/post/${slug}`);
  return { error: null, slug };
}

export async function discardPublishedEditDraft(input: { editDraftId: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };
  const { error } = await supabase
    .from("post_edit_drafts")
    .delete()
    .eq("id", input.editDraftId)
    .eq("author_id", user.id);
  return { error: error?.message ?? null };
}
