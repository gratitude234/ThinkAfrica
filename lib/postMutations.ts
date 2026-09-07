import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PostStatus } from "@/lib/types";
import {
  AUTHOR_EDITABLE_POST_COLUMNS,
  canWriteToPost,
  checkComposition,
  checkContentEdit,
  checkCuration,
  checkDelete,
  checkInsert,
  checkTransition,
  checkWorkflowEvidence,
  LIVE_POLICY,
  partitionPostPatch,
  TRANSITION_BOOKKEEPING_COLUMNS,
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

/**
 * Creating a post.
 *
 * The only operation with no stored row behind it, so it is the only one that
 * authorizes against the caller's own values. `author_id` is overwritten with
 * the resolved viewer rather than trusted: an insert is the one place a caller
 * could otherwise name somebody else as the author of their work.
 */
export async function createPost(
  context: MutationContext,
  values: Record<string, unknown>
): Promise<PostMutationResult> {
  const { supabase, actor, options = LIVE_POLICY } = context;

  const withAuthor =
    actor.kind === "author"
      ? { ...values, author_id: actor.userId }
      : values;

  const decision = checkInsert(actor, withAuthor, options);
  if (!decision.allowed) return refused(decision);

  const { data, error } = await supabase
    .from("posts")
    .insert(withAuthor)
    .select("id")
    .single();

  if (error) {
    console.error("[posts] insert failed", error.message);
    return { ok: false, failure: { kind: "query_failed", message: error.message } };
  }
  if (!data) {
    return { ok: false, failure: { kind: "conflict" } };
  }

  return { ok: true, data: { id: (data as { id: string }).id } };
}

/**
 * A composer write: content plus classification, no status change.
 *
 * The composer derives classification from the stored row and writes it back
 * on every save, so most calls here change nothing about it. The ones that do
 * are an author deciding what they are writing, which is theirs to decide
 * while it is not a published record and, under LIVE_POLICY, while it is in
 * review. See `checkComposition`.
 */
export async function updateDraftComposition(
  context: MutationContext,
  postId: string,
  patch: Record<string, unknown>
): Promise<PostMutationResult> {
  const { supabase, actor, options = LIVE_POLICY } = context;

  const post = await loadPostState(supabase, postId);
  if (!post) return { ok: false, failure: { kind: "not_found" } };

  const decision = checkComposition(actor, post, patch, options);
  if (!decision.allowed) return refused(decision);

  if (Object.keys(patch).length === 0) {
    return { ok: true, data: { id: post.id } };
  }

  return writeOnePost(supabase, {
    postId,
    patch,
    expect: { author_id: post.author_id, status: post.status },
    actor,
  });
}

/** Draft to published, for content whose publication is the author's to make. */
export async function publishOwnDraft(
  context: MutationContext,
  postId: string,
  extra: {
    published_at?: string;
    current_round?: number;
    revision_due_at?: string | null;
  } = {}
): Promise<PostMutationResult> {
  const { published_at, ...bookkeeping } = extra;
  return transitionPost(context, postId, "published", {
    published_at: published_at ?? new Date().toISOString(),
    ...bookkeeping,
  });
}

/**
 * Draft to pending: the author submitting work for editorial review.
 *
 * The bookkeeping travels with the status because the row is briefly wrong
 * without it: a submission at round zero, or carrying a revision deadline from
 * a previous cycle, is a submission the review queue renders incorrectly.
 * `published_version_id` is written as null, which it already is; the write is
 * there so a resubmission cannot carry a stale one, and
 * `checkWorkflowEvidence` still refuses any actual change.
 */
export async function submitPostForReview(
  context: MutationContext,
  postId: string,
  extra: {
    current_round?: number;
    revision_due_at?: string | null;
    published_at?: string | null;
    published_version_id?: string | null;
  } = {}
): Promise<PostMutationResult> {
  return transitionPost(context, postId, "pending", {
    current_round: 1,
    revision_due_at: null,
    published_at: null,
    published_version_id: null,
    ...extra,
  });
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

/** Moderation. Admins only. */
export async function removePost(
  context: MutationContext,
  postId: string
): Promise<PostMutationResult> {
  return transitionPost(context, postId, "removed", {});
}

/**
 * Moderation reversing itself: the only way out of `removed`.
 *
 * Restores to published because that is what a removal is applied to. A post
 * that was a draft when it was removed is not something the moderation queue
 * can produce, since removal acts on reported live content.
 */
export async function restorePost(
  context: MutationContext,
  postId: string
): Promise<PostMutationResult> {
  return transitionPost(context, postId, "published", {});
}

/**
 * An editor publishing work that needed a decision but not a citation.
 *
 * Distinct from `publishReviewedPost()` in lib/reviewWorkflow.ts, which is the
 * acceptance path for research and policy briefs and additionally mints a
 * citation and a version snapshot. This is the plainer case: content that
 * reached the review desk and is simply approved.
 */
export async function publishApprovedPost(
  context: MutationContext,
  postId: string,
  extra: { published_at?: string } = {}
): Promise<PostMutationResult> {
  return transitionPost(context, postId, "published", {
    published_at: extra.published_at ?? new Date().toISOString(),
  });
}

/**
 * Curation: which post the review desk features.
 *
 * Not a lifecycle transition and not content, so it has its own operation
 * rather than being smuggled through one of the others. An author may not do
 * it, which is a rule the trigger could never express.
 */
export async function setPostFeatured(
  context: MutationContext,
  postId: string,
  featured: boolean
): Promise<PostMutationResult> {
  const { supabase, actor, options = LIVE_POLICY } = context;

  const post = await loadPostState(supabase, postId);
  if (!post) return { ok: false, failure: { kind: "not_found" } };

  const permitted = checkCuration(actor);
  if (!permitted.allowed) return refused(permitted);

  const writable = canWriteToPost(actor, post, options);
  if (!writable.allowed) return refused(writable);

  return writeOnePost(supabase, {
    postId,
    patch: { featured },
    expect: { author_id: post.author_id, status: post.status },
    actor,
  });
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
 * Authorization without execution.
 *
 * For the one transition whose statement lives in the database rather than
 * here: withdrawal runs through `withdraw_post_submission()`, a SECURITY
 * DEFINER function that changes the status and retires the still-assigned
 * reviewers in the same transaction. Splitting that into two calls from the
 * application would leave a withdrawn submission sitting in the reviewer queue
 * whenever the second one failed, and the author has no grant on
 * `post_reviews` to make the second call with anyway.
 *
 * So the execution stays there and the decision moves here. The caller runs
 * this first and only calls the function if it allows. That is the whole point
 * of the exercise: the database is where the statement runs, not where the
 * rules live.
 */
export async function authorizeTransition(
  context: MutationContext,
  postId: string,
  nextStatus: PostStatus
): Promise<PostMutationResult<PostStateSnapshot>> {
  const { supabase, actor, options = LIVE_POLICY } = context;

  const post = await loadPostState(supabase, postId);
  if (!post) return { ok: false, failure: { kind: "not_found" } };

  const decision = checkTransition({ actor, post, nextStatus }, options);
  if (!decision.allowed) return refused(decision);

  return { ok: true, data: post };
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

  // `extra` is bookkeeping the transition owns, not a patch the caller chose.
  // Without this check a named operation would be a general update API with a
  // better name on it.
  const bookkeeping = new Set<string>(TRANSITION_BOOKKEEPING_COLUMNS);
  const smuggled = Object.keys(extra).filter((key) => !bookkeeping.has(key));
  if (smuggled.length > 0) {
    return refused({
      refusal: "protected_field",
      reason: `A transition may not also write: ${smuggled.join(", ")}.`,
    });
  }

  const evidence = checkWorkflowEvidence(actor, post, extra);
  if (!evidence.allowed) return refused(evidence);

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
