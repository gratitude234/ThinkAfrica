"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireNotSuspended } from "@/lib/suspension";
import { recordActivationEvent } from "@/lib/activationServer";
import { buildSlugFromTitle } from "@/lib/postSlug";
import { isLightweightPost } from "@/lib/postDisplay";
import {
  deriveShortPostExcerpt,
  isShortPostBodyValid,
  normalizeShortPostText,
  SHORT_POST_MAX_CHARACTERS,
} from "@/lib/shortPostContent";
import { buildShortPostHtml } from "@/lib/shortPostHtml";
import { notifyResponseParentAuthor, validateResponseParent } from "@/lib/responsePost";
import { ensureDraft } from "@/app/(write)/write/actions";
import { schedulePublicationDistribution } from "@/lib/publicationDistribution";
import {
  getTopicValuesValidationError,
  MAX_SHORT_POST_TOPICS,
  normalizeAndDedupeTopicValues,
} from "@/lib/tags";

// CoverImageUploader's default bucket/path convention (components/ui/CoverImageUploader.tsx).
const POST_IMAGE_BUCKET = "post-images";

/**
 * The image URL comes from the client, so don't just check that it's
 * *some* https URL -- require it to actually be a public object in this
 * project's Supabase Storage, in the expected bucket, under this
 * specific user's own upload path. That rules out an attacker pointing
 * cover_image_url at an arbitrary external host or another user's path.
 */
function isSafePostImageUrl(url: string, userId: string): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return false;

  let parsed: URL;
  let expected: URL;
  try {
    parsed = new URL(url);
    expected = new URL(supabaseUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:" || parsed.host !== expected.host) {
    return false;
  }

  const expectedPrefix = `/storage/v1/object/public/${POST_IMAGE_BUCKET}/covers/${userId}/`;
  return parsed.pathname.startsWith(expectedPrefix);
}

function slugSeedFromBody(body: string, wordCount = 6): string {
  return body.split(/\s+/).filter(Boolean).slice(0, wordCount).join(" ");
}

/** Millisecond timestamp plus a short random component, so two posts published in the same millisecond still get distinct slugs. */
function uniqueSlugSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createPost(input: {
  body: string;
  imageUrl?: string | null;
  inResponseTo?: string | null;
  promptId?: string | null;
  topics: string[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in.", slug: null as string | null };
  }

  const suspensionError = await requireNotSuspended(user.id);
  if (suspensionError) {
    return { error: suspensionError, slug: null as string | null };
  }

  // Never trust the client's own character count -- re-validate the
  // normalized, user-visible text server-side.
  if (!isShortPostBodyValid(input.body)) {
    const normalized = normalizeShortPostText(input.body);
    return {
      error:
        normalized.length === 0
          ? "Write something before publishing."
          : `Posts can be at most ${SHORT_POST_MAX_CHARACTERS} characters (currently ${normalized.length}).`,
      slug: null as string | null,
    };
  }

  if (input.topics.length > MAX_SHORT_POST_TOPICS) {
    return {
      error: `Posts can have at most ${MAX_SHORT_POST_TOPICS} topics.`,
      slug: null as string | null,
    };
  }
  const topicError = getTopicValuesValidationError(input.topics);
  if (topicError) {
    return { error: topicError, slug: null as string | null };
  }
  const topics = normalizeAndDedupeTopicValues(
    input.topics,
    MAX_SHORT_POST_TOPICS
  );

  // A "Quick response" Post never trusts the client's claimed parent --
  // the composer's own display of "Responding to X" is resolved
  // server-side by the page, but the actual publish re-validates
  // independently, so a modified request (or a parent that became
  // unavailable between opening the composer and publishing) can't
  // silently attach to, or spoof, a relationship. Mirrors the same
  // validation the Article ("Long-form response") flow uses --
  // see lib/responsePost.ts.
  let responseParent: Awaited<ReturnType<typeof validateResponseParent>>["parent"] = null;
  if (input.inResponseTo) {
    const parentValidation = await validateResponseParent(supabase, input.inResponseTo, null);
    if (parentValidation.error) {
      return { error: parentValidation.error, slug: null as string | null };
    }
    responseParent = parentValidation.parent;
  }

  let campusPromptId: string | null = null;
  if (input.promptId) {
    const [
      { data: cohortMembership },
      { data: ambassadorAssignment },
      { data: prompt },
    ] = await Promise.all([
      supabase
        .from("campus_cohort_memberships")
        .select("cohort_id")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("campus_ambassadors")
        .select("campus_cohort_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("campus_editorial_prompts")
        .select(
          "id, cohort_id, starts_at, ends_at, active, campus_cohorts!inner(status)"
        )
        .eq("id", input.promptId)
        .maybeSingle(),
    ]);
    const cohort = prompt
      ? Array.isArray(prompt.campus_cohorts)
        ? prompt.campus_cohorts[0] ?? null
        : prompt.campus_cohorts
      : null;
    const now = Date.now();
    const startsAt = prompt?.starts_at ? new Date(prompt.starts_at).getTime() : NaN;
    const endsAt = prompt?.ends_at ? new Date(prompt.ends_at).getTime() : null;
    const validPrompt = Boolean(
      prompt?.active &&
        cohort &&
        ["selected", "active"].includes(cohort.status) &&
        (cohortMembership?.cohort_id === prompt.cohort_id ||
          ambassadorAssignment?.campus_cohort_id === prompt.cohort_id) &&
        Number.isFinite(startsAt) &&
        startsAt <= now &&
        (endsAt === null || endsAt > now)
    );
    if (!validPrompt) {
      return { error: "This campus prompt is no longer available to your cohort.", slug: null as string | null };
    }
    campusPromptId = prompt?.id ?? null;
  }

  const normalizedBody = normalizeShortPostText(input.body);
  const sanitizedContent = buildShortPostHtml(input.body);
  const excerpt = deriveShortPostExcerpt(normalizedBody);
  const imageUrl =
    input.imageUrl && isSafePostImageUrl(input.imageUrl, user.id) ? input.imageUrl : null;
  const slug = buildSlugFromTitle(slugSeedFromBody(normalizedBody), "post", uniqueSlugSuffix());
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("posts")
    .insert({
      author_id: user.id,
      title: null,
      slug,
      content: sanitizedContent,
      excerpt,
      type: "blog",
      content_kind: "post",
      article_format: null,
      status: "published",
      published_at: now,
      current_round: 1,
      cover_image_url: imageUrl,
      tags: topics,
      in_response_to: responseParent?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to publish.", slug: null as string | null };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/post/${slug}`);
  revalidatePath("/");
  if (campusPromptId) revalidatePath("/campus");

  schedulePublicationDistribution(data.id, "Short Post");

  if (responseParent) {
    revalidatePath(`/post/${responseParent.slug}`);

    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    await notifyResponseParentAuthor({
      parent: responseParent,
      responderId: user.id,
      responderName: ownerProfile?.full_name ?? "An Indegenius author",
      responsePostId: data.id,
      responseSlug: slug,
    });
  }

  if (campusPromptId) {
    const { error: promptLinkError } = await supabase
      .from("campus_prompt_submissions")
      .insert({ prompt_id: campusPromptId, post_id: data.id, author_id: user.id });
    if (promptLinkError) {
      console.warn("[campus] published post could not be linked to prompt", promptLinkError.message);
    } else {
      await recordActivationEvent({
        supabase,
        event: "campus_prompt_published",
        userId: user.id,
        metadata: { postId: data.id, promptId: campusPromptId },
        source: "server_action",
        route: "/create/post",
      });
    }
  }

  await recordActivationEvent({
    supabase,
    event: "post_submitted",
    userId: user.id,
    metadata: {
      postId: data.id,
      postType: "blog",
      status: "published",
      promptId: campusPromptId,
    },
    source: "server_action",
    route: "/create/post",
  });
  if (topics.length === 0) {
    await recordActivationEvent({
      supabase,
      event: "topic_selection_skipped",
      userId: user.id,
      metadata: { postId: data.id, contentKind: "post" },
      source: "server_action",
      route: "/create/post",
    });
  }

  return { error: null, slug };
}

/**
 * Lightweight-Post-only edit path. Verifies ownership, re-validates the
 * body server-side the same way createPost() does, and only ever touches
 * content/excerpt/cover_image_url -- it never changes slug, status,
 * published_at, type, or content_kind, so the permalink and publication
 * state stay exactly as they were.
 */
export async function updatePost(input: {
  postId: string;
  body: string;
  imageUrl?: string | null;
  topics: string[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in.", slug: null as string | null };
  }

  const suspensionError = await requireNotSuspended(user.id);
  if (suspensionError) {
    return { error: suspensionError, slug: null as string | null };
  }

  const { data: existing } = await supabase
    .from("posts")
    .select("id, slug, author_id, status, title, content_kind, article_format, type")
    .eq("id", input.postId)
    .maybeSingle();

  if (!existing || existing.author_id !== user.id) {
    return { error: "You do not have permission to edit this post.", slug: null as string | null };
  }

  if (existing.status === "removed") {
    return { error: "This post was removed and can no longer be edited.", slug: null as string | null };
  }

  if (!isLightweightPost(existing)) {
    return { error: "This post can't be edited here.", slug: null as string | null };
  }

  if (!isShortPostBodyValid(input.body)) {
    const normalized = normalizeShortPostText(input.body);
    return {
      error:
        normalized.length === 0
          ? "Write something before saving."
          : `Posts can be at most ${SHORT_POST_MAX_CHARACTERS} characters (currently ${normalized.length}).`,
      slug: null as string | null,
    };
  }

  if (input.topics.length > MAX_SHORT_POST_TOPICS) {
    return {
      error: `Posts can have at most ${MAX_SHORT_POST_TOPICS} topics.`,
      slug: null as string | null,
    };
  }
  const topicError = getTopicValuesValidationError(input.topics);
  if (topicError) {
    return { error: topicError, slug: null as string | null };
  }
  const topics = normalizeAndDedupeTopicValues(
    input.topics,
    MAX_SHORT_POST_TOPICS
  );

  const normalizedBody = normalizeShortPostText(input.body);
  const sanitizedContent = buildShortPostHtml(input.body);
  const excerpt = deriveShortPostExcerpt(normalizedBody);
  const imageUrl =
    input.imageUrl && isSafePostImageUrl(input.imageUrl, user.id) ? input.imageUrl : null;

  const { error } = await supabase
    .from("posts")
    .update({
      content: sanitizedContent,
      excerpt,
      cover_image_url: imageUrl,
      tags: topics,
    })
    .eq("id", input.postId)
    .eq("author_id", user.id);

  if (error) {
    return { error: error.message, slug: null as string | null };
  }

  revalidatePath(`/post/${existing.slug}`);
  revalidatePath("/dashboard");

  return { error: null, slug: existing.slug as string };
}

/**
 * A working title for a promoted draft, taken from the writer's own opening
 * words.
 *
 * An Article row cannot have a blank title -- see
 * posts_title_required_unless_post_check in the Phase 2 migration, and the
 * matching guard in DraftManager.saveDraft() that refuses to autosave an
 * untitled Article rather than invent one. This is not that case: a Post has
 * no title field at all, so promotion is the exact moment a title has to come
 * into existence, and the honest source for it is the text already written.
 * The composer opens with it in an editable title field, so it reads as a
 * starting point rather than a decision made for the user.
 */
const WORKING_TITLE_MAX_LENGTH = 80;

function deriveWorkingTitle(normalizedBody: string): string {
  const firstSentence = normalizedBody.split(/(?<=[.!?])\s|\n/)[0] ?? normalizedBody;
  // Sentence-ending punctuation is stripped before any truncation, so a title
  // shortened below does not have its own ellipsis eaten by this step.
  const condensed = firstSentence
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/, "");

  if (condensed.length > WORKING_TITLE_MAX_LENGTH) {
    return `${condensed
      .slice(0, WORKING_TITLE_MAX_LENGTH)
      .replace(/\s+\S*$/, "")}...`;
  }

  // normalizedBody is already known non-empty, so this only falls back when
  // the opening "sentence" was punctuation the trim above stripped to nothing.
  return condensed || normalizedBody.slice(0, WORKING_TITLE_MAX_LENGTH);
}

/**
 * Carries an in-progress Post across to the Article composer.
 *
 * The two composers keep separate drafts (this one in localStorage under
 * `indegenius:post-draft:<userId>`, the Article composer in DraftManager),
 * so "Write an article" used to drop whatever had already been typed. That
 * punished the exact moment someone decided their idea deserved more room.
 *
 * Promoting instead persists the text as a real Article draft server-side and
 * hands back its id, so the composer can open it with ?draft=<id> and the work
 * survives a device switch, not just a tab reload.
 *
 * Deliberately permissive about length: this is a draft, not a publish, and
 * the whole point is that the body is about to grow past Post limits. Only an
 * empty body is rejected.
 */
export async function promoteToArticle(input: {
  body: string;
  imageUrl?: string | null;
  topics: string[];
  inResponseTo?: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in.", draftId: null as string | null };
  }

  const normalized = normalizeShortPostText(input.body);
  if (normalized.length === 0) {
    return { error: "Write something first.", draftId: null as string | null };
  }

  // Same storage-ownership check publishing uses -- a client-supplied URL
  // never reaches the row unmodified. An unrecognized one is dropped rather
  // than raised, since losing a cover image must not block the handoff.
  const coverImageUrl =
    input.imageUrl && isSafePostImageUrl(input.imageUrl, user.id) ? input.imageUrl : "";

  // ensureDraft() owns Article draft creation (auth, suspension, topic
  // validation, sanitization, and the Phase 4A content_kind/type dual-write),
  // so this action only converts the Post-shaped payload into its input.
  return ensureDraft({
    draftId: null,
    title: deriveWorkingTitle(normalized),
    // Left blank on purpose. The feed summary is its own editorial act and
    // the publish drawer asks for it directly; auto-filling it from the body
    // would also tick the draft checklist's "useful summary" box with text
    // the writer never chose.
    excerpt: "",
    content: buildShortPostHtml(normalized),
    tags: input.topics,
    postType: "essay",
    coverImageUrl,
    inResponseTo: input.inResponseTo ?? null,
  });
}
