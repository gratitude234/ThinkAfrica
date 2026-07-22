import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logEmailResult, sendUserEmail } from "@/lib/email";
import { getPostReferenceQuoted } from "@/lib/postDisplay";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface ResponseParentPost {
  id: string;
  author_id: string;
  slug: string;
  title: string | null;
  content_kind?: string | null;
  article_format?: string | null;
  type?: string | null;
}

export interface ResponseParentResult {
  parent: ResponseParentPost | null;
  error: string | null;
}

/**
 * Single server-side source of truth for whether a response's claimed
 * parent post is eligible right now -- shared by the lightweight Post
 * ("Quick response") and Article ("Long-form response") creation paths
 * so the rule can't drift between them. Never trusts a client-supplied
 * title, author, content kind, or status: always re-reads the parent row
 * itself and re-derives everything from that read.
 *
 * Eligibility mirrors the pre-existing rule already enforced ad hoc at
 * every read site that renders response context (post/[slug]/page.tsx's
 * ParentPostLink and responses-to-this-post query, /write's own
 * parent-loading effect): the parent must currently be `published`.
 * There is no cycle-prevention system in the product beyond this direct,
 * one-hop guard (a post cannot claim itself as its own parent) -- see
 * docs/content-model.md and this pass's audit notes. A longer response
 * chain (A responds to B responds to C responds to A) is not detected;
 * introducing that is a deliberately separate, out-of-scope decision.
 */
export async function validateResponseParent(
  supabase: SupabaseServerClient,
  parentId: string,
  selfId?: string | null
): Promise<ResponseParentResult> {
  if (selfId && parentId === selfId) {
    return { parent: null, error: "A post can't be a response to itself." };
  }

  const { data: parent } = await supabase
    .from("posts")
    .select("id, author_id, slug, title, content_kind, article_format, type")
    .eq("id", parentId)
    .eq("status", "published")
    .maybeSingle();

  if (!parent) {
    return { parent: null, error: "That post is no longer available to respond to." };
  }

  return { parent: parent as ResponseParentPost, error: null };
}

/**
 * Notifies + emails a response's parent-post author. Mirrors the single
 * `response_post` notification path that previously lived inline in
 * write/actions.ts's publishPost(), factored out so a Quick response
 * (create/post/actions.ts) and a Long-form response (write/actions.ts)
 * share one implementation instead of two copies that can drift apart.
 * No-ops for a self-response. Callers must invoke this exactly once, at
 * first publish, to avoid duplicate notifications/emails.
 */
export async function notifyResponseParentAuthor({
  parent,
  responderId,
  responderName,
  responsePostId,
  responseSlug,
}: {
  parent: ResponseParentPost;
  responderId: string;
  responderName: string;
  responsePostId: string;
  responseSlug: string;
}): Promise<void> {
  if (parent.author_id === responderId) return;

  const admin = createAdminClient();
  const { error: notificationError } = await admin.from("notifications").insert({
    user_id: parent.author_id,
    type: "response_post",
    message: `${responderName} wrote a response to your post.`,
    link: `/post/${responseSlug}`,
    actor_id: responderId,
    post_id: responsePostId,
    read: false,
  });

  if (notificationError) return;

  const emailResult = await sendUserEmail({
    recipientId: parent.author_id,
    subject: `${responderName} responded to your Indegenius post`,
    preview: `${responderName} wrote a response to your post.`,
    title: "New response to your post",
    intro: `${responderName} wrote a response to ${getPostReferenceQuoted(parent)}.`,
    ctaLabel: "Read the response",
    ctaPath: `/post/${responseSlug}`,
    idempotencyKey: `response-post:${responsePostId}:${parent.author_id}`,
    preferenceKey: "email_responses",
  });
  logEmailResult(`response_post:${responsePostId}:${parent.author_id}`, emailResult);
}
