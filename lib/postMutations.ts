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
  checkDelete,
  checkInsert,
  checkSlugRename,
  INSERTABLE_POST_COLUMNS,
  checkTransition,
  checkWorkflowEvidence,
  partitionPostPatch,
  TRANSITION_BOOKKEEPING_COLUMNS,
  type PostActor,
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
 * between the load and the write.
 *
 * ## What Phase 2I removed
 *
 * The editorial operations: `submitPostForReview`, `resubmitRevision`,
 * `withdrawSubmission`, `editorialDecision`, `publishApprovedPost` and
 * `authorizeTransition`. None had a caller outside its own tests, because the
 * publishing reset removed the submission and review surfaces in Phase 2A, and
 * 20260915000007 has now removed the database side. What is left is what a
 * writer and a moderator actually do.
 *
 * ## What this deliberately does not expose
 *
 * There is no general `updatePost(patch)`. Status moves through named
 * operations, one per legitimate transition, because a general patch API is
 * how a content edit and a publication become the same statement. An author
 * changing their draft and an author publishing it are different acts with
 * different authorization, and they look different here.
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
 * back afterwards does not repair it.
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
 * because they describe the product rather than the permission system.
 */
const OWNER_VISIBLE_REFUSALS: ReadonlySet<PostWriteRefusal> = new Set([
  "delete_non_draft",
  "removed_post",
  "withdrawn_post",
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
  const { actor } = context;

  const { repository, post } = await loadFor(context, postId);
  if (!post) return { ok: false, failure: { kind: "not_found" } };

  const decision = checkContentEdit(actor, post, patch);
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
  const { actor } = context;

  const withAuthor =
    actor.kind === "author"
      ? { ...values, author_id: actor.userId }
      : values;

  const decision = checkInsert(actor, withAuthor);
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
 * The composer derives classification from the title on every save, so most
 * calls here write back the `content_kind` the row already has. The ones that
 * do change it are an author giving a piece a title, or taking it away, which
 * is what deciding between a Post and an Article is.
 */
export async function updateDraftComposition(
  context: MutationContext,
  postId: string,
  patch: Record<string, unknown>
): Promise<PostMutationResult> {
  const { actor } = context;

  const { repository, post } = await loadFor(context, postId);
  if (!post) return { ok: false, failure: { kind: "not_found" } };

  const decision = checkComposition(actor, post, patch);
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

/** Draft to published. Every publication is the author's to make. */
export async function publishOwnDraft(
  context: MutationContext,
  postId: string,
  extra: { published_at?: string } = {}
): Promise<PostMutationResult> {
  return transitionPost(context, postId, "published", {
    published_at: extra.published_at ?? new Date().toISOString(),
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
  const { actor } = context;

  const { repository, post } = await loadFor(context, postId);
  if (!post) return { ok: false, failure: { kind: "not_found" } };

  const decision = checkSlugRename(actor, post, slug);
  if (!decision.allowed) return refused(decision);

  return writeOnePost(repository, {
    postId,
    patch: { slug },
    expect: { author_id: post.author_id, status: post.status },
    actor,
  });
}

/** Hard delete. Drafts only. */
export async function deleteDraftPost(
  context: MutationContext,
  postId: string
): Promise<PostMutationResult> {
  const { actor } = context;

  const { repository, post } = await loadFor(context, postId);
  if (!post) return { ok: false, failure: { kind: "not_found" } };

  const decision = checkDelete(actor, post);
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
  const { actor } = context;

  const { repository, post } = await loadFor(context, postId);
  if (!post) return { ok: false, failure: { kind: "not_found" } };

  const decision = checkTransition({ actor, post, nextStatus });
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
 * `author_id` is included for an author actor only. An admin legitimately
 * writes rows they do not own, and a predicate that excluded them would turn
 * every moderation action into a conflict.
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
