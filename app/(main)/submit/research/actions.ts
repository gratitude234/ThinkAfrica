"use server";

import { revalidatePath } from "next/cache";
import slugify from "slugify";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizePostHtml } from "@/lib/sanitizePostHtml";
import { recordActivationEvent } from "@/lib/activationServer";
import { createVersionSnapshot } from "@/lib/reviewWorkflow";
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
  currentStatus?: string;
  currentRound?: number;
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

function validateResearchPayload(input: ResearchPayload, forSubmit: boolean) {
  if (!input.title.trim()) return "Add a research title.";
  if (!input.abstract.trim()) return "Add an abstract before continuing.";
  if (input.tags.length === 0) return "Add at least one topic.";

  if (forSubmit && !input.document.documentPath) {
    return "Upload the research PDF before submitting for review.";
  }

  if (input.document.documentPath && input.document.mimeType !== "application/pdf") {
    return "Research documents must be PDF files.";
  }

  const normalized = normalizeReferences(input.references);
  for (const reference of normalized) {
    if (!reference.title) return "Each reference needs a title.";
    if (!reference.source && !reference.url && !reference.doi && !reference.raw) {
      return "Each reference needs a source, URL, DOI, or note.";
    }
  }

  if (forSubmit && normalized.length === 0) {
    return "Research submissions need at least one structured reference.";
  }

  if (
    forSubmit &&
    input.currentStatus === "pending_revision" &&
    !input.authorNote?.trim()
  ) {
    return "Add an author response note before resubmitting this revision.";
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

  const validationError = validateResearchPayload(input, status === "pending");
  if (validationError) {
    return { error: validationError, postId: null, slug: null };
  }

  const normalizedTags = input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  const content = buildResearchContent(input.abstract, input.document.originalName);
  const now = new Date().toISOString();

  let postId = input.draftId;
  let slug: string | null = null;

  if (postId) {
    const { data: existingPost } = await supabase
      .from("posts")
      .select("id, author_id, slug, status, current_round")
      .eq("id", postId)
      .single();

    if (!existingPost || existingPost.author_id !== user.id) {
      return { error: "You do not have permission to edit this research submission.", postId: null, slug: null };
    }

    slug = existingPost.slug;
    const nextStatus =
      status === "draft" && existingPost.status !== "draft"
        ? existingPost.status
        : status;
    const nextRound =
      status === "pending" && existingPost.status === "pending_revision"
        ? (existingPost.current_round ?? 1) + 1
        : (existingPost.current_round ?? 1);

    const { error } = await supabase
      .from("posts")
      .update({
        title: input.title.trim(),
        excerpt: input.abstract.trim(),
        content,
        tags: normalizedTags,
        type: "research",
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
      .eq("author_id", user.id);

    if (error) {
      return { error: error.message, postId: null, slug: null };
    }
  } else {
    slug = `${slugify(input.title, { lower: true, strict: true }) || "research"}-${Date.now().toString(36)}`;
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
      return { error: error?.message ?? "Failed to save research submission.", postId: null, slug: null };
    }

    postId = data.id;
  }

  if (!postId || !slug) {
    return { error: "Unable to resolve research submission.", postId: null, slug: null };
  }

  await syncReferences(supabase, postId, input.references);
  await syncAuthors(supabase, postId, user.id, input.coAuthors);

  if (status === "pending") {
    const admin = createAdminClient();
    const { data: existingVersion } = await admin
      .from("post_versions")
      .select("id")
      .eq("post_id", postId)
      .eq("round", input.currentRound ?? 1)
      .eq(
        "version_kind",
        input.currentStatus === "pending_revision" ? "revision" : "submission"
      )
      .maybeSingle();

    if (!existingVersion) {
      await createVersionSnapshot({
        admin,
        postId,
        round: input.currentStatus === "pending_revision" ? input.currentRound ?? 1 : 1,
        versionKind: input.currentStatus === "pending_revision" ? "revision" : "submission",
        authorNote: input.authorNote,
        submittedBy: user.id,
      });
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
