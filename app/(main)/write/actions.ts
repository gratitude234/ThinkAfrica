"use server";

import { revalidatePath } from "next/cache";
import slugify from "slugify";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordActivationEvent } from "@/lib/activationServer";
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
      await supabase.from("notifications").insert({
        user_id: coAuthor.user_id,
        type: "co_author_invite",
        message: `${ownerName} has invited you to co-author this post.`,
        link: `/post/${slug}`,
        actor_id: ownerId,
        post_id: postId,
        read: false,
      });
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

export async function ensureDraft(input: {
  draftId: string | null;
  title: string;
  subtitle: string;
  excerpt: string;
  content: string;
  tags: string[];
  postType: PostType;
  coverImageUrl: string;
  inResponseTo?: string | null;
}) {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    return { error: "You must be signed in.", draftId: null as string | null };
  }

  const slugBase = slugify(input.title || "untitled", {
    lower: true,
    strict: true,
  });
  const slug = `${slugBase || "untitled"}-${Date.now().toString(36)}`;
  const normalizedTags = input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);

  if (input.draftId) {
    const { error } = await supabase
      .from("posts")
      .update({
        title: input.title || "Untitled draft",
        excerpt: input.excerpt,
        content: input.content,
        tags: normalizedTags,
        type: input.postType,
        cover_image_url: input.coverImageUrl || null,
        in_response_to: input.inResponseTo ?? null,
      })
      .eq("id", input.draftId)
      .eq("author_id", user.id);

    return { error: error?.message ?? null, draftId: input.draftId };
  }

  const { data, error } = await supabase
    .from("posts")
    .insert({
      author_id: user.id,
      title: input.title || "Untitled draft",
      slug,
      excerpt: input.excerpt,
      content: input.content,
      tags: normalizedTags,
      type: input.postType,
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
    .select("author_id, type")
    .eq("id", input.postId)
    .single();

  if (!post || post.author_id !== user.id) {
    return { error: "You do not have permission to edit these references." };
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
  subtitle: string;
  excerpt: string;
  content: string;
  tags: string[];
  postType: PostType;
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

  const track = await getSubmissionTrack(input.postType);
  if (!track) {
    return { error: "Submission track is not configured for this format.", slug: null as string | null };
  }

  const validationError = validateReferences(input.postType, input.references ?? []);
  if (validationError) {
    return { error: validationError, slug: null as string | null };
  }

  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const now = new Date().toISOString();
  const slug =
    input.customSlug?.trim() ||
    `${slugify(input.title, { lower: true, strict: true })}-${Date.now().toString(36)}`;
  const submitStatus =
    input.postType === "blog" || input.postType === "essay" ? "published" : "pending";
  const publishedAt = submitStatus === "published" ? now : null;
  const normalizedTags = input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);

  let postId = input.draftId;
  let responseParentPath: string | null = null;

  if (postId) {
    const { error } = await supabase
      .from("posts")
      .update({
        title: input.title.trim(),
        excerpt: input.excerpt,
        content: input.content,
        tags: normalizedTags,
        type: input.postType,
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
      .eq("author_id", user.id);

    if (error) {
      return { error: error.message, slug: null as string | null };
    }
  } else {
    const { data, error } = await supabase
      .from("posts")
      .insert({
        author_id: user.id,
        title: input.title.trim(),
        slug,
        content: input.content,
        excerpt: input.excerpt,
        type: input.postType,
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
      .select("author_id, slug")
      .eq("id", input.inResponseTo)
      .maybeSingle();

    if (parentPost) {
      responseParentPath = `/post/${parentPost.slug}`;

      if (parentPost.author_id !== user.id) {
        await supabase.from("notifications").insert({
          user_id: parentPost.author_id,
          type: "response_post",
          message: `${ownerProfile?.full_name ?? "A ThinkAfrika author"} wrote a response to your post.`,
          link: `/post/${slug}`,
          actor_id: user.id,
          post_id: postId,
          read: false,
        });
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
      ownerProfile?.full_name ?? "A ThinkAfrika author"
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

  if (requiresEditorialWorkflow(input.postType)) {
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
        content: input.content,
        authorName: ownerProfile?.full_name ?? "A ThinkAfrika author",
        postType: input.postType,
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
      postType: input.postType,
      status: submitStatus,
    },
    source: "server_action",
    route: "/write",
  });

  return {
    error: null,
    slug,
    submittedForReview: requiresEditorialWorkflow(input.postType),
  };
}
