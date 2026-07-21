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

export async function createPost(input: { body: string; imageUrl?: string | null }) {
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
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to publish.", slug: null as string | null };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/post/${slug}`);
  revalidatePath("/");

  await recordActivationEvent({
    supabase,
    event: "post_submitted",
    userId: user.id,
    metadata: { postId: data.id, postType: "blog", status: "published" },
    source: "server_action",
    route: "/create/post",
  });

  return { error: null, slug };
}

/**
 * Lightweight-Post-only edit path. Verifies ownership, re-validates the
 * body server-side the same way createPost() does, and only ever touches
 * content/excerpt/cover_image_url -- it never changes slug, status,
 * published_at, type, or content_kind, so the permalink and publication
 * state stay exactly as they were.
 */
export async function updatePost(input: { postId: string; body: string; imageUrl?: string | null }) {
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
