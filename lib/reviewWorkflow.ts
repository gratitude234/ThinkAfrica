import "server-only";

import { generateCitationId } from "@/lib/citationId";
import { sanitizePostHtml } from "@/lib/sanitizePostHtml";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  EditorDecision,
  PostAuthorRecord,
  PostEditorDecisionRecord,
  PostReferenceRecord,
  PostReviewRecord,
  PostVersionKind,
  PostVersionRecord,
  ReviewRecommendation,
  SubmissionTrack,
  VersionAuthorRecord,
} from "@/lib/types";
import type { PostType } from "@/lib/utils";

type AdminClient = ReturnType<typeof createAdminClient>;

type PostRecord = {
  id: string;
  author_id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  type: PostType;
  status: string;
  current_round: number;
  citation_id: string | null;
  published_version_id: string | null;
  document_path: string | null;
  document_original_name: string | null;
  document_mime_type: string | null;
  document_size_bytes: number | null;
};

export const REVIEWED_POST_TYPES: PostType[] = ["research", "policy_brief"];

export function requiresEditorialWorkflow(type: string | null | undefined): type is PostType {
  return type === "research" || type === "policy_brief";
}

export async function getSubmissionTrack(postType: PostType) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("submission_tracks")
    .select("post_type, requires_review, min_reviewers, allow_revision, description")
    .eq("post_type", postType)
    .single();

  return (data as SubmissionTrack | null) ?? null;
}

async function getPostRecord(admin: AdminClient, postId: string) {
  const { data } = await admin
    .from("posts")
    .select(
      "id, author_id, slug, title, excerpt, content, type, status, current_round, citation_id, published_version_id, document_path, document_original_name, document_mime_type, document_size_bytes"
    )
    .eq("id", postId)
    .single();

  return (data as PostRecord | null) ?? null;
}

export async function getPostReferences(admin: AdminClient, postId: string) {
  const { data } = await admin
    .from("post_references")
    .select("id, post_id, display_order, ref_type, authors, title, year, source, url, doi, raw")
    .eq("post_id", postId)
    .order("display_order", { ascending: true });

  return ((data ?? []) as PostReferenceRecord[]).map((reference) => ({
    ...reference,
    ref_type: reference.ref_type ?? "other",
  }));
}

export async function getPostAuthors(admin: AdminClient, postId: string) {
  const { data } = await admin
    .from("post_authors")
    .select(
      "post_id, user_id, display_order, corresponding_author, invited_at, accepted_at, profile:profiles!post_authors_user_id_fkey(username, full_name)"
    )
    .eq("post_id", postId)
    .order("display_order", { ascending: true });

  return ((data ?? []) as Array<
    PostAuthorRecord & {
      profile?:
        | { username: string; full_name: string | null }
        | Array<{ username: string; full_name: string | null }>;
    }
  >).map((author) => ({
    ...author,
    profile: Array.isArray(author.profile) ? author.profile[0] : author.profile ?? null,
  })) as Array<PostAuthorRecord & { profile: VersionAuthorRecord["profile"] }>;
}

function mapVersionAuthors(
  authors: Array<PostAuthorRecord & { profile: VersionAuthorRecord["profile"] }>
) {
  return authors.map(
    (author): VersionAuthorRecord => ({
      user_id: author.user_id,
      display_order: author.display_order,
      corresponding_author: author.corresponding_author,
      accepted_at: author.accepted_at,
      profile: author.profile ?? null,
    })
  );
}

export async function getRoundReviews(
  admin: AdminClient,
  postId: string,
  round: number
) {
  const { data } = await admin
    .from("post_reviews")
    .select(
      "id, post_id, reviewer_id, round, recommendation, notes, submitted_at, assigned_at, removed_at, reviewer:profiles!post_reviews_reviewer_id_fkey(username, full_name)"
    )
    .eq("post_id", postId)
    .eq("round", round)
    .is("removed_at", null)
    .order("assigned_at", { ascending: true });

  return ((data ?? []) as Array<
    PostReviewRecord & {
      reviewer?:
        | { username: string; full_name: string | null }
        | Array<{ username: string; full_name: string | null }>;
    }
  >).map((review) => ({
    ...review,
    reviewer: Array.isArray(review.reviewer) ? review.reviewer[0] : review.reviewer ?? null,
  }));
}

export async function getEditorDecisions(admin: AdminClient, postId: string) {
  const { data } = await admin
    .from("post_editor_decisions")
    .select(
      "id, post_id, round, editor_id, decision, notes, created_at, editor:profiles!post_editor_decisions_editor_id_fkey(username, full_name)"
    )
    .eq("post_id", postId)
    .order("round", { ascending: false });

  return ((data ?? []) as Array<
    PostEditorDecisionRecord & {
      editor?:
        | { username: string; full_name: string | null }
        | Array<{ username: string; full_name: string | null }>;
    }
  >).map((decision) => ({
    ...decision,
    editor: Array.isArray(decision.editor) ? decision.editor[0] : decision.editor ?? null,
  }));
}

export async function getPostVersions(admin: AdminClient, postId: string) {
  const { data } = await admin
    .from("post_versions")
    .select(
      "id, post_id, version_number, round, version_kind, content, title, excerpt, author_note, submitted_by, references, authors, created_at, document_path, document_original_name, document_mime_type, document_size_bytes"
    )
    .eq("post_id", postId)
    .order("version_number", { ascending: false });

  return ((data ?? []) as Array<
    Omit<PostVersionRecord, "references" | "authors"> & {
      references?: PostReferenceRecord[] | null;
      authors?: VersionAuthorRecord[] | null;
    }
  >).map((version) => ({
    ...version,
    references: Array.isArray(version.references) ? version.references : [],
    authors: Array.isArray(version.authors) ? version.authors : [],
  }));
}

export async function getEditorialReviewState(postId: string) {
  const admin = createAdminClient();
  const post = await getPostRecord(admin, postId);

  if (!post) {
    return { post: null, track: null, reviews: [], readyForDecision: false, errors: ["Post not found."] };
  }

  const track = await getSubmissionTrack(post.type);
  const reviews = track
    ? await getRoundReviews(admin, post.id, post.current_round ?? 1)
    : [];
  const completedReviews = reviews.filter(
    (review) => !!review.recommendation && !!review.submitted_at
  );

  const reviewCounts = completedReviews.reduce(
    (acc, review) => {
      if (review.recommendation) {
        acc[review.recommendation] += 1;
      }
      return acc;
    },
    { accept: 0, revise: 0, reject: 0 } as Record<ReviewRecommendation, number>
  );

  const errors: string[] = [];

  if (requiresEditorialWorkflow(post.type)) {
    if (!track) {
      errors.push("Submission track is missing.");
    } else {
      if (!track.requires_review) {
        errors.push("Submission track does not require review.");
      }

      if (reviews.length < track.min_reviewers) {
        errors.push(`At least ${track.min_reviewers} reviewer assignment(s) are required.`);
      }

      if (completedReviews.length < reviews.length) {
        errors.push("All assigned reviewers must submit a recommendation.");
      }

      if (completedReviews.length < track.min_reviewers) {
        errors.push("Required reviewer recommendations are not complete.");
      }
    }
  }

  return {
    post,
    track,
    reviews,
    completedReviews,
    reviewCounts,
    readyForDecision: errors.length === 0,
    errors,
  };
}

export async function getNextVersionNumber(admin: AdminClient, postId: string) {
  const { data } = await admin
    .from("post_versions")
    .select("version_number")
    .eq("post_id", postId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  return ((data as { version_number?: number } | null)?.version_number ?? 0) + 1;
}

export async function createVersionSnapshot(input: {
  admin?: AdminClient;
  postId: string;
  round: number;
  versionKind: PostVersionKind;
  authorNote?: string | null;
  submittedBy?: string | null;
}) {
  const admin = input.admin ?? createAdminClient();
  const post = await getPostRecord(admin, input.postId);

  if (!post) {
    throw new Error("Post not found.");
  }

  const [references, authors, versionNumber] = await Promise.all([
    getPostReferences(admin, input.postId),
    getPostAuthors(admin, input.postId),
    getNextVersionNumber(admin, input.postId),
  ]);

  const payload = {
    post_id: input.postId,
    version_number: versionNumber,
    round: input.round,
    version_kind: input.versionKind,
    title: post.title,
    excerpt: post.excerpt,
    content: sanitizePostHtml(post.content),
    author_note: input.authorNote?.trim() || null,
    submitted_by: input.submittedBy ?? null,
    references,
    authors: mapVersionAuthors(
      input.versionKind === "publication"
        ? authors.filter((author) => author.accepted_at)
        : authors
    ),
    document_path: post.document_path,
    document_original_name: post.document_original_name,
    document_mime_type: post.document_mime_type,
    document_size_bytes: post.document_size_bytes,
  };

  const { data, error } = await admin
    .from("post_versions")
    .insert(payload)
    .select(
      "id, post_id, version_number, round, version_kind, content, title, excerpt, author_note, submitted_by, references, authors, created_at, document_path, document_original_name, document_mime_type, document_size_bytes"
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as PostVersionRecord;
}

export async function publishReviewedPost(input: {
  postId: string;
  round: number;
  editorId: string;
}) {
  const admin = createAdminClient();
  const post = await getPostRecord(admin, input.postId);

  if (!post) {
    throw new Error("Post not found.");
  }

  const publicationVersion = await createVersionSnapshot({
    admin,
    postId: input.postId,
    round: input.round,
    versionKind: "publication",
    submittedBy: input.editorId,
  });

  const updatePayload: Record<string, string | null> = {
    status: "published",
    published_at: new Date().toISOString(),
    published_version_id: publicationVersion.id,
  };

  if (!post.citation_id) {
    updatePayload.citation_id = await generateCitationId(admin, new Date().getFullYear());
  }

  const { error } = await admin.from("posts").update(updatePayload).eq("id", input.postId);

  if (error) {
    throw new Error(error.message);
  }

  return {
    publicationVersion,
    citationId: (updatePayload.citation_id as string | null) ?? post.citation_id,
  };
}

export async function recordEditorDecision(input: {
  postId: string;
  round: number;
  editorId: string;
  decision: EditorDecision;
  notes?: string | null;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("post_editor_decisions").upsert(
    {
      post_id: input.postId,
      round: input.round,
      editor_id: input.editorId,
      decision: input.decision,
      notes: input.notes?.trim() || null,
    },
    {
      onConflict: "post_id,round",
    }
  );

  if (error) {
    throw new Error(error.message);
  }
}
