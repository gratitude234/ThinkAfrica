"use server";

import { revalidatePath } from "next/cache";
import slugify from "slugify";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEmailResult, sendUserEmail } from "@/lib/email";
import { sanitizePostHtml } from "@/lib/sanitizePostHtml";
import { buildSlugFromTitle, looksLikeUrl } from "@/lib/postSlug";
import { isLowQualityTitle } from "@/lib/postQuality";
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
import { getPostReferenceQuoted } from "@/lib/postDisplay";
import {
  createVersionSnapshot,
  getSubmissionTrack,
  requiresEditorialWorkflow,
} from "@/lib/reviewWorkflow";
import type { PostReferenceRecord } from "@/lib/types";
import type { PostType } from "@/lib/utils";

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
  const { data: existingRows, error: existingError } = await supabase
    .from("post_references")
    .select("id")
    .eq("post_id", postId);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingIds = new Set((existingRows ?? []).map((row) => row.id));
  const incomingIds = new Set(
    normalized.map((reference) => reference.id).filter(Boolean) as string[]
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
      const { error } = await supabase
        .from("post_references")
        .update(payload)
        .eq("id", reference.id)
        .eq("post_id", postId);

      if (error) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabase.from("post_references").insert(payload);

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

    if (!existingByUserId.has(coAuthor.user_id)) {
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

// /write is the Article composer (Phase 3, see docs/content-model.md):
// every NEW draft/post it creates is a generic Article, no matter what a
// client sends as `postType` -- that field is legacy plumbing (word-count
// targets, reference requirements for an *existing* draft) and must never
// be trusted to decide a NEW row's classification.
const NEW_ARTICLE_TYPE: PostType = (legacyTypeForNewContent("article") ?? "essay") as PostType;

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

  const normalizedTags = input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  const sanitizedContent = sanitizePostHtml(input.content);

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
    .select("author_id, type, status")
    .eq("id", input.postId)
    .single();

  if (!post || post.author_id !== user.id) {
    return { error: "You do not have permission to edit these references." };
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
      error: "Add a real title before publishing — \"Untitled draft\" and similar placeholders aren't allowed.",
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

  // Phase 4A genre picker (PublishDrawer): only ever honored for a brand-
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

  const validationError = validateReferences(effectiveType, input.references ?? []);
  if (validationError) {
    return { error: validationError, slug: null as string | null };
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
  const normalizedTags = input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  const sanitizedContent = sanitizePostHtml(input.content);

  let postId = input.draftId;
  let responseParentPath: string | null = null;

  if (postId) {
    // As in ensureDraft(): `status = "draft"` is part of the WHERE clause,
    // not just a pre-check, so a concurrent publish/autosave race can't
    // slip a write through between the earlier select and this update --
    // if the row is no longer a draft by the time this runs, zero rows are
    // affected instead of silently republishing/overwriting it.
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
        in_response_to: input.inResponseTo ?? null,
        status: submitStatus,
        published_at: publishedAt,
        slug,
        current_round: 1,
        revision_due_at: null,
        published_version_id: submitStatus === "published" ? undefined : null,
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
        in_response_to: input.inResponseTo ?? null,
        status: submitStatus,
        published_at: publishedAt,
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

  if (input.inResponseTo) {
    const { data: parentPost } = await supabase
      .from("posts")
      .select("author_id, slug, title")
      .eq("id", input.inResponseTo)
      .maybeSingle();

    if (parentPost) {
      responseParentPath = `/post/${parentPost.slug}`;

      if (parentPost.author_id !== user.id) {
        const admin = createAdminClient();
        const { error: notificationError } = await admin.from("notifications").insert({
          user_id: parentPost.author_id,
          type: "response_post",
          message: `${ownerProfile?.full_name ?? "An Indegenius author"} wrote a response to your post.`,
          link: `/post/${slug}`,
          actor_id: user.id,
          post_id: postId,
          read: false,
        });
        if (!notificationError) {
          const authorName = ownerProfile?.full_name ?? "An Indegenius author";
          const emailResult = await sendUserEmail({
            recipientId: parentPost.author_id,
            subject: `${authorName} responded to your Indegenius post`,
            preview: `${authorName} wrote a response to your post.`,
            title: "New response to your post",
            intro: `${authorName} wrote a response to ${getPostReferenceQuoted(parentPost)}.`,
            ctaLabel: "Read the response",
            ctaPath: `/post/${slug}`,
            idempotencyKey: `response-post:${postId}:${parentPost.author_id}`,
            preferenceKey: "email_responses",
          });
          logEmailResult(`response_post:${postId}:${parentPost.author_id}`, emailResult);
        }
      }
    }
  }

  try {
    await syncReferences(supabase, postId, input.references ?? []);
    await syncAuthors(
      supabase,
      postId,
      slug,
      user.id,
      input.coAuthors ?? [],
      ownerProfile?.full_name ?? "An Indegenius author"
    );

    if (input.correspondingAuthorId) {
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
