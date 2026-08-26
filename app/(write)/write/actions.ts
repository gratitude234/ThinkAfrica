"use server";

import { revalidatePath } from "next/cache";
import slugify from "slugify";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEmailResult, sendUserEmail } from "@/lib/email";
import { sanitizePostHtml } from "@/lib/sanitizePostHtml";
import { buildSlugFromTitle, looksLikeUrl, slugBaseFromTitle } from "@/lib/postSlug";
import {
  getPersistedReferenceId,
  hasReferenceContent,
  validateCitationReferences,
} from "@/lib/postReferences";
import { isLowQualityTitle } from "@/lib/postQuality";
import { resolveReferenceCitations } from "@/lib/citationResolution";
import { isCredibilityGraphEnabled } from "@/lib/featureFlags";
import { recordActivationEvent } from "@/lib/activationServer";
import { requireNotSuspended } from "@/lib/suspension";
import {
  legacyTypeForNewContent,
  parseArticleFormat,
  resolveArticleFormat,
  resolveContentKind,
  type ArticleFormat,
  type ContentKind,
} from "@/lib/contentModel";
import {
  createVersionSnapshot,
  getSubmissionTrack,
  requiresEditorialWorkflow,
} from "@/lib/reviewWorkflow";
import { notifyResponseParentAuthor, validateResponseParent } from "@/lib/responsePost";
import type { PostReferenceRecord } from "@/lib/types";
import type { PostType } from "@/lib/utils";
import { schedulePublicationDistribution } from "@/lib/publicationDistribution";
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

type CoAuthorInput = {
  user_id: string;
  display_order: number;
  corresponding_author?: boolean;
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
  const resolved = isCredibilityGraphEnabled()
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
      ...(isCredibilityGraphEnabled()
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

async function syncAuthors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string,
  slug: string,
  ownerId: string,
  coAuthors: CoAuthorInput[],
  ownerName: string
) {
  const deduped = new Map<string, CoAuthorInput>();
  for (const coAuthor of coAuthors) {
    if (!coAuthor.user_id || coAuthor.user_id === ownerId) {
      continue;
    }

    if (!deduped.has(coAuthor.user_id) && deduped.size < 5) {
      deduped.set(coAuthor.user_id, coAuthor);
    }
  }

  const sanitized = Array.from(deduped.values())
    .sort((left, right) => left.display_order - right.display_order)
    .map((coAuthor, index) => ({
      user_id: coAuthor.user_id,
      display_order: index + 1,
      corresponding_author: Boolean(coAuthor.corresponding_author),
    }));

  const correspondingUserId =
    sanitized.find((coAuthor) => coAuthor.corresponding_author)?.user_id ?? ownerId;

  const { data: existingRows, error: existingError } = await supabase
    .from("post_authors")
    .select("user_id, accepted_at")
    .eq("post_id", postId);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingByUserId = new Map(
    (existingRows ?? []).map((row) => [row.user_id as string, row.accepted_at as string | null])
  );
  const nextIds = new Set(sanitized.map((coAuthor) => coAuthor.user_id));
  const removedIds = Array.from(existingByUserId.keys()).filter(
    (userId) => userId !== ownerId && !nextIds.has(userId)
  );

  if (removedIds.length > 0) {
    const { error } = await supabase
      .from("post_authors")
      .delete()
      .eq("post_id", postId)
      .in("user_id", removedIds);

    if (error) {
      throw new Error(error.message);
    }
  }

  const { error: ownerError } = await supabase.from("post_authors").upsert(
    {
      post_id: postId,
      user_id: ownerId,
      display_order: 0,
      corresponding_author: correspondingUserId === ownerId,
      accepted_at: existingByUserId.get(ownerId) ?? new Date().toISOString(),
    },
    {
      onConflict: "post_id,user_id",
    }
  );

  if (ownerError) {
    throw new Error(ownerError.message);
  }

  const admin = createAdminClient();

  for (const coAuthor of sanitized) {
    const existingAcceptedAt = existingByUserId.get(coAuthor.user_id) ?? null;
    const { error } = await supabase.from("post_authors").upsert(
      {
        post_id: postId,
        user_id: coAuthor.user_id,
        display_order: coAuthor.display_order,
        corresponding_author: correspondingUserId === coAuthor.user_id,
        accepted_at: existingAcceptedAt,
      },
      {
        onConflict: "post_id,user_id",
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    if (!existingByUserId.has(coAuthor.user_id) || existingAcceptedAt === null) {
      const { error: notificationError } = await admin.from("notifications").insert({
        user_id: coAuthor.user_id,
        type: "co_author_invite",
        message: `${ownerName} has invited you to co-author this post.`,
        link: `/post/${slug}`,
        actor_id: ownerId,
        post_id: postId,
        read: false,
      });
      if (!notificationError) {
        const emailResult = await sendUserEmail({
          recipientId: coAuthor.user_id,
          subject: `${ownerName} invited you to co-author on Indegenius`,
          preview: `${ownerName} has invited you to co-author an Indegenius post.`,
          title: "Co-author invitation",
          intro: `${ownerName} has invited you to co-author an Indegenius post. Review the invitation and accept or decline from your notifications.`,
          ctaLabel: "Review invitation",
          ctaPath: `/post/${slug}`,
          idempotencyKey: `co-author-invite:${postId}:${coAuthor.user_id}`,
          preferenceKey: "email_co_author_invite",
        });
        logEmailResult(`co_author_invite:${postId}:${coAuthor.user_id}`, emailResult);
      }
      await recordActivationEvent({
        supabase,
        event: "coauthor_invite_sent",
        userId: ownerId,
        metadata: {
          postId,
          invitedUserId: coAuthor.user_id,
        },
        source: "server_action",
        route: "/write",
      });
    }
  }
}

async function syncDraftAuthors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string,
  ownerId: string,
  collaborators: ContributionSnapshot["collaborators"]
) {
  const ids = Array.from(
    new Set(collaborators.map((collaborator) => collaborator.id).filter((id) => id && id !== ownerId))
  ).slice(0, 5);
  const { data: existing, error: existingError } = await supabase
    .from("post_authors")
    .select("user_id")
    .eq("post_id", postId);
  if (existingError) throw new Error(existingError.message);

  const removed = (existing ?? [])
    .map((row) => row.user_id as string)
    .filter((id) => id !== ownerId && !ids.includes(id));
  if (removed.length) {
    const { error } = await supabase.from("post_authors").delete().eq("post_id", postId).in("user_id", removed);
    if (error) throw new Error(error.message);
  }
  const { error: ownerError } = await supabase.from("post_authors").upsert(
    { post_id: postId, user_id: ownerId, display_order: 0, corresponding_author: true, accepted_at: new Date().toISOString() },
    { onConflict: "post_id,user_id" }
  );
  if (ownerError) throw new Error(ownerError.message);

  for (let index = 0; index < ids.length; index += 1) {
    const { error } = await supabase.from("post_authors").upsert(
      { post_id: postId, user_id: ids[index], display_order: index + 1, corresponding_author: false, accepted_at: null },
      { onConflict: "post_id,user_id" }
    );
    if (error) throw new Error(error.message);
  }
}

// /write is the Article composer (Phase 3, see docs/content-model.md):
// every NEW draft/post it creates is a generic Article, no matter what a
// client sends as `postType` -- that field is legacy plumbing (word-count
// targets, reference requirements for an *existing* draft) and must never
// be trusted to decide a NEW row's classification.
const NEW_ARTICLE_TYPE: PostType = (legacyTypeForNewContent("article") ?? "essay") as PostType;

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

  const { data: renamed } = await supabase
    .from("posts")
    .update({ slug: `${base}-${uniqueSlugSuffix()}` })
    .eq("id", draft.id)
    .eq("author_id", authorId)
    .eq("status", "draft")
    .select("slug")
    .maybeSingle();

  // A rename is a courtesy, not a gate: keep publishing on the original slug
  // rather than failing the publish over a cosmetic URL.
  return renamed?.slug ?? draft.slug;
}

async function validateCampusPrompt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  promptId: string | null
) {
  if (!promptId) return { error: null, promptId: null as string | null };
  const [{ data: membership }, { data: ambassador }, { data: prompt }] = await Promise.all([
    supabase.from("campus_cohort_memberships").select("cohort_id").eq("user_id", userId).maybeSingle(),
    supabase.from("campus_ambassadors").select("campus_cohort_id").eq("user_id", userId).eq("status", "active").maybeSingle(),
    supabase.from("campus_editorial_prompts").select("id, cohort_id, starts_at, ends_at, active, campus_cohorts!inner(status)").eq("id", promptId).maybeSingle(),
  ]);
  const cohort = prompt ? (Array.isArray(prompt.campus_cohorts) ? prompt.campus_cohorts[0] ?? null : prompt.campus_cohorts) : null;
  const startsAt = prompt?.starts_at ? Date.parse(prompt.starts_at) : Number.NaN;
  const endsAt = prompt?.ends_at ? Date.parse(prompt.ends_at) : null;
  const now = Date.now();
  const valid = Boolean(
    prompt?.active && cohort && ["selected", "active"].includes(cohort.status) &&
    (membership?.cohort_id === prompt.cohort_id || ambassador?.campus_cohort_id === prompt.cohort_id) &&
    Number.isFinite(startsAt) && startsAt <= now && (endsAt === null || endsAt > now)
  );
  return valid
    ? { error: null, promptId: prompt?.id ?? null }
    : { error: "This campus prompt is no longer available to your cohort.", promptId: null as string | null };
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

  if (input.snapshot.inResponseToId) {
    const parent = await validateResponseParent(supabase, input.snapshot.inResponseToId, input.draftId);
    if (parent.error) return { error: parent.error, draftId: null as string | null };
  }

  let draftId = input.draftId;
  if (draftId) {
    const { data: existing } = await supabase
      .from("posts")
      .select("id, author_id, status, type, content_kind")
      .eq("id", draftId)
      .maybeSingle();
    if (!existing || existing.author_id !== user.id) {
      return { error: "You do not have permission to edit this draft.", draftId: null as string | null };
    }
    if (existing.type === "research" || resolveContentKind(existing) === "research") {
      return { error: "Research must be edited through the research submission flow.", draftId: null as string | null };
    }
    if (existing.status !== "draft") {
      return { error: "This publication is no longer an editable draft.", draftId: null as string | null };
    }
    const { data: updated, error } = await supabase
      .from("posts")
      .update({
        ...classification,
        excerpt: input.snapshot.excerpt,
        content,
        tags,
        cover_image_url: input.snapshot.coverImageUrl || null,
        in_response_to: input.snapshot.inResponseToId,
      })
      .eq("id", draftId)
      .eq("author_id", user.id)
      .eq("status", "draft")
      .select("id");
    if (error || !updated?.length) {
      return { error: error?.message ?? "This draft changed in another window.", draftId: null as string | null };
    }
  } else {
    const { data, error } = await supabase
      .from("posts")
      .insert({
        author_id: user.id,
        ...classification,
        slug: universalSlug(input.snapshot),
        excerpt: input.snapshot.excerpt,
        content,
        tags,
        cover_image_url: input.snapshot.coverImageUrl || null,
        in_response_to: input.snapshot.inResponseToId,
        status: "draft",
        published_at: null,
        current_round: 1,
      })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "We couldn't save this draft.", draftId: null as string | null };
    draftId = data.id;
  }

  if (!draftId) {
    return { error: "We couldn't resolve this draft.", draftId: null as string | null };
  }

  try {
    await syncReferences(supabase, draftId, input.snapshot.references);
    await syncDraftAuthors(supabase, draftId, user.id, input.snapshot.collaborators);
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

/** Publishes every non-Research contribution immediately. */
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
  const referenceError = validateReferences("blog", input.snapshot.references);
  if (referenceError) return { error: referenceError, slug: null as string | null };
  const citationError = validateCitationReferences(content, input.snapshot.references);
  if (citationError) return { error: citationError, slug: null as string | null };

  const prompt = await validateCampusPrompt(supabase, user.id, input.snapshot.promptId);
  if (prompt.error) return { error: prompt.error, slug: null as string | null };

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

  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();
  try {
    await syncAuthors(
      supabase,
      draft.id,
      slug,
      user.id,
      snapshot.collaborators.map((collaborator, index) => ({
        user_id: collaborator.id,
        display_order: index + 1,
      })),
      ownerProfile?.full_name ?? "An Indegenius author"
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : "We couldn't save the collaborators.", slug: null as string | null };
  }

  const { data: published, error } = await supabase
    .from("posts")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", draft.id)
    .eq("author_id", user.id)
    .eq("status", "draft")
    .select("id");
  if (error || !published?.length) {
    return { error: error?.message ?? "This draft changed in another window.", slug: null as string | null };
  }

  if (prompt.promptId) {
    const { error: promptError } = await supabase.from("campus_prompt_submissions").insert({
      prompt_id: prompt.promptId,
      post_id: draft.id,
      author_id: user.id,
    });
    if (!promptError) revalidatePath("/campus");
  }

  if (snapshot.inResponseToId) {
    const parentValidation = await validateResponseParent(supabase, snapshot.inResponseToId, draft.id);
    if (parentValidation.parent) {
      await notifyResponseParentAuthor({
        parent: parentValidation.parent,
        responderId: user.id,
        responderName: ownerProfile?.full_name ?? "An Indegenius author",
        responsePostId: draft.id,
        responseSlug: slug,
      });
      revalidatePath(`/post/${parentValidation.parent.slug}`);
    }
  }

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath(`/post/${slug}`);
  schedulePublicationDistribution(draft.id, "Publication");
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

export async function ensureDraft(input: {
  draftId: string | null;
  title: string;
  excerpt: string;
  content: string;
  tags: string[];
  postType: PostType;
  // Phase 4A: optional Article genre, persisted by autosave so it survives
  // closing/reopening the publish drawer and navigating away entirely --
  // see the note on publishPost()'s articleFormat field below for the
  // undefined-vs-null distinction and why it's scoped to
  // effectiveType === NEW_ARTICLE_TYPE only.
  articleFormat?: ArticleFormat | null;
  coverImageUrl: string;
  inResponseTo?: string | null;
}) {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    return { error: "You must be signed in.", draftId: null as string | null };
  }

  const suspensionError = await requireNotSuspended(user.id);
  if (suspensionError) {
    return { error: suspensionError, draftId: null as string | null };
  }

  if (input.tags.length > MAX_LONG_FORM_TOPICS) {
    return {
      error: `Articles can have at most ${MAX_LONG_FORM_TOPICS} topics.`,
      draftId: null as string | null,
    };
  }
  const tagError = getTopicValuesValidationError(input.tags);
  if (tagError) {
    return { error: tagError, draftId: null as string | null };
  }
  const normalizedTags = normalizeAndDedupeTopicValues(
    input.tags,
    MAX_LONG_FORM_TOPICS
  );
  const sanitizedContent = sanitizePostHtml(input.content);

  // The server, not the browser, is what actually validates and persists
  // a claimed parent relationship -- /write's own client-side parent
  // lookup (its `loadParentPost` effect) only drives what's *displayed*;
  // a modified request could call this action directly with an arbitrary
  // `inResponseTo`. Re-validated here on every save (not just the first),
  // so a parent that becomes unavailable mid-session (removed, unpublished)
  // surfaces as a clear error instead of silently persisting a stale or
  // spoofed relationship.
  if (input.inResponseTo) {
    const parentValidation = await validateResponseParent(
      supabase,
      input.inResponseTo,
      input.draftId ?? null
    );
    if (parentValidation.error) {
      return { error: parentValidation.error, draftId: null as string | null };
    }
  }

  if (input.draftId) {
    // A modified request must not be able to reclassify an existing draft
    // (e.g. into "research") by sending a different `postType` -- the
    // draft's own stored `type` is the only trusted source for what it is.
    const { data: existing, error: existingError } = await supabase
      .from("posts")
      .select("type, content_kind, article_format, status, author_id")
      .eq("id", input.draftId)
      .maybeSingle();

    if (existingError || !existing || existing.author_id !== user.id) {
      return {
        error: "You do not have permission to edit this draft.",
        draftId: null as string | null,
      };
    }

    if (existing.type === "research") {
      return {
        error: "Research papers must be edited through the research submission flow.",
        draftId: null as string | null,
      };
    }

    if (resolveContentKind(existing) !== "article") {
      return {
        error: "This draft belongs in the Post composer, not the Article editor.",
        draftId: null as string | null,
      };
    }

    // /write (and its autosave) may only ever touch a row that is still an
    // unpublished draft. Once a post has been submitted/published, it moves
    // to /edit's own workflow-aware action -- without this check, a stale
    // or forged `draftId` (e.g. an old `?draft=` URL/link kept around after
    // the post was accepted) would let this action silently overwrite a
    // published or in-review post's content, bypassing citation locks and
    // the editorial workflow entirely.
    if (existing.status !== "draft") {
      return {
        error: "This post is no longer an editable draft.",
        draftId: null as string | null,
      };
    }

    const effectiveType = existing.type as PostType;
    // Preserve the row's own content_kind/article_format rather than
    // recomputing from `type` -- recomputing would collapse a generic
    // Article (type="essay", article_format=null) back into a legacy
    // Essay, since both share the same legacy type value and the
    // recompute has no way to tell them apart.
    const effectiveContentKind = resolveContentKind(existing);
    let effectiveArticleFormat = resolveArticleFormat(existing);
    // Caught in review: only overwrite when the caller actually included
    // articleFormat (a real genre, or an explicit null for "General") --
    // `undefined` means "this call doesn't know/care about genre" (e.g. an
    // autosave tick that only changed content) and must preserve whatever
    // is already stored, not silently clear it. Scoped to
    // NEW_ARTICLE_TYPE only, so a legacy Policy Brief draft's article_format
    // is never touched by this path at all.
    if (effectiveType === NEW_ARTICLE_TYPE && input.articleFormat !== undefined) {
      effectiveArticleFormat = parseArticleFormat(input.articleFormat);
    }

    // The `status = "draft"` filter here (not just the pre-check above) is
    // what makes this safe against a race: if the row was published/
    // submitted by a concurrent publishPost() call between the select above
    // and this update, the WHERE clause excludes it and zero rows are
    // affected, rather than silently overwriting the now-submitted content.
    const { data: updated, error } = await supabase
      .from("posts")
      .update({
        title: input.title.trim(),
        excerpt: input.excerpt,
        content: sanitizedContent,
        tags: normalizedTags,
        type: effectiveType,
        content_kind: effectiveContentKind,
        article_format: effectiveArticleFormat,
        cover_image_url: input.coverImageUrl || null,
        in_response_to: input.inResponseTo ?? null,
      })
      .eq("id", input.draftId)
      .eq("author_id", user.id)
      .eq("status", "draft")
      .select("id");

    if (!error && (!updated || updated.length === 0)) {
      return {
        error: "This post is no longer an editable draft.",
        draftId: null as string | null,
      };
    }

    return { error: error?.message ?? null, draftId: input.draftId };
  }

  const slug = buildSlugFromTitle(input.title, "untitled", Date.now().toString(36));

  const { data, error } = await supabase
    .from("posts")
    .insert({
      author_id: user.id,
      title: input.title.trim(),
      slug,
      excerpt: input.excerpt,
      content: sanitizedContent,
      tags: normalizedTags,
      type: NEW_ARTICLE_TYPE,
      content_kind: "article",
      article_format: parseArticleFormat(input.articleFormat ?? null),
      status: "draft",
      cover_image_url: input.coverImageUrl || null,
      in_response_to: input.inResponseTo ?? null,
    })
    .select("id")
    .single();

  return { error: error?.message ?? null, draftId: data?.id ?? null };
}

export async function savePostReferences(input: {
  postId: string;
  references: ReferenceInput[];
}) {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const { data: post } = await supabase
    .from("posts")
    .select("author_id, type, content_kind, status")
    .eq("id", input.postId)
    .single();

  if (!post || post.author_id !== user.id) {
    return { error: "You do not have permission to edit these references." };
  }

  if (resolveContentKind(post) !== "article") {
    return { error: "These sources do not belong to an Article draft." };
  }

  // This action is only ever meant to touch an in-progress draft (it is
  // called from /write, before first publish) -- without this, a stale
  // `publishDraftId` (e.g. from a request racing a concurrent publish)
  // could edit the reference list on an already-submitted or accepted post.
  //
  // This check is not atomic with the writes below, and the
  // guard_locked_post_child_write DB trigger on post_references (see
  // supabase/migrations/20260720000001_lock_accepted_and_removed_posts.sql,
  // not yet applied) does NOT fully close that gap either: it guarantees a
  // write can never land once the post has actually become locked
  // (published research/policy_brief, or removed), but it intentionally
  // still permits 'pending'/'pending_revision' -- saveEditedPost() (edit/
  // [slug]/actions.ts) legitimately edits references in those states, and
  // the trigger is shared by both callers. So a narrow window remains: if
  // a concurrent publishPost() moves this exact row from 'draft' to
  // 'pending' between this select and the writes below, this action's own
  // stricter "must still be exactly draft" contract is not enforced by
  // either layer. Only a dedicated transactional RPC could close that
  // fully; this is a known, accepted gap, not a solved one.
  if (post.status !== "draft") {
    return { error: "This post is no longer an editable draft." };
  }

  try {
    await syncReferences(supabase, input.postId, input.references);
    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to save references.",
    };
  }
}

export async function publishPost(input: {
  draftId: string | null;
  title: string;
  excerpt: string;
  content: string;
  tags: string[];
  postType: PostType;
  // Phase 4A: optional Article genre (see docs/content-model.md). Only
  // ever honored below when this is a brand-new generic Article (see the
  // effectiveType === NEW_ARTICLE_TYPE guard) -- never for a legacy
  // Policy Brief draft, and never able to influence effectiveType,
  // submitStatus, or which legacy `type` value gets dual-written, so a
  // genre choice can never change publish timing or route a new Article
  // into editorial review.
  articleFormat?: ArticleFormat | null;
  coverImageUrl: string;
  inResponseTo?: string | null;
  customSlug?: string;
  coAuthors?: CoAuthorInput[];
  correspondingAuthorId?: string | null;
  references?: ReferenceInput[];
}) {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    return { error: "You must be signed in.", slug: null as string | null };
  }

  const suspensionError = await requireNotSuspended(user.id);
  if (suspensionError) {
    return { error: suspensionError, slug: null as string | null };
  }

  if (input.postType === "research") {
    return {
      error: "Research papers must be uploaded through the research submission flow.",
      slug: null as string | null,
    };
  }

  if (isLowQualityTitle(input.title)) {
    return {
      error: "Add a real title before publishing. \"Untitled draft\" and similar placeholders aren't allowed.",
      slug: null as string | null,
    };
  }

  const sanitizedContent = sanitizePostHtml(input.content);
  if (!hasMeaningfulArticleContent(sanitizedContent)) {
    return {
      error: "Write something in your Article before publishing.",
      slug: null as string | null,
    };
  }

  // As in ensureDraft(): a modified request must not be able to publish a
  // draft as a *different* classification than what it actually is (e.g.
  // spoofing `postType: "essay"` to force an existing policy_brief draft
  // straight to "published", skipping its review). An existing draft's
  // stored `type` is the only trusted source; only a brand-new row (no
  // draftId yet) gets the new generic-Article classification.
  let effectiveType: PostType = NEW_ARTICLE_TYPE;
  // Mirrors ensureDraft(): preserved from the existing row rather than
  // recomputed from `type`, so a generic Article's null article_format
  // doesn't collapse back into a legacy Essay/Policy Brief label merely by
  // publishing (see the comment on effectiveContentKind in ensureDraft()).
  let effectiveContentKind: ContentKind = "article";
  let effectiveArticleFormat: ArticleFormat | null = null;

  if (input.draftId) {
    const { data: existingPost, error: existingError } = await supabase
      .from("posts")
      .select("status, type, content_kind, article_format")
      .eq("id", input.draftId)
      .eq("author_id", user.id)
      .maybeSingle();

    if (existingError || !existingPost) {
      return {
        error: "You do not have permission to publish this draft.",
        slug: null as string | null,
      };
    }

    if (existingPost.status === "removed") {
      return {
        error: "This post was removed by moderators and cannot be republished.",
        slug: null as string | null,
      };
    }

    if (existingPost.type === "research") {
      return {
        error: "Research papers must be published through the research submission flow.",
        slug: null as string | null,
      };
    }

    if (resolveContentKind(existingPost) !== "article") {
      return {
        error: "This draft belongs in the Post composer, not the Article editor.",
        slug: null as string | null,
      };
    }

    // /write's publish action is only for a composition's *first* publish.
    // Once a post has been submitted (pending/pending_revision) or published,
    // further changes go through /edit's workflow-aware action instead --
    // without this check, a stale or forged `draftId` (e.g. an old
    // `?draft=` link kept around after acceptance) would let this action
    // silently overwrite/resubmit an already-published or in-review post,
    // bypassing citation locks and the editorial workflow entirely.
    if (existingPost.status !== "draft") {
      return {
        error: "This post is no longer an editable draft. Use the edit page to make further changes.",
        slug: null as string | null,
      };
    }

    effectiveType = existingPost.type as PostType;
    effectiveContentKind = resolveContentKind(existingPost) ?? "article";
    effectiveArticleFormat = resolveArticleFormat(existingPost);

    // Caught in review: a legacy Policy Brief that is still a DRAFT (never
    // submitted -- status is still 'draft' here, guaranteed by the check
    // above) is not "in flight" in any legacy workflow --
    // isLegacyPolicyBriefInFlight() (lib/contentModel.ts) only recognizes
    // pending/pending_revision -- and publishing it now must not start a
    // brand-new one. Convert it to an ordinary Policy-Brief-format Article
    // at the moment of first publish: dual-write type="essay" like any
    // other new Article (so submitStatus below resolves to "published",
    // not "pending"), while effectiveArticleFormat above already correctly
    // preserved its "policy_brief" genre from the row's own stored
    // classification -- nothing else needs to change for that to carry
    // through. A row already pending/pending_revision never reaches this
    // function at all (its status !== "draft" check above already rejects
    // it; edit/[slug]'s workflow-aware action owns those), so this can
    // only ever affect a submission that was never actually in flight.
    if (effectiveType === "policy_brief") {
      effectiveType = NEW_ARTICLE_TYPE;
    }
  }

  // Phase 4A genre picker: only ever honored for a brand-
  // new generic Article -- effectiveType is NEW_ARTICLE_TYPE ("essay") for
  // every new Article regardless of chosen genre, and is never itself set
  // from input.articleFormat, so this cannot reach a legacy Policy Brief
  // draft still routed into review (there is none left after the
  // conversion above) or change effectiveType/submitStatus below.
  // parseArticleFormat() fails safe: an unrecognized value becomes null
  // ("General"), never a genre the user didn't pick.
  //
  // Caught in review: only overwrite when the caller actually included
  // articleFormat -- `undefined` means "no opinion, preserve whatever this
  // draft already has" (its own stored genre, read into
  // effectiveArticleFormat above -- including the "policy_brief" the
  // conversion just preserved), not "clear it". An explicit `null` is how
  // a user actively picks "General" to clear an existing genre.
  if (effectiveType === NEW_ARTICLE_TYPE && input.articleFormat !== undefined) {
    effectiveArticleFormat = parseArticleFormat(input.articleFormat);
  }

  const track = await getSubmissionTrack(effectiveType);
  if (!track) {
    return { error: "Submission track is not configured for this format.", slug: null as string | null };
  }

  // An omitted collection means the caller has not hydrated it and must not
  // be interpreted as an instruction to clear it. The active Article client
  // always sends the fully-hydrated collection; older callers can safely omit
  // it without destroying metadata already attached to the draft.
  if (input.references !== undefined) {
    const validationError = validateReferences(effectiveType, input.references);
    if (validationError) {
      return { error: validationError, slug: null as string | null };
    }
    const citationError = validateCitationReferences(
      sanitizedContent,
      input.references
    );
    if (citationError) {
      return { error: citationError, slug: null as string | null };
    }
  }

  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const trimmedCustomSlug = input.customSlug?.trim();
  if (trimmedCustomSlug && looksLikeUrl(trimmedCustomSlug)) {
    return {
      error: "That custom slug looks like a pasted URL. Enter a short, descriptive slug instead.",
      slug: null as string | null,
    };
  }

  const now = new Date().toISOString();
  const slug = trimmedCustomSlug
    ? slugify(trimmedCustomSlug, { lower: true, strict: true }) ||
      buildSlugFromTitle(input.title, "post", Date.now().toString(36))
    : buildSlugFromTitle(input.title, "post", Date.now().toString(36));
  const submitStatus =
    effectiveType === "blog" || effectiveType === "essay" ? "published" : "pending";
  const publishedAt = submitStatus === "published" ? now : null;
  if (input.tags.length > MAX_LONG_FORM_TOPICS) {
    return {
      error: `Articles can have at most ${MAX_LONG_FORM_TOPICS} topics.`,
      slug: null as string | null,
    };
  }
  const tagError = getTopicValuesValidationError(input.tags);
  if (tagError) {
    return { error: tagError, slug: null as string | null };
  }
  const normalizedTags = normalizeAndDedupeTopicValues(
    input.tags,
    MAX_LONG_FORM_TOPICS
  );

  // Re-validated here (not just trusted from an earlier ensureDraft() call)
  // so a parent that became unavailable between opening the composer and
  // clicking publish -- removed, or otherwise no longer published -- is
  // rejected with a clear error instead of silently publishing the
  // response without its relationship, or with a stale/spoofed one.
  let responseParent: Awaited<ReturnType<typeof validateResponseParent>>["parent"] = null;
  if (input.inResponseTo) {
    const parentValidation = await validateResponseParent(
      supabase,
      input.inResponseTo,
      input.draftId ?? null
    );
    if (parentValidation.error) {
      return { error: parentValidation.error, slug: null as string | null };
    }
    responseParent = parentValidation.parent;
  }

  let postId = input.draftId;
  let responseParentPath: string | null = null;

  if (postId) {
    // Persist the final content while the row is still a draft. Sources and
    // attribution are synchronized below before the public status transition,
    // so a metadata failure never leaves an Article live while the UI reports
    // that publishing failed.
    const { data: updatedRows, error } = await supabase
      .from("posts")
      .update({
        title: input.title.trim(),
        excerpt: input.excerpt,
        content: sanitizedContent,
        tags: normalizedTags,
        type: effectiveType,
        content_kind: effectiveContentKind,
        article_format: effectiveArticleFormat,
        cover_image_url: input.coverImageUrl || null,
        in_response_to: responseParent?.id ?? null,
        slug,
        current_round: 1,
        revision_due_at: null,
      })
      .eq("id", postId)
      .eq("author_id", user.id)
      .eq("status", "draft")
      .select("id");

    if (error) {
      return { error: error.message, slug: null as string | null };
    }

    if (!updatedRows || updatedRows.length === 0) {
      return {
        error: "This post is no longer an editable draft. Use the edit page to make further changes.",
        slug: null as string | null,
      };
    }
  } else {
    // New work is also created as a private draft first. Publication is a
    // separate guarded transition after references/authors have succeeded.
    const { data, error } = await supabase
      .from("posts")
      .insert({
        author_id: user.id,
        title: input.title.trim(),
        slug,
        content: sanitizedContent,
        excerpt: input.excerpt,
        type: effectiveType,
        content_kind: effectiveContentKind,
        article_format: effectiveArticleFormat,
        tags: normalizedTags,
        in_response_to: responseParent?.id ?? null,
        status: "draft",
        published_at: null,
        current_round: 1,
        cover_image_url: input.coverImageUrl || null,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { error: error?.message ?? "Failed to publish.", slug: null as string | null };
    }

    postId = data.id;
  }

  if (!postId) {
    return { error: "Unable to resolve the draft.", slug: null as string | null };
  }

  try {
    if (input.references !== undefined) {
      await syncReferences(supabase, postId, input.references);
    }

    if (input.coAuthors !== undefined) {
      await syncAuthors(
        supabase,
        postId,
        slug,
        user.id,
        input.coAuthors,
        ownerProfile?.full_name ?? "An Indegenius author"
      );
    }

    if (input.coAuthors !== undefined && input.correspondingAuthorId) {
      const { error: clearCorrespondingError } = await supabase
        .from("post_authors")
        .update({ corresponding_author: false })
        .eq("post_id", postId)
        .neq("user_id", input.correspondingAuthorId);

      if (clearCorrespondingError) {
        throw new Error(clearCorrespondingError.message);
      }

      const { error: setCorrespondingError } = await supabase
        .from("post_authors")
        .update({ corresponding_author: true })
        .eq("post_id", postId)
        .eq("user_id", input.correspondingAuthorId);

      if (setCorrespondingError) {
        throw new Error(setCorrespondingError.message);
      }
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to save editorial metadata.",
      slug: null as string | null,
    };
  }

  // This is the only operation that makes the contribution public or sends
  // it into review. Keeping the status predicate in the write closes the
  // autosave/double-submit race: exactly one request can transition a draft.
  const finalTransition = {
    status: submitStatus,
    published_at: publishedAt,
    current_round: 1,
    revision_due_at: null,
    ...(submitStatus === "published" ? {} : { published_version_id: null }),
  };
  const { data: transitionedRows, error: transitionError } = await supabase
    .from("posts")
    .update(finalTransition)
    .eq("id", postId)
    .eq("author_id", user.id)
    .eq("status", "draft")
    .select("id");

  if (transitionError) {
    return { error: transitionError.message, slug: null as string | null };
  }

  if (!transitionedRows || transitionedRows.length === 0) {
    return {
      error: "This draft was already published or changed in another window.",
      slug: null as string | null,
    };
  }

  if (responseParent) {
    responseParentPath = `/post/${responseParent.slug}`;
    await notifyResponseParentAuthor({
      parent: responseParent,
      responderId: user.id,
      responderName: ownerProfile?.full_name ?? "An Indegenius author",
      responsePostId: postId,
      responseSlug: slug,
    });
  }

  if (requiresEditorialWorkflow(effectiveType)) {
    const admin = createAdminClient();
    const { data: existingVersion } = await admin
      .from("post_versions")
      .select("id")
      .eq("post_id", postId)
      .limit(1)
      .maybeSingle();

    if (!existingVersion) {
      try {
        await createVersionSnapshot({
          admin,
          postId,
          round: 1,
          versionKind: "submission",
          submittedBy: user.id,
        });
      } catch (error) {
        return {
          error:
            error instanceof Error ? error.message : "Failed to capture the submission version.",
          slug: null as string | null,
        };
      }
    }
  }

  revalidatePath("/dashboard");
  revalidatePath(`/post/${slug}`);
  if (responseParentPath) {
    revalidatePath(responseParentPath);
  }
  revalidatePath("/");
  revalidatePath("/admin/review");

  if (submitStatus === "published") {
    schedulePublicationDistribution(postId, "Article");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    void fetch(`${appUrl}/api/audio-summary`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.ADMIN_SECRET ?? "",
      },
      body: JSON.stringify({
        postId,
        title: input.title.trim(),
        content: sanitizedContent,
        authorName: ownerProfile?.full_name ?? "An Indegenius author",
        postType: effectiveType,
      }),
    }).catch(() => {
      // Audio summary generation is best-effort.
    });
  }

  await recordActivationEvent({
    supabase,
    event: "post_submitted",
    userId: user.id,
    metadata: {
      postId,
      postType: effectiveType,
      status: submitStatus,
    },
    source: "server_action",
    route: "/write",
  });

  return {
    error: null,
    slug,
    submittedForReview: requiresEditorialWorkflow(effectiveType),
  };
}

// Product decision (Phase 3 DB review): authenticated users may hard-delete
// only drafts (see the DELETE branch of guard_locked_post_write in
// supabase/migrations/20260720000001_lock_accepted_and_removed_posts.sql).
// A pending/pending_revision research paper or policy brief -- already
// submitted into the editorial workflow -- is withdrawn instead: its
// status moves to 'withdrawn' rather than the row being deleted, so its
// post_versions/post_references/post_authors/post_reviews/
// post_editor_decisions all survive intact. Does not resubmit anything;
// resubmission (if ever built) would be a separate action.
//
// Withdrawal must also retire any reviewers still actively assigned --
// otherwise the reviewer queue, /review/[postId], and the review-reminder
// cron (which all already filter on post_reviews.removed_at) would keep
// treating a withdrawn submission as open for review. That has to happen
// in the same transaction as the status change, not as a second
// best-effort step from here, and the author has no RLS grant to touch
// post_reviews at all -- so both are delegated to the
// withdraw_post_submission() Postgres function (SECURITY DEFINER, with its
// own auth.uid()-based ownership check) rather than done as two separate
// calls from this action.
export async function withdrawSubmission(input: { postId: string }) {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const { error } = await supabase.rpc("withdraw_post_submission", {
    target_post_id: input.postId,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin/review");
  revalidatePath("/review");

  return { error: null };
}
