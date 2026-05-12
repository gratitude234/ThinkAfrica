import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EditForm from "./EditForm";
import type {
  PostEditorDecisionRecord,
  PostReferenceRecord,
  PostReviewRecord,
  PostVersionRecord,
  VersionAuthorRecord,
} from "@/lib/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function EditPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?redirectTo=/edit/${slug}`);

  const { data: post } = await supabase
    .from("posts")
    .select(
      "id, title, slug, excerpt, content, type, status, tags, cover_image_url, author_id, current_round, revision_due_at, citation_id, published_version_id"
    )
    .eq("slug", slug)
    .single();

  if (!post) notFound();

  if (post.author_id !== user.id) {
    return (
      <div className="mx-auto max-w-3xl py-20 text-center">
        <p className="mb-2 text-2xl font-bold text-gray-900">Access denied</p>
        <p className="text-gray-500">You don&apos;t have permission to edit this post.</p>
      </div>
    );
  }

  if (post.type === "research") {
    redirect(
      post.status === "published" ? `/post/${post.slug}` : `/submit/research?draft=${post.id}`
    );
  }

  const [
    { data: references },
    { data: reviews },
    { data: decisions },
    { data: versionRows },
    { data: authors },
    { data: versions },
  ] = await Promise.all([
    supabase
      .from("post_references")
      .select("*")
      .eq("post_id", post.id)
      .order("display_order", { ascending: true }),
    supabase
      .from("post_reviews")
      .select(
        "id, post_id, reviewer_id, round, recommendation, notes, submitted_at, assigned_at, reviewer:profiles!post_reviews_reviewer_id_fkey(full_name, username)"
      )
      .eq("post_id", post.id)
      .order("round", { ascending: false })
      .order("assigned_at", { ascending: true }),
    supabase
      .from("post_editor_decisions")
      .select(
        "id, post_id, round, editor_id, decision, notes, created_at, editor:profiles!post_editor_decisions_editor_id_fkey(full_name, username)"
      )
      .eq("post_id", post.id)
      .order("round", { ascending: false }),
    supabase
      .from("post_versions")
      .select(
        "id, post_id, version_number, round, version_kind, content, title, excerpt, author_note, submitted_by, references, authors, created_at"
      )
      .eq("post_id", post.id)
      .order("version_number", { ascending: false }),
    supabase
      .from("post_authors")
      .select(
        "user_id, display_order, corresponding_author, accepted_at, profile:profiles!post_authors_user_id_fkey(username, full_name)"
      )
      .eq("post_id", post.id)
      .order("display_order", { ascending: true }),
    supabase
      .from("post_versions")
      .select("id, version_number, version_kind, round, author_note, created_at")
      .eq("post_id", post.id)
      .order("version_number", { ascending: true }),
  ]);

  const normalizedReviews = ((reviews ?? []) as Array<Record<string, unknown>>).map(
    (item) =>
      ({
        id: item.id,
        post_id: item.post_id,
        reviewer_id: item.reviewer_id,
        round: item.round,
        recommendation: item.recommendation,
        notes: item.notes,
        submitted_at: item.submitted_at,
        assigned_at: item.assigned_at,
        reviewer: Array.isArray(item.reviewer) ? item.reviewer[0] : item.reviewer,
      }) as PostReviewRecord & {
        reviewer: { full_name: string | null; username: string } | null;
      }
  );

  const normalizedDecisions = ((decisions ?? []) as Array<Record<string, unknown>>).map(
    (item) =>
      ({
        id: item.id,
        post_id: item.post_id,
        round: item.round,
        editor_id: item.editor_id,
        decision: item.decision,
        notes: item.notes,
        created_at: item.created_at,
        editor: Array.isArray(item.editor) ? item.editor[0] : item.editor,
      }) as PostEditorDecisionRecord
  );

  const normalizedVersions = ((versionRows ?? []) as Array<Record<string, unknown>>).map(
    (item) =>
      ({
        id: item.id,
        post_id: item.post_id,
        version_number: item.version_number,
        round: item.round,
        version_kind: item.version_kind,
        content: item.content,
        title: item.title,
        excerpt: item.excerpt,
        author_note: item.author_note,
        submitted_by: item.submitted_by,
        references: Array.isArray(item.references) ? item.references : [],
        authors: Array.isArray(item.authors) ? item.authors : [],
        created_at: item.created_at,
      }) as PostVersionRecord
  );

  const submissionVersions = ((versions ?? []) as Array<Record<string, unknown>>).map(
    (item) => ({
      id: item.id as string,
      version_number: item.version_number as number,
      version_kind: item.version_kind as string,
      round: item.round as number,
      author_note: (item.author_note as string | null) ?? null,
      created_at: item.created_at as string,
    })
  );

  const normalizedAuthors = ((authors ?? []) as Array<Record<string, unknown>>)
    .map(
      (item) =>
        ({
          user_id: item.user_id,
          display_order: item.display_order,
          corresponding_author: Boolean(item.corresponding_author),
          accepted_at: item.accepted_at,
          profile: Array.isArray(item.profile) ? item.profile[0] : item.profile,
        }) as VersionAuthorRecord
    )
    .filter((item) => item.profile);

  return (
    <EditForm
      post={{
        id: post.id,
        title: post.title,
        excerpt: post.excerpt ?? null,
        content: post.content ?? null,
        type: post.type,
        status: post.status,
        tags: post.tags as string[] | null,
        cover_image_url:
          (post as { cover_image_url?: string | null }).cover_image_url ?? null,
        current_round: post.current_round ?? 1,
        revision_due_at: post.revision_due_at ?? null,
        citation_id: post.citation_id ?? null,
        published_version_id: post.published_version_id ?? null,
      }}
      initialReferences={(references ?? []) as PostReferenceRecord[]}
      versions={submissionVersions}
      reviewHistory={normalizedReviews}
      decisionHistory={normalizedDecisions}
      versionHistory={normalizedVersions}
      authorHistory={normalizedAuthors}
    />
  );
}
