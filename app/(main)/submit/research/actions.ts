"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizePostHtml } from "@/lib/sanitizePostHtml";
import { recordActivationEvent } from "@/lib/activationServer";
import { createVersionSnapshot } from "@/lib/reviewWorkflow";
import { buildSlugFromTitle } from "@/lib/postSlug";
import { contentKindFromLegacyType } from "@/lib/contentModel";
import type { PostReferenceRecord } from "@/lib/types";

type ReferenceInput = Omit<PostReferenceRecord, "post_id"> & {
  id?: string;
};

type CoAuthorInput = {
  user_id: string;
  display_order: number;
  corresponding_author?: boolean;
};

export interface ResearchDocumentInput {
  documentPath: string | null;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
}

interface ResearchPayload {
  draftId: string | null;
  title: string;
  abstract: string;
  tags: string[];
  document: ResearchDocumentInput;
  references: ReferenceInput[];
  coAuthors: CoAuthorInput[];
  authorNote?: string;
}

interface ResearchUploadDraftInput {
  draftId: string | null;
  title: string;
  abstract: string;
  tags: string[];
}

const RESEARCH_SETUP_ERROR =
  "Research document storage is not set up yet. Apply the research document migration.";

function isResearchSetupError(message: string | null | undefined) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("document_path") ||
    normalized.includes("document_original_name") ||
    normalized.includes("document_mime_type") ||
    normalized.includes("document_size_bytes") ||
    normalized.includes("schema cache") ||
    normalized.includes("column") ||
    normalized.includes("research-documents")
  );
}

function userSafeDatabaseError(message: string | null | undefined) {
  return isResearchSetupError(message) ? RESEARCH_SETUP_ERROR : message;
}

async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
}

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
    .filter((reference) =>
      Boolean(
        reference.title ||
          reference.authors ||
          reference.source ||
          reference.url ||
          reference.doi ||
          reference.raw
      )
    );
}

function validateResearchPayload(
  input: ResearchPayload,
  forSubmit: boolean,
  effectiveStatus: string | null
) {
  if (!input.title.trim()) {
    return "Add a research title so reviewers can identify the paper.";
  }
  if (!input.abstract.trim()) {
    return "Add an abstract that summarizes the question, method, findings, and contribution.";
  }
  if (input.tags.length === 0) {
    return "Add at least one topic so editors can route the submission.";
  }

  if (forSubmit && !input.document.documentPath) {
    return "Upload the final research PDF before submitting for review. Word or Google Docs files should be exported as PDF first.";
  }

  if (input.document.documentPath && input.document.mimeType !== "application/pdf") {
    return "Research documents must be PDF files because the accepted manuscript is archived for citation.";
  }

  const normalized = normalizeReferences(input.references);
  for (const reference of normalized) {
    if (!reference.title) return "Each reference needs a title reviewers can verify.";
    if (!reference.source && !reference.url && !reference.doi && !reference.raw) {
      return "Each reference needs a source, URL, DOI, or note so reviewers can verify it.";
    }
  }

  if (forSubmit && normalized.length === 0) {
    return "Add at least one structured reference before submitting the research paper for review.";
  }

  if (
    forSubmit &&
    effectiveStatus === "pending_revision" &&
    !input.authorNote?.trim()
  ) {
    return "Add an author response note explaining what changed before resubmitting this revision.";
  }

  return null;
}

function buildResearchContent(abstract: string, documentName: string | null) {
  const escapedAbstract = abstract.trim();
  const documentLine = documentName
    ? `<p><strong>Submitted document:</strong> ${documentName}</p>`
    : "";

  return sanitizePostHtml(
    `<h2>Abstract</h2><p>${escapedAbstract}</p>${documentLine}`
  );
}

function normalizeResearchDraftFields(input: ResearchUploadDraftInput) {
  const title = input.title.trim() || "Untitled research paper";
  const abstract =
    input.abstract.trim() ||
    "Abstract pending. Add the research question, method, findings, and contribution before submitting for review.";
  const tags = input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);

  return {
    title,
    abstract,
    tags: tags.length > 0 ? tags : ["research"],
  };
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

async function syncAuthors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string,
  ownerId: string,
  coAuthors: CoAuthorInput[]
) {
  const deduped = new Map<string, CoAuthorInput>();
  for (const coAuthor of coAuthors) {
    if (!coAuthor.user_id || coAuthor.user_id === ownerId) continue;
    if (!deduped.has(coAuthor.user_id) && deduped.size < 5) {
      deduped.set(coAuthor.user_id, coAuthor);
    }
  }

  const sanitized = Array.from(deduped.values()).map((coAuthor, index) => ({
    user_id: coAuthor.user_id,
    display_order: index + 1,
    corresponding_author: Boolean(coAuthor.corresponding_author),
  }));

  const { data: existingRows } = await supabase
    .from("post_authors")
    .select("user_id, accepted_at")
    .eq("post_id", postId);
  const existingByUserId = new Map(
    (existingRows ?? []).map((row) => [
      row.user_id as string,
      row.accepted_at as string | null,
    ])
  );
  const nextIds = new Set(sanitized.map((coAuthor) => coAuthor.user_id));
  const removedIds = Array.from(existingByUserId.keys()).filter(
    (userId) => userId !== ownerId && !nextIds.has(userId)
  );

  if (removedIds.length > 0) {
    await supabase
      .from("post_authors")
      .delete()
      .eq("post_id", postId)
      .in("user_id", removedIds);
  }

  await supabase.from("post_authors").upsert(
    {
      post_id: postId,
      user_id: ownerId,
      display_order: 0,
      corresponding_author: !sanitized.some((coAuthor) => coAuthor.corresponding_author),
      accepted_at: existingByUserId.get(ownerId) ?? new Date().toISOString(),
    },
    { onConflict: "post_id,user_id" }
  );

  for (const coAuthor of sanitized) {
    await supabase.from("post_authors").upsert(
      {
        post_id: postId,
        user_id: coAuthor.user_id,
        display_order: coAuthor.display_order,
        corresponding_author: coAuthor.corresponding_author,
        accepted_at: existingByUserId.get(coAuthor.user_id) ?? null,
      },
      { onConflict: "post_id,user_id" }
    );
  }
}

async function upsertResearchPost(input: ResearchPayload, status: "draft" | "pending") {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    return { error: "You must be signed in.", postId: null as string | null, slug: null as string | null };
  }

  const normalizedTags = input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  const content = buildResearchContent(input.abstract, input.document.originalName);
  const now = new Date().toISOString();

  let postId = input.draftId;
  let slug: string | null = null;
  // Never trusted from the client -- this action derives every workflow
  // decision (whether an author note is required, what round/version_kind
  // a resubmission's snapshot gets, whether a fresh submit is even legal)
  // from the row's own stored state, fetched below. A previous version of
  // this file took `currentStatus`/`currentRound` as client-supplied input
  // fields instead, the same anti-pattern already fixed for Article/Post
  // editing in app/(main)/edit/[slug]/actions.ts's saveEditedPost().
  let effectiveStatus: string | null = null;
  let effectiveRound = 1;

  if (postId) {
    const { data: existingPost } = await supabase
      .from("posts")
      .select("id, author_id, slug, status, current_round, type")
      .eq("id", postId)
      .single();

    if (!existingPost || existingPost.author_id !== user.id) {
      return { error: "You do not have permission to edit this research submission.", postId: null, slug: null };
    }

    if (existingPost.type !== "research") {
      return { error: "This submission is not a research paper.", postId: null, slug: null };
    }

    // Saving or submitting is only legal from draft or pending_revision --
    // not an already-pending, published, rejected, removed, or withdrawn
    // row. Without this, submitResearchPaper() could take an already-
    // withdrawn submission (see withdraw_post_submission() in
    // supabase/migrations/20260720000001_lock_accepted_and_removed_posts.sql)
    // straight back to 'pending', resurrecting it outside any real
    // resubmission flow and past reviewer assignments already retired via
    // post_reviews.removed_at. guard_locked_post_write independently
    // backstops this at the database level for withdrawn/removed/
    // published-formal rows, but this check gives a clear error instead of
    // a wasted, rejected write.
    if (!["draft", "pending_revision"].includes(existingPost.status)) {
      return {
        error: "This research submission can no longer be edited from here.",
        postId: null,
        slug: null,
      };
    }

    slug = existingPost.slug;
    effectiveStatus = existingPost.status;
    effectiveRound = existingPost.current_round ?? 1;
  }

  const validationError = validateResearchPayload(input, status === "pending", effectiveStatus);
  if (validationError) {
    return { error: validationError, postId: null, slug: null };
  }

  if (postId) {
    const nextStatus =
      status === "draft" && effectiveStatus !== "draft" ? effectiveStatus : status;
    const nextRound =
      status === "pending" && effectiveStatus === "pending_revision"
        ? effectiveRound + 1
        : effectiveRound;

    // The status filter is part of the WHERE clause itself, not just the
    // pre-check above, so a concurrent write changing this row's status
    // can't be raced past -- mirrors the atomic-update pattern used
    // throughout app/(write)/write/actions.ts.
    const { data: updatedRows, error } = await supabase
      .from("posts")
      .update({
        title: input.title.trim(),
        excerpt: input.abstract.trim(),
        content,
        tags: normalizedTags,
        type: "research",
        content_kind: contentKindFromLegacyType("research"),
        article_format: null,
        status: nextStatus,
        published_at: nextStatus === "published" ? undefined : null,
        current_round: nextRound,
        revision_due_at: status === "pending" ? null : undefined,
        document_path: input.document.documentPath,
        document_original_name: input.document.originalName,
        document_mime_type: input.document.mimeType,
        document_size_bytes: input.document.sizeBytes,
      })
      .eq("id", postId)
      .eq("author_id", user.id)
      .in("status", ["draft", "pending_revision"])
      .select("id");

    if (error) {
      return {
        error:
          userSafeDatabaseError(error.message) ??
          "Failed to save research submission.",
        postId: null,
        slug: null,
      };
    }

    if (!updatedRows || updatedRows.length === 0) {
      return {
        error: "This research submission can no longer be edited from here.",
        postId: null,
        slug: null,
      };
    }
  } else {
    slug = buildSlugFromTitle(input.title, "research", Date.now().toString(36));
    const { data, error } = await supabase
      .from("posts")
      .insert({
        author_id: user.id,
        title: input.title.trim(),
        slug,
        excerpt: input.abstract.trim(),
        content,
        tags: normalizedTags,
        type: "research",
        content_kind: contentKindFromLegacyType("research"),
        article_format: null,
        status,
        current_round: 1,
        published_at: null,
        document_path: input.document.documentPath,
        document_original_name: input.document.originalName,
        document_mime_type: input.document.mimeType,
        document_size_bytes: input.document.sizeBytes,
      })
      .select("id")
      .single();

    if (error || !data) {
      return {
        error:
          userSafeDatabaseError(error?.message) ??
          "Failed to save research submission.",
        postId: null,
        slug: null,
      };
    }

    postId = data.id;
  }

  if (!postId || !slug) {
    return { error: "Unable to resolve research submission.", postId: null, slug: null };
  }

  try {
    await syncReferences(supabase, postId, input.references);
    await syncAuthors(supabase, postId, user.id, input.coAuthors);
  } catch (error) {
    const message = error instanceof Error ? error.message : null;
    return {
      error:
        userSafeDatabaseError(message) ??
        "Failed to save research authors or references.",
      postId: null,
      slug: null,
    };
  }

  if (status === "pending") {
    const admin = createAdminClient();
    const isRevisionResubmission = effectiveStatus === "pending_revision";
    const snapshotRound = isRevisionResubmission ? effectiveRound : 1;
    const snapshotKind = isRevisionResubmission ? "revision" : "submission";
    const { data: existingVersion } = await admin
      .from("post_versions")
      .select("id")
      .eq("post_id", postId)
      .eq("round", snapshotRound)
      .eq("version_kind", snapshotKind)
      .maybeSingle();

    if (!existingVersion) {
      try {
        await createVersionSnapshot({
          admin,
          postId,
          round: snapshotRound,
          versionKind: snapshotKind,
          authorNote: input.authorNote,
          submittedBy: user.id,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : null;
        return {
          error:
            userSafeDatabaseError(message) ??
            "Failed to capture the research submission snapshot.",
          postId: null,
          slug: null,
        };
      }
    }

    await recordActivationEvent({
      supabase,
      event: "post_submitted",
      userId: user.id,
      metadata: {
        postId,
        postType: "research",
        status,
      },
      source: "server_action",
      route: "/submit/research",
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin/review");
  revalidatePath(`/post/${slug}`);

  return { error: null, postId, slug };
}

export async function saveResearchDraft(input: ResearchPayload) {
  return upsertResearchPost(input, "draft");
}

export async function submitResearchPaper(input: ResearchPayload) {
  return upsertResearchPost(input, "pending");
}

export async function ensureResearchDraftForUpload(input: ResearchUploadDraftInput) {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    return { error: "You must be signed in.", postId: null as string | null, slug: null as string | null };
  }

  const { title, abstract, tags } = normalizeResearchDraftFields(input);
  const content = buildResearchContent(abstract, null);
  const now = Date.now().toString(36);

  if (input.draftId) {
    const { data: existingPost } = await supabase
      .from("posts")
      .select("id, author_id, slug, status")
      .eq("id", input.draftId)
      .eq("type", "research")
      .single();

    if (!existingPost || existingPost.author_id !== user.id) {
      return { error: "You do not have permission to update this research submission.", postId: null, slug: null };
    }

    if (!["draft", "pending_revision"].includes(existingPost.status)) {
      return {
        error: "This research submission cannot accept a new PDF in its current review state.",
        postId: null,
        slug: null,
      };
    }

    const { error } = await supabase
      .from("posts")
      .update({
        title,
        excerpt: abstract,
        content,
        tags,
      })
      .eq("id", existingPost.id)
      .eq("author_id", user.id);

    if (error) {
      return {
        error:
          userSafeDatabaseError(error.message) ??
          "Failed to prepare the research draft for upload.",
        postId: null,
        slug: null,
      };
    }

    revalidatePath("/dashboard");
    revalidatePath(`/submit/research`);
    return { error: null, postId: existingPost.id as string, slug: existingPost.slug as string };
  }

  const slug = buildSlugFromTitle(title, "research", now);
  const { data, error } = await supabase
    .from("posts")
    .insert({
      author_id: user.id,
      title,
      slug,
      excerpt: abstract,
      content,
      tags,
      type: "research",
      content_kind: contentKindFromLegacyType("research"),
      article_format: null,
      status: "draft",
      current_round: 1,
      published_at: null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      error:
        userSafeDatabaseError(error?.message) ??
        "Failed to create a research draft for upload.",
      postId: null,
      slug: null,
    };
  }

  await syncAuthors(supabase, data.id, user.id, []);
  revalidatePath("/dashboard");
  revalidatePath(`/submit/research`);

  return { error: null, postId: data.id as string, slug };
}
