import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UniversalComposer from "@/app/(write)/write/UniversalComposer";
import { isWrittenExcerpt, type ContributionSnapshot } from "@/lib/contribution";
import type { PostReferenceRecord } from "@/lib/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-3xl py-20 text-center">
      <p className="mb-2 text-2xl font-bold text-gray-900">{title}</p>
      <p className="text-gray-500">{body}</p>
    </div>
  );
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
      "id, title, slug, excerpt, content, content_kind, status, tags, cover_image_url, author_id"
    )
    .eq("slug", slug)
    .single();

  if (!post) notFound();

  if (post.author_id !== user.id) {
    return (
      <Notice
        title="Access denied"
        body="You don't have permission to edit this post."
      />
    );
  }

  if (post.status === "removed") {
    return (
      <Notice
        title="This post was removed"
        body="Removed content can no longer be edited."
      />
    );
  }

  if (post.status === "draft") {
    redirect(`/write?draft=${encodeURIComponent(post.id)}`);
  }

  if (post.status === "published") {
    const [{ data: referenceRows }, { data: editDraft }, { data: profile }] = await Promise.all([
      supabase.from("post_references").select("*").eq("post_id", post.id).order("display_order"),
      supabase.from("post_edit_drafts").select("*").eq("post_id", post.id).eq("author_id", user.id).maybeSingle(),
      supabase.from("profiles").select("full_name, username, university, avatar_url").eq("id", user.id).maybeSingle(),
    ]);
    const draftReferences = Array.isArray(editDraft?.reference_snapshot)
      ? (editDraft.reference_snapshot as PostReferenceRecord[])
      : ((referenceRows ?? []) as PostReferenceRecord[]);
    const excerpt = editDraft?.excerpt ?? post.excerpt ?? "";
    const content = editDraft?.content ?? post.content ?? "";
    const initialSnapshot: ContributionSnapshot = {
      title: editDraft?.title ?? post.title ?? "",
      // A generated summary is dropped here, so saving the edit derives a new
      // one from the body as it now reads. A written one is kept.
      excerpt: isWrittenExcerpt(excerpt, content) ? excerpt : "",
      content,
      tags: (editDraft?.tags as string[] | null) ?? (post.tags as string[] | null) ?? [],
      coverImageUrl: editDraft?.cover_image_url ?? post.cover_image_url ?? "",
      references: draftReferences,
    };

    return (
      <UniversalComposer
        mode="published-edit"
        userId={user.id}
        profile={profile}
        initialSnapshot={initialSnapshot}
        editDraftId={editDraft?.id ?? null}
        publishedPostId={post.id}
        publishedSlug={post.slug}
        draftUpdatedAt={(editDraft?.updated_at as string | null | undefined) ?? null}
        returnTo={`/post/${post.slug}`}
      />
    );
  }

  // pending, pending_revision, rejected and withdrawn are statuses only the
  // retired review workflow produced. Posts and Articles are drafts or
  // published, and nothing else is edited here.
  return (
    <Notice
      title="This post can't be edited"
      body="It was part of a review process that has since been retired."
    />
  );
}
