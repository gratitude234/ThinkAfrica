import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PostStatus } from "@/lib/types";
import {
  resolvePostgresExecutor,
  withPostgresTransaction,
} from "@/lib/db/postgres/connection";
import {
  createPostgresWriteRepository,
  createSupabaseWriteRepository,
  resolveWriteAdapter,
  type PostWriteRepository,
} from "@/lib/db/postWrites";
import {
  AUTHOR_EDITABLE_POST_COLUMNS,
  canWriteToPost,
  checkComposition,
  checkContentEdit,
  checkCuration,
  checkDelete,
  checkInsert,
  checkSlugRename,
  INSERTABLE_POST_COLUMNS,
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
 * Every statement lives behind `PostWriteRepository` in lib/db/postWrites.ts,
 * and which implementation answers is decided by `WRITE_DATABASE_ADAPTER`.
 * Unset means Supabase, which is what production is.
 *
 * That variable is deliberately separate from `DATABASE_ADAPTER`, which
 * already routes reads. Reads and writes carry different risk: a read served
 * from the wrong database shows stale content, while a write sent to the wrong
 * database is a row that exists in one place and not the other, and switching
 * back afterwards does not repair it. So the preview can read from Neon while
 * still writing to Supabase, and moving writes is a second decision with its
 * own rollback.
 *
 * Nothing above this line changes when the adapter does. The policy, the
 * ordering, the predicates and the row-count check are the same code against
 * either backend, which is the whole reason the seam is here rather than
 * inside each operation.
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

/**
 * Thrown to roll a transaction back while carrying the refusal that caused it.
 *
 * A transaction rolls back when its callback throws, and the caller still
 * needs the reason. Throwing the result rather than returning it is what makes
 * "the write did not land" and "undo everything before it" the same event.
 */
class PostTransactionRollback extends Error {
  readonly result: PostMutationResult;

  constructor(result: PostMutationResult) {
    super("post transaction rolled back");
    this.name = "PostTransactionRollback";
    this.result = result;
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
  return createSupabaseWriteRepository(supabase).loadState(postId);
}

/** The same lookup, through whichever backend this call writes to. Reading the
 *  state from one database and writing to another is how a policy decision
 *  gets made about a row that is not the row being changed. */
async function loadFor(
  context: MutationContext,
  postId: string
): Promise<{ repository: PostWriteRepository; post: PostStateSnapshot | null }> {
  const repository = writeRepositoryFor(context);
  return { repository, post: await repository.loadState(postId) };
}

// ── Operations ───────────────────────────────────────────────────────

export interface MutationContext {
  /** The request-scoped Supabase client. Still required: it is what the
   *  Supabase repository writes through, and it is what every call site
   *  already has to hand. Ignored when WRITE_DATABASE_ADAPTER is postgres. */
  supabase: SupabaseClient;
  actor: PostActor;
  options?: PostPolicyOptions;
  /** Overrides the adapter for one call. Tests and the write rehearsal use it;
   *  no application code does. */
  repository?: PostWriteRepository;
}

/**
 * The repository this call writes through.
 *
 * Resolved per call rather than per process, because the answer depends only
 * on an environment variable and resolving it here keeps the decision visible
 * at the point the write happens. `resolveWriteAdapter` throws on an
 * unrecognised value, so a typo fails immediately rather than quietly writing
 * to Supabase.
 */
export function writeRepositoryFor(context: MutationContext): PostWriteRepository {
  if (context.repository) return context.repository;
  if (resolveWriteAdapter() === "postgres") {
    return createPostgresWriteRepository(
      resolvePostgresExecutor(),
      withPostgresTransaction
    );
  }
  return createSupabaseWriteRepository(context.supabase);
}


/**
 * An author editing their own content. No status change, ever.
 */
export async function updatePostContent(
  context: MutationContext,
  postId: string,
  patch: Record<string, unknown>
): Promise<PostMutationResult> {
  const { actor, options = LIVE_POLICY } = context;

  const { repository, post } = await loadFor(context, postId);
  if (!post) return { ok: false, failure: { kind: "not_found" } };

  const decision = checkContentEdit(actor, post, patch, options);
  if (!decision.allowed) return refused(decision);

  const { allowed } = partitionPostPatch(patch);
  if (Object.keys(allowed).length === 0) {
    // Nothing to do is success. A caller that sent only unchanged fields has
    // not failed, and reporting a conflict here would make autosave noisy.
    return { ok: true, data: { id: post.id } };
  }

  return writeOnePost(repository, {
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
  const { actor, options = LIVE_POLICY } = context;

  const withAuthor =
    actor.kind === "author"
      ? { ...values, author_id: actor.userId }
      : values;

  const decision = checkInsert(actor, withAuthor, options);
  if (!decision.allowed) return refused(decision);

  // Built from the allowlist rather than spread. checkInsert already refuses
  // an unknown key, so this cannot change what is written today; it is here so
  // that a caller passing a request body straight through still produces an
  // insert made only of columns somebody chose. Two independent reasons a
  // browser payload cannot become an insert object is the right number.
  const insertValues: Record<string, unknown> = {};
  for (const column of INSERTABLE_POST_COLUMNS) {
    if (column in withAuthor) insertValues[column] = withAuthor[column];
  }

  try {
    const id = await writeRepositoryFor(context).insert(insertValues);
    return { ok: true, data: { id } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[posts] insert failed", message);
    return { ok: false, failure: { kind: "query_failed", message } };
  }
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
  const { actor, options = LIVE_POLICY } = context;

  const { repository, post } = await loadFor(context, postId);
  if (!post) return { ok: false, failure: { kind: "not_found" } };

  const decision = checkComposition(actor, post, patch, options);
  if (!decision.allowed) return refused(decision);

  if (Object.keys(patch).length === 0) {
    return { ok: true, data: { id: post.id } };
  }

  return writeOnePost(repository, {
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
 * Renaming a post's slug, and nothing else.
 *
 * Its own operation because a rename is the one edit that changes a public URL,
 * and because folding it into a content edit would let any content write carry
 * a slug the caller chose. Nothing else may travel with it.
 */
export async function renamePostSlug(
  context: MutationContext,
  postId: string,
  slug: string
): Promise<PostMutationResult> {
  const { actor, options = LIVE_POLICY } = context;

  const { repository, post } = await loadFor(context, postId);
  if (!post) return { ok: false, failure: { kind: "not_found" } };

  const decision = checkSlugRename(actor, post, slug, options);
  if (!decision.allowed) return refused(decision);

  return writeOnePost(repository, {
    postId,
    patch: { slug },
    expect: { author_id: post.author_id, status: post.status },
    actor,
  });
}

/**
 * Featuring one post, which means unfeaturing every other.
 *
 * Both halves belong to this operation. They used to be two statements in a
 * server action, the first of which cleared `featured` across the whole table,
 * and a failure between them left the site with nothing featured at all.
 *
 * On Supabase this is still two statements, in the order that fails safe: the
 * sweep first, then the set, so the worst outcome is briefly nothing featured
 * rather than briefly two. The PostgreSQL repository will run both inside one
 * transaction, which is why they live behind one function now rather than
 * being tidied up later.
 */
export async function featurePostExclusively(
  context: MutationContext,
  postId: string,
  featured: boolean
): Promise<PostMutationResult> {
  const { actor, options = LIVE_POLICY } = context;

  const { repository, post } = await loadFor(context, postId);
  if (!post) return { ok: false, failure: { kind: "not_found" } };

  const permitted = checkCuration(actor);
  if (!permitted.allowed) return refused(permitted);

  const writable = canWriteToPost(actor, post, options);
  if (!writable.allowed) return refused(writable);

  // Both halves in one transaction where the backend has them. On Supabase
  // that is ordering rather than atomicity, which is what production has
  // today; on PostgreSQL a failure between the sweep and the set rolls the
  // sweep back, so the site is never left with nothing featured.
  return repository.transaction(async (tx) => {
    if (featured) {
      try {
        await tx.clearFeatured();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[posts] unfeature sweep failed", message);
        return {
          ok: false,
          failure: { kind: "query_failed", message },
        } as PostMutationResult;
      }
    }

    const result = await writeOnePost(tx, {
      postId,
      patch: { featured },
      expect: { author_id: post.author_id, status: post.status },
      actor,
    });

    // Undo the sweep when the set did not land. Without this the transaction
    // commits a table with nothing featured, which is the exact failure the
    // two statements had when they lived in a server action.
    if (!result.ok && featured) {
      throw new PostTransactionRollback(result);
    }

    return result;
  }).catch((error: unknown) => {
    if (error instanceof PostTransactionRollback) return error.result;
    const message = error instanceof Error ? error.message : String(error);
    console.error("[posts] feature transaction failed", message);
    return { ok: false, failure: { kind: "query_failed", message } };
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
  const { actor, options = LIVE_POLICY } = context;

  const { repository, post } = await loadFor(context, postId);
  if (!post) return { ok: false, failure: { kind: "not_found" } };

  const permitted = checkCuration(actor);
  if (!permitted.allowed) return refused(permitted);

  const writable = canWriteToPost(actor, post, options);
  if (!writable.allowed) return refused(writable);

  return writeOnePost(repository, {
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
  const { actor, options = LIVE_POLICY } = context;

  const { repository, post } = await loadFor(context, postId);
  if (!post) return { ok: false, failure: { kind: "not_found" } };

  const decision = checkDelete(actor, post, options);
  if (!decision.allowed) return refused(decision);

  let affected: number;
  try {
    // The predicates the policy already checked, restated so a row that moved
    // between the load and the delete is missed rather than deleted.
    affected = await repository.deleteOne(postId, {
      status: post.status,
      authorId: actor.kind === "author" ? actor.userId : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[posts] delete failed for ${postId}`, message);
    return { ok: false, failure: { kind: "query_failed", message } };
  }

  if (affected === 0) {
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
  const { actor, options = LIVE_POLICY } = context;

  const { repository, post } = await loadFor(context, postId);
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
  const { actor, options = LIVE_POLICY } = context;

  const { repository, post } = await loadFor(context, postId);
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

  return writeOnePost(repository, {
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
  repository: PostWriteRepository,
  input: {
    postId: string;
    patch: Record<string, unknown>;
    expect: { author_id: string; status: PostStatus };
    actor: PostActor;
  }
): Promise<PostMutationResult> {
  let affected: number;
  try {
    affected = await repository.updateOne(input.postId, input.patch, {
      status: input.expect.status,
      // An author writes only their own row. An editor legitimately writes
      // rows they do not own, and constraining them would turn every
      // editorial decision into a conflict.
      authorId: input.actor.kind === "author" ? input.actor.userId : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[posts] write failed for ${input.postId}`, message);
    return { ok: false, failure: { kind: "query_failed", message } };
  }

  // The check that replaces RLS. Zero rows is not a no-op: it means the row
  // moved, or the predicates did not match what the policy authorized, and
  // either way the caller must not be told this succeeded.
  if (affected === 0) {
    return { ok: false, failure: { kind: "conflict" } };
  }

  if (affected > 1) {
    // `id` is the primary key, so this cannot happen. If it ever does, the
    // write touched rows nobody authorized and that is worth an error rather
    // than a shrug.
    console.error(`[posts] write for ${input.postId} affected ${affected} rows`);
    return { ok: false, failure: { kind: "conflict" } };
  }

  return { ok: true, data: { id: input.postId } };
}

export { AUTHOR_EDITABLE_POST_COLUMNS, canWriteToPost };
