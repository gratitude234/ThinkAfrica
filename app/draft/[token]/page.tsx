import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PostReferenceRecord } from "@/lib/types";
import type { ContributionSnapshot } from "@/lib/contribution";
import { contributionText } from "@/lib/contribution";
import ArticlePreview from "@/app/(write)/write/ArticlePreview";

/**
 * The read side of a draft share link. Deliberately outside every route group,
 * so it carries no app chrome and no navigation into the rest of the product:
 * the person opening this is here to read one unfinished piece, usually
 * without an account.
 *
 * Reads go through the service role because a draft is invisible to RLS for
 * everyone but its author. Every condition that makes the link valid is
 * therefore enforced here, in one place: the share must exist, must not be
 * revoked, and the post must still be a draft.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function SharedDraftPage({ params }: PageProps) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: share } = await admin
    .from("post_draft_shares")
    .select("post_id, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (!share || share.revoked_at) notFound();

  const { data: post } = await admin
    .from("posts")
    .select("id, title, excerpt, content, tags, cover_image_url, status, author_id, updated_at")
    .eq("id", share.post_id)
    .maybeSingle();

  // Publishing gives the piece a real address, so the private link retires.
  if (!post || post.status !== "draft") notFound();

  const [{ data: author }, { data: referenceRows }] = await Promise.all([
    admin.from("profiles").select("full_name, username").eq("id", post.author_id).maybeSingle(),
    admin
      .from("post_references")
      .select("*")
      .eq("post_id", post.id)
      .order("display_order"),
  ]);

  const snapshot: ContributionSnapshot = {
    title: post.title ?? "",
    content: post.content ?? "",
    excerpt: post.excerpt ?? "",
    tags: (post.tags as string[] | null) ?? [],
    coverImageUrl: post.cover_image_url ?? "",
    references: (referenceRows ?? []) as PostReferenceRecord[],
    collaborators: [],
    inResponseToId: null,
    promptId: null,
  };

  const bodyText = contributionText(snapshot.content);
  const wordCount = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;
  const authorName = author?.full_name || author?.username || "An Indegenius author";

  return (
    <div className="min-h-dvh bg-surface text-ink">
      <div className="border-b border-divider bg-gold-tint">
        <p className="mx-auto max-w-[680px] px-5 py-3 text-meta text-gold-ink sm:px-8">
          Shared draft. This is unpublished work in progress, shared privately by {authorName}.
        </p>
      </div>
      <ArticlePreview snapshot={snapshot} authorName={authorName} wordCount={wordCount} />
    </div>
  );
}
