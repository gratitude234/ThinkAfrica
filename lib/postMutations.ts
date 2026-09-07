import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PostStatus } from "@/lib/types";
import {
  AUTHOR_EDITABLE_POST_COLUMNS,
  canWriteToPost,
  checkContentEdit,
  checkDelete,
  checkTransition,
  LIVE_POLICY,
  partitionPostPatch,
  type PostActor,
  type PostPolicyOptions,
  type PostStateSnapshot,
  type PostWriteRefusal,
} from "@/lib/postPolicy";

/**
 * The one place an authenticated write reaches `posts`.
 *
 * Every operation runs the same five steps, in this order:
 *
 *     1. viewer identity, resolved by the server, passed in as an argument
 *     2. load the post as it actually is
 *     3. lib/postPolicy.ts decides
 *     4. the statement, carrying identity and state predicates of its own
 *     5. verify it affected exactly one row
 *
 * Step 5 is not belt-and-braces. It is the only signal left once RLS and
 * `guard_locked_post_write()` are both inert, which is what they are on Neon.
 * An `UPDATE ... WHERE id = $1 AND author_id = $2 AND status = $3` whose
 * result nobody inspects reports success having done nothing, and that is
 * indistinguishable from success having done the right thing.
 *
 * Step 4 overlaps step 3 on purpose. The policy already decided; the
 * predicates catch the case the policy cannot see, which is the row changing
 * between the load and the write. A submission accepted by an editor in that
 * window must not then accept an author's edit that was authorized against
 * the pre-acceptance state.
 *
 * ## What this deliberately does not expose
 *
 * There is no general `updatePost(patch)`. Status moves through named
 * operations, one per legitimate transition, because a general patch API is
 * how a content edit and a publication become the same statement, and that
 * single statement is what the trigger's classification freeze exists to
 * catch. An author changing their draft and an author publishing it are
 * different acts with different authorization, and they look different here.
 *
 * ## Provider
 *
 * Takes a `SupabaseClient` today. The policy above is the part that must not
 * be rewritten when this moves to `lib/db`; everything Supabase-shaped is in
 * the four small functions at the bottom of this file, and each one is a
 * single statement with its predicates already explicit, which is the form a
 * direct-SQL port takes unchanged.
 */

// ── Results ──────────────────────────────────────────────────────────

export type PostMutationFailure =
  | { kind: "not_found" }
  | { kind: "refused"; refusal: PostWriteRefusal; reason: string }
  | { kind: "conflict" }
  | { kind: "query_failed"; message: string };

export type PostMutationResult<T = { id: string }> =
  | { ok: true; data: T }
  | { ok: false; failure: PostMutationFailure };

/**
 * What the reader is told, for every refusal.
 *
 * Deliberately one sentence for every case that is about permission or
 * existence. "This post is locked", "this post is not yours" and "there is no
 * such post" are three different facts, and distinguishing them for someone
 * who is not the owner turns a mutation endpoint into a lookup oracle: try an
 * id, learn whether it exists and what state it is in. The server log keeps
 * the real reason.
 *
 * The exceptions are the refusals the owner is *supposed* to understand,
 * because they describe the product rather than the permission system, and a
 * writer who cannot delete a submitted paper needs to know to withdraw it.
 */
const OWNER_VISIBLE_REFUSALS: ReadonlySet<PostWriteRefusal> = new Set([
  "delete_non_draft",
  "locked_publication",
  "removed_post",
  "withdrawn_post",
  "self_publish_reviewed",
  "withdraw_not_eligible",
]);

export const GENERIC_REFUSAL =
  "That post could not be found, or you do not have access to it.";

export function postMutationMessage(failure: PostMutationFailure): string {
  switch (failure.kind) {
    case "refused":
      return OWNER_VISIBLE_REFUSALS.has(failure.refusal)
        ? failure.reason
        : GENERIC_REFUSAL;
    case "conflict":
      return "This post changed while you were working on it. Reload and try again.";
    case "not_found":
      return GENERIC_REFUSAL;
    case "query_failed":
      return "Something went wrong saving that. Try again.";
  }
}

function refused(decision: {
  refusal: PostWriteRefusal;
  reason: string;
}): PostMutationResult<never> {
  return {
    ok: false,
    failure: { kind: "refused", refusal: decision.refusal, reason: decision.reason },
  };
}

// ── The snapshot every operation authorizes against ──────────────────

const SNAPSHOT_COLUMNS =
  "id, author_id, status, type, content_kind, article_format, citation_id, published_version_id";

export async function loadPostState(
  supabase: SupabaseClient,
  postId: string
): Promise<PostStateSnapshot | null> {
  const { data, error } = await supabase
    .from("posts")
    .select(SNAPSHOT_COLUMNS)
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    // A failed lookup is not an absent post. Collapsing the two is what tells
    // an author their work does not exist while the database is unreachable.
    throw new Error(`post lookup failed: ${error.message.slice(0, 200)}`);
  }

  return (data as PostStateSnapshot | null) ?? null;
}

// ── Operations ───────────────────────────────────────────────────────

export interface MutationContext {
  supabase: SupabaseClient;
  actor: PostActor;
  options?: PostPolicyOptions;
}

/**
 * An author editing their own content. No status change, ever.
 */
export async function updatePostContent(
  context: MutationContext,
  postId: string,
  patch: Record<string, unknown>
): Promise<PostMutationResult> {
  const { supabase, actor, options = LIVE_POLICY } = context;

  const post = await loadPostState(supabase, postId);
  if (!post) return { ok: false, failure: { kind: "not_found" } };

  const decision = checkContentEdit(actor, post, patch, options);
  if (!decision.allowed) return refused(decision);

  const { allowed } = partitionPostPatch(patch);
  if (Object.keys(allowed).length === 0) {
    // Nothing to do is success. A caller that sent only unchanged fields has
    // not failed, and reporting a conflict here would make autosave noisy.
    return { ok: true, data: { id: post.id } };
  }

  return writeOnePost(supabase, {
    postId,
    patch: allowed,
    // The state this was authorized against. If any of it moved, the write
    // matches nothing and comes back as a conflict rather than as a silent
    // no-op.
    expect: { author_id: post.author_id, status: post.status },
    actor,
  });
}

/** Draft to published, for content whose publication is the author's to make. */
export async function publishOwnDraft(
  context: MutationContext,
  postId: string,
  extra: { published_at?: string } = {}
): Promise<PostMutationResult> {
  return transitionPost(context, postId, "published", {
    published_at: extra.published_at ?? new Date().toISOString(),
  });
}

/** Draft to pending: the author submitting work for editorial review. */
export async function submitPostForReview(
  context: MutationContext,
  postId: string
): Promise<PostMutationResult> {
  return transitionPost(context, postId, "pending", {});
}

/** pending_revision to pending: the author resubmitting after revision. */
export async function resubmitRevision(
  context: MutationContext,
  postId: string,
  extra: { current_round?: number } = {}
): Promise<PostMutationResult> {
  return transitionPost(context, postId, "pending", {
    revision_due_at: null,
    ...(extra.current_round !== undefined
      ? { current_round: extra.current_round }
      : {}),
  });
}

/** The author withdrawing a submission from review. */
export async function withdrawSubmission(
  context: MutationContext,
  postId: string
): Promise<PostMutationResult> {
  return transitionPost(context, postId, "withdrawn", {});
}

/**
 * An editorial decision. Editors and admins only.
 *
 * Accepting is deliberately NOT here: it writes `citation_id` and
 * `published_version_id` and creates a version snapshot, which is
 * `publishReviewedPost()` in lib/reviewWorkflow.ts, and splitting that across
 * two modules would put half a transaction in each.
 */
export async function editorialDecision(
  context: MutationContext,
  postId: string,
  decision: "request_revision" | "reject",
  extra: { revision_due_at?: string | null } = {}
): Promise<PostMutationResult> {
  const nextStatus: PostStatus =
    decision === "request_revision" ? "pending_revision" : "rejected";
  return transitionPost(context, postId, nextStatus, {
    ...(decision === "request_revision"
      ? { revision_due_at: extra.revision_due_at ?? null }
      : {}),
  });
}

/** Moderation. Admins only, and never reversible through this module. */
export async function removePost(
  context: MutationContext,
  postId: string
): Promise<PostMutationResult> {
  return transitionPost(context, postId, "removed", {});
}

/** Hard delete. Drafts only. */
export async function deleteDraftPost(
  context: MutationContext,
  postId: string
): Promise<PostMutationResult> {
  const { supabase, actor, options = LIVE_POLICY } = context;

  const post = await loadPostState(supabase, postId);
  if (!post) return { ok: false, failure: { kind: "not_found" } };

  const decision = checkDelete(actor, post, options);
  if (!decision.allowed) return refused(decision);

  let query = supabase.from("posts").delete().eq("id", postId);
  if (actor.kind === "author") {
    // The predicates the policy already checked, restated so a row that moved
    // between the load and the delete is missed rather than deleted.
    query = query.eq("author_id", actor.userId).eq("status", "draft");
  }

  const { data, error } = await query.select("id");

  if (error) {
    console.error(`[posts] delete failed for ${postId}`, error.message);
    return { ok: false, failure: { kind: "query_failed", message: error.message } };
  }
  if (!data || data.length === 0) {
    return { ok: false, failure: { kind: "conflict" } };
  }

  return { ok: true, data: { id: postId } };
}

/**
 * The shared transition path.
 *
 * Every status change goes through here, so the policy call, the predicates
 * and the row count exist once rather than once per operation.
 */
export async function transitionPost(
  context: MutationContext,
  postId: string,
  nextStatus: PostStatus,
  extra: Record<string, unknown> = {}
): Promise<PostMutationResult> {
  const { supabase, actor, options = LIVE_POLICY } = context;

  const post = await loadPostState(supabase, postId);
  if (!post) return { ok: false, failure: { kind: "not_found" } };

  const decision = checkTransition({ actor, post, nextStatus }, options);
  if (!decision.allowed) return refused(decision);

  return writeOnePost(supabase, {
    postId,
    patch: { status: nextStatus, ...extra },
    expect: { author_id: post.author_id, status: post.status },
    actor,
  });
}

// ── The statement ────────────────────────────────────────────────────

/**
 * One UPDATE, with its predicates, and a row count that is checked.
 *
 * `expect` is the state the policy authorized against. Restating it in the
 * WHERE clause is what makes this safe against the row moving underneath:
 * the write either lands on the row it was authorized for, or it lands on
 * nothing and says so.
 *
 * `author_id` is included for an author actor only. An editor legitimately
 * writes rows they do not own, and a predicate that excluded them would turn
 * every editorial decision into a conflict.
 */
async function writeOnePost(
  supabase: SupabaseClient,
  input: {
    postId: string;
    patch: Record<string, unknown>;
    expect: { author_id: string; status: PostStatus };
    actor: PostActor;
  }
): Promise<PostMutationResult> {
  let query = supabase
    .from("posts")
    .update(input.patch)
    .eq("id", input.postId)
    .eq("status", input.expect.status);

  if (input.actor.kind === "author") {
    query = query.eq("author_id", input.actor.userId);
  }

  const { data, error } = await query.select("id");

  if (error) {
    console.error(`[posts] write failed for ${input.postId}`, error.message);
    return { ok: false, failure: { kind: "query_failed", message: error.message } };
  }

  // The check that replaces RLS. Zero rows is not a no-op: it means the row
  // moved, or the predicates did not match what the policy authorized, and
  // either way the caller must not be told this succeeded.
  if (!data || data.length === 0) {
    return { ok: false, failure: { kind: "conflict" } };
  }

  if (data.length > 1) {
    // `id` is the primary key, so this cannot happen. If it ever does, the
    // write touched rows nobody authorized and that is worth an error rather
    // than a shrug.
    console.error(
      `[posts] write for ${input.postId} affected ${data.length} rows`
    );
    return { ok: false, failure: { kind: "conflict" } };
  }

  return { ok: true, data: { id: input.postId } };
}

export { AUTHOR_EDITABLE_POST_COLUMNS, canWriteToPost };
