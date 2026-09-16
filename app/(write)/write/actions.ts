"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createPost,
  postMutationMessage,
  renamePostSlug,
  publishOwnDraft,
  updateDraftComposition,
} from "@/lib/postMutations";
import { sanitizePostHtml } from "@/lib/sanitizePostHtml";
import { buildSlugFromTitle, slugBaseFromTitle } from "@/lib/postSlug";
import {
  getPersistedReferenceId,
  hasReferenceContent,
  validateCitationReferences,
} from "@/lib/postReferences";
import { resolveReferenceCitations } from "@/lib/citationResolution";
import { isReferenceResolutionEnabled } from "@/lib/featureFlags";
import { recordActivationEvent } from "@/lib/activationServer";
import { requireNotSuspended } from "@/lib/suspension";
import { resolveContentKind } from "@/lib/contentModel";
import type { PostReferenceRecord } from "@/lib/types";
import {
  getTopicValuesValidationError,
  MAX_LONG_FORM_TOPICS,
  normalizeAndDedupeTopicValues,
} from "@/lib/tags";
import {
  contributionText,
  deriveContributionExcerpt,
  derivePresentationClassification,
  type ContributionSnapshot,
} from "@/lib/contribution";

type ReferenceInput = Omit<PostReferenceRecord, "post_id"> & {
  id?: string;
};

async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null };
  }

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
    .filter(hasReferenceContent);
}

function validateReferences(references: ReferenceInput[]) {
  for (const reference of normalizeReferences(references)) {
    if (!reference.title) {
      return "Each reference needs a title before you can continue.";
    }

    if (!reference.source && !reference.url && !reference.doi && !reference.raw) {
      return "Each reference needs a source, URL, DOI, or note so it can be verified.";
    }
  }

  return null;
}

function hasMeaningfulArticleContent(content: string) {
  return content
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|#160|#x0*a0);/gi, " ")
    .replace(/[\s\u200b-\u200d\ufeff]/g, "")
    .length > 0;
}

async function syncReferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string,
  references: ReferenceInput[]
) {
  const normalized = normalizeReferences(references);
  // Resolve internal reference URLs to the works they point at, so a citation
  // edge exists the moment the author saves rather than waiting for a
  // backfill. Gated: the column is added by 20260827000001.
  const resolved = isReferenceResolutionEnabled()
    ? await resolveReferenceCitations(supabase, normalized, {
        appUrl: process.env.NEXT_PUBLIC_APP_URL,
        citingPostId: postId,
      })
    : normalized.map((reference) => ({ ...reference, referenced_post_id: null }));
  const { data: existingRows, error: existingError } = await supabase
    .from("post_references")
    .select("id")
    .eq("post_id", postId);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingIds = new Set((existingRows ?? []).map((row) => row.id));
  const incomingIds = new Set(
    resolved
      .map((reference) => getPersistedReferenceId(reference.id))
      .filter(Boolean) as string[]
  );

  const idsToDelete = Array.from(existingIds).filter((id) => !incomingIds.has(id));

  if (idsToDelete.length > 0) {
    const { error } = await supabase
      .from("post_references")
      .delete()
      .eq("post_id", postId)
      .in("id", idsToDelete);

    if (error) {
      throw new Error(error.message);
    }
  }

  for (let index = 0; index < resolved.length; index += 1) {
    const reference = resolved[index];
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
      // The original url is preserved above; this is the resolved relation.
      ...(isReferenceResolutionEnabled()
        ? { referenced_post_id: reference.referenced_post_id }
        : {}),
    };

    const persistedId = getPersistedReferenceId(reference.id);
    if (persistedId && existingIds.has(persistedId)) {
      const { error } = await supabase
        .from("post_references")
        .update(payload)
        .eq("id", persistedId)
        .eq("post_id", postId);

      if (error) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabase.from("post_references").insert(
        persistedId ? { ...payload, id: persistedId } : payload
      );

      if (error) {
        throw new Error(error.message);
      }
    }
  }
}

/**
 * LEGACY COMPATIBILITY — post_authors owner row.
 *
 * Co-authoring is removed. Nothing in this file invites, removes or edits a
 * co-author, and existing co-authored publications are left exactly as they
 * are. The writer's own row is still written, because an authorization rule
 * depends on it: the `post_references` SELECT policy admits published posts,
 * reviewers and `is_post_coauthor()`, and that function reads `post_authors`
 * and nothing else. Without this row a writer cannot read the sources on their
 * own unpublished draft, and syncReferences would try to insert again the rows
 * it cannot see. Retire it together with a migration that lets a post's author
 * read its references directly.
 *
 * Insert-only. An existing row is never updated, so a credit that already
 * exists keeps its order, its corresponding-author flag and its acceptance.
 */
async function ensureOwnerCredit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string,
  ownerId: string
) {
  const { error } = await supabase.from("post_authors").upsert(
    {
      post_id: postId,
      user_id: ownerId,
      display_order: 0,
      corresponding_author: true,
      accepted_at: new Date().toISOString(),
    },
    { onConflict: "post_id,user_id", ignoreDuplicates: true }
  );
  if (error) throw new Error(error.message);
}

function uniqueSlugSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function universalSlug(snapshot: ContributionSnapshot) {
  const seed = snapshot.title.trim() || contributionText(snapshot.content).split(/\s+/).slice(0, 7).join(" ");
  return buildSlugFromTitle(seed, "publication", uniqueSlugSuffix());
}

/**
 * A draft's slug is minted on its first autosave, roughly two seconds into
 * writing, when a body-first draft usually has no title yet. That leaves the
 * URL named after whichever half-sentence existed at that moment. Once a title
 * exists at publish time it should name the URL instead. Drafts are private, so
 * there is no earlier address to keep working.
 */
async function slugForPublication(
  supabase: Awaited<ReturnType<typeof createClient>>,
  draft: { id: string; slug: string },
  authorId: string,
  title: string
) {
  const base = slugBaseFromTitle(title);
  if (!base || draft.slug.startsWith(`${base}-`)) return draft.slug;

  const nextSlug = `${base}-${uniqueSlugSuffix()}`;
  const renamed = await renamePostSlug(
    { supabase, actor: { kind: "author", userId: authorId } },
    draft.id,
    nextSlug
  );

  // A rename is a courtesy, not a gate: keep publishing on the original slug
  // rather than failing the publish over a cosmetic URL. The domain refuses a
  // rename of a locked or removed post, which this statement never checked.
  return renamed.ok ? nextSlug : draft.slug;
}

/** Neutral cloud autosave for titled or untitled direct publications. */
export async function ensureContributionDraft(input: {
  draftId: string | null;
  snapshot: ContributionSnapshot;
}) {
  const { supabase, user } = await getCurrentUser();
  if (!user) return { error: "You must be signed in.", draftId: null as string | null };
  const suspensionError = await requireNotSuspended(user.id);
  if (suspensionError) return { error: suspensionError, draftId: null as string | null };

  const tagError = getTopicValuesValidationError(input.snapshot.tags);
  if (tagError) return { error: tagError, draftId: null as string | null };
  const tags = normalizeAndDedupeTopicValues(input.snapshot.tags, MAX_LONG_FORM_TOPICS);
  const content = sanitizePostHtml(input.snapshot.content);
  const classification = derivePresentationClassification(input.snapshot.title);

  // `in_response_to` is deliberately absent from both writes below. A new
  // draft is never a Response. A draft started as one before the publishing
  // reset keeps the parent it already has, because nothing here sets, changes
  // or clears that column.
  let draftId = input.draftId;
  if (draftId) {
    const { data: existing } = await supabase
      .from("posts")
      .select("id, author_id, status")
      .eq("id", draftId)
      .maybeSingle();
    if (!existing || existing.author_id !== user.id) {
      return { error: "You do not have permission to edit this draft.", draftId: null as string | null };
    }
    if (existing.status !== "draft") {
      return { error: "This publication is no longer an editable draft.", draftId: null as string | null };
    }
    const composed = await updateDraftComposition(
      { supabase, actor: { kind: "author", userId: user.id } },
      draftId,
      {
        ...classification,
        excerpt: input.snapshot.excerpt,
        content,
        tags,
        cover_image_url: input.snapshot.coverImageUrl || null,
      }
    );
    if (!composed.ok) {
      return {
        error:
          composed.failure.kind === "conflict"
            ? "This draft changed in another window."
            : postMutationMessage(composed.failure),
        draftId: null as string | null,
      };
    }
  } else {
    const created = await createPost(
      { supabase, actor: { kind: "author", userId: user.id } },
      {
        ...classification,
        slug: universalSlug(input.snapshot),
        excerpt: input.snapshot.excerpt,
        content,
        tags,
        cover_image_url: input.snapshot.coverImageUrl || null,
        status: "draft",
        published_at: null,
      }
    );
    if (!created.ok) {
      return {
        error: postMutationMessage(created.failure),
        draftId: null as string | null,
      };
    }
    const data = created.data;
    draftId = data.id;
  }

  if (!draftId) {
    return { error: "We couldn't resolve this draft.", draftId: null as string | null };
  }

  try {
    // The owner credit first: it is what lets syncReferences see the sources
    // already saved on this draft.
    await ensureOwnerCredit(supabase, draftId, user.id);
    await syncReferences(supabase, draftId, input.snapshot.references);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "We couldn't save the publication details.", draftId };
  }

  // A restore point for the writer. record_post_revision() throttles and
  // prunes, so calling it on every autosave is cheap and produces a readable
  // list rather than a row every two seconds. Deliberately best-effort: a
  // history write must never be the reason a save reports failure.
  const bodyText = contributionText(content);
  await supabase.rpc("record_post_revision", {
    target_post_id: draftId,
    p_title: input.snapshot.title,
    p_excerpt: input.snapshot.excerpt,
    p_content: content,
    p_word_count: bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0,
  });

  return { error: null, draftId };
}

/** Publishes a Post or an Article immediately. */
export async function publishContribution(input: {
  draftId: string | null;
  snapshot: ContributionSnapshot;
}) {
  const { supabase, user } = await getCurrentUser();
  if (!user) return { error: "You must be signed in.", slug: null as string | null };

  const content = sanitizePostHtml(input.snapshot.content);
  if (!hasMeaningfulArticleContent(content)) {
    return { error: "Write something before publishing.", slug: null as string | null };
  }
  const referenceError = validateReferences(input.snapshot.references);
  if (referenceError) return { error: referenceError, slug: null as string | null };
  const citationError = validateCitationReferences(content, input.snapshot.references);
  if (citationError) return { error: citationError, slug: null as string | null };

  const snapshot = {
    ...input.snapshot,
    content,
    excerpt: input.snapshot.excerpt.trim() || deriveContributionExcerpt(content),
  };
  const ensured = await ensureContributionDraft({ draftId: input.draftId, snapshot });
  if (ensured.error || !ensured.draftId) {
    return { error: ensured.error ?? "We couldn't prepare this publication.", slug: null as string | null };
  }

  const { data: draft } = await supabase
    .from("posts")
    .select("id, slug, status")
    .eq("id", ensured.draftId)
    .eq("author_id", user.id)
    .maybeSingle();
  if (!draft || draft.status !== "draft") {
    return { error: "This draft was already published or changed in another window.", slug: null as string | null };
  }

  const slug = await slugForPublication(supabase, draft, user.id, snapshot.title);

  // Through the domain, so the policy decides. The predicates and the
  // affected-row check that used to live here are inside publishOwnDraft, and
  // it additionally refuses what this statement could not see: a draft whose
  // type is research or a policy brief, whose publication is an editorial act
  // rather than the author's.
  const publishResult = await publishOwnDraft(
    { supabase, actor: { kind: "author", userId: user.id } },
    draft.id
  );
  if (!publishResult.ok) {
    return {
      error: postMutationMessage(publishResult.failure),
      slug: null as string | null,
    };
  }

  revalidatePath("/");
  revalidatePath("/[username]", "page");
  revalidatePath(`/post/${slug}`);
  await recordActivationEvent({
    supabase,
    event: "post_submitted",
    userId: user.id,
    metadata: { postId: draft.id, status: "published", hasTitle: Boolean(snapshot.title.trim()) },
    source: "server_action",
    route: "/write",
  });
  return { error: null, slug };
}
