import type { PostStatus } from "@/lib/types";

/**
 * Every rule `guard_locked_post_write()` enforces, as application logic.
 *
 * ## Why this exists
 *
 * The trigger decides whether to enforce anything by comparing `current_user`
 * against the literal role `authenticated`:
 *
 *     IF auth.role() IS DISTINCT FROM 'authenticated'
 *        OR current_user IS DISTINCT FROM 'authenticated' THEN
 *       RETURN COALESCE(NEW, OLD);
 *     END IF;
 *
 * Off Supabase there is no role called `authenticated`. The application
 * connects as `indegenius_app`, the second disjunct is always true, and the
 * trigger returns before evaluating a single check. It does not fail closed
 * the way an RLS policy does: RLS compares against a NULL `auth.uid()` and
 * denies, whereas this bypass is written as an inequality and an unrecognised
 * role satisfies it. Every protection in the trigger is therefore absent on
 * Neon, and absent in the permissive direction.
 *
 * So the rules live here, where they hold regardless of which database is
 * underneath and regardless of who the connecting role is. The trigger stays
 * as a Supabase-side backstop; it is no longer what anything depends on.
 *
 * ## What Phase 2I removed
 *
 * The review workflow's half of this module, because the workflow is gone from
 * the product and, as of 20260915000007, from the database. That means: the
 * editorial types, the rule that an author may not publish research or a policy
 * brief, the lock on a publication that had been accepted, the frozen
 * classification window while a submission sat in review, withdrawal, and the
 * `LIVE_POLICY`/`REPO_POLICY` pair that existed only to model a disagreement
 * about those rules between the live trigger and the repository's migrations.
 * There is nothing left for them to disagree about, so the options argument is
 * gone from every function rather than kept as an empty object.
 *
 * What survives is what the database still enforces: drafts-only delete,
 * immutable citation evidence, and the removed and withdrawn locks.
 *
 * ## What this module is not
 *
 * It has no I/O and no Supabase import. It takes a snapshot of the row as it
 * currently is, plus who is asking and what they want, and returns a decision.
 * That is what makes it testable exhaustively and what makes it correct
 * independently of Supabase Auth: identity arrives as an argument the server
 * resolved, never read from a session inside a policy check.
 *
 * The pipeline it belongs to lives in `lib/postMutations.ts`:
 *
 *     viewer identity -> load post -> THIS -> repository -> row-count check
 */

// ── Actors ───────────────────────────────────────────────────────────

/**
 * Who is asking, resolved by the server. Never sent by a browser.
 *
 * `system` is the moderation machinery. On Supabase it runs under the service
 * role and bypasses the trigger; here it is named, so the exemption is a stated
 * capability rather than a side effect of which key happened to be in scope.
 *
 * There is no `editor`. It existed for the editorial decision operations, and
 * with those retired there is no transition any editor may make that an author
 * or an admin may not.
 */
export type PostActor =
  | { kind: "author"; userId: string }
  | { kind: "admin"; userId: string }
  | { kind: "system" };

/** The row as it is now. Every field here is read from the database, never
 *  from the caller. */
export interface PostStateSnapshot {
  id: string;
  author_id: string;
  status: PostStatus;
  content_kind: string | null;
  /**
   * Both are evidence the retired acceptance workflow ran, and both stay
   * immutable to an authenticated write. Two published rows carry a
   * `citation_id`, `/publication/[citationId]` still resolves old citation URLs
   * through it, and an author clearing one would break a link somebody else
   * published. See `checkWorkflowEvidence`.
   */
  citation_id: string | null;
  published_version_id: string | null;
}

// ── Refusals ─────────────────────────────────────────────────────────

/**
 * Why a write was refused, as a closed set.
 *
 * A code rather than a sentence, so a caller can decide what the reader sees
 * and the server log can carry the detail. `lib/postMutations.ts` maps every
 * one of these to the same generic message for anyone who is not the owner,
 * because "this post is locked" and "this post is not yours" are different
 * facts and telling them apart is an information leak.
 */
export type PostWriteRefusal =
  | "not_owner"
  | "role_required"
  | "protected_field"
  | "illegal_transition"
  | "removed_post"
  | "withdrawn_post"
  | "citation_id_forbidden"
  | "published_version_id_forbidden"
  | "delete_non_draft";

export type PolicyDecision =
  | { allowed: true }
  | { allowed: false; refusal: PostWriteRefusal; reason: string };

const allow: PolicyDecision = { allowed: true };

function deny(refusal: PostWriteRefusal, reason: string): PolicyDecision {
  return { allowed: false, refusal, reason };
}

// ── Protected columns ────────────────────────────────────────────────

/**
 * What an ordinary author edit may change. An allowlist, not a denylist.
 *
 * Default-deny is the load-bearing half: adding a column to `posts` must not
 * silently make it author-writable. This is the same shape
 * `SELF_EDITABLE_PROFILE_COLUMNS` uses in `lib/profileMutations.ts`, for the
 * same reason.
 *
 * `status` is deliberately absent. Status moves through the named transition
 * operations, never through a content edit, which is what stops a single
 * UPDATE from reclassifying a row and publishing it in one statement.
 *
 * Phase 2I removed the research document columns and `research_keywords`, which
 * belonged to a submission form that no longer exists, and `in_response_to`,
 * which is now write-refused outright: a stored parent on a legacy draft is
 * data the product keeps, not a field anything may set.
 */
export const AUTHOR_EDITABLE_POST_COLUMNS = [
  "title",
  "slug",
  "content",
  "excerpt",
  "cover_image_url",
  "tags",
  "audio_summary_url",
] as const;

export type AuthorEditablePostColumn =
  (typeof AUTHOR_EDITABLE_POST_COLUMNS)[number];

/**
 * What the composer may additionally write while a piece is still being
 * composed.
 *
 * One column: `content_kind`. Deciding that a piece is an Article rather than a
 * Post is the act of giving it a title, and the composer derives it through
 * `derivePresentationClassification`. The legacy `type` and `article_format`
 * are absent because the application does not write them at all any more: the
 * database derives `type` from `content_kind` and forces `article_format` to
 * null (20260915000006).
 *
 * `status` is deliberately still absent. Composition and publication remain
 * different acts.
 */
export const COMPOSABLE_POST_COLUMNS = [
  ...AUTHOR_EDITABLE_POST_COLUMNS,
  "content_kind",
] as const;

export type ComposablePostColumn = (typeof COMPOSABLE_POST_COLUMNS)[number];

/**
 * The only columns a named transition may carry alongside the status.
 *
 * Publishing stamps `published_at`, and that bookkeeping has to travel in the
 * same statement or the row is briefly inconsistent. It is an allowlist for the
 * same reason everything else here is: without it, `extra` would be a general
 * patch parameter hiding behind a named operation.
 */
export const TRANSITION_BOOKKEEPING_COLUMNS = [
  "published_at",
  "slug",
] as const;

/**
 * Columns an authenticated write may never set, whatever else it is doing.
 *
 * `citation_id` and `published_version_id` are the evidence the retired
 * workflow completed, and `/publication/[citationId]` still reads the first.
 * The classification columns are here because the database owns them now: an
 * ordinary edit that named `content_kind` would be changing what a piece is
 * without going through the composer, and `type` and `article_format` are
 * derived rather than written.
 */
export const NEVER_AUTHOR_WRITABLE_POST_COLUMNS = [
  "status",
  "author_id",
  "citation_id",
  "published_version_id",
  "published_at",
  "type",
  "content_kind",
  "article_format",
  "in_response_to",
  "view_count",
  "impression_count",
  "read_count",
  // DATABASE DEFERRED: posts.featured has had no application reader or writer
  // since Phase 2F. It stays refused here until the column is dropped.
  "featured",
  // DATABASE DEFERRED: both belonged to the review cycle. Nothing writes them.
  "current_round",
  "revision_due_at",
] as const;

export interface RejectedFields {
  protectedFields: string[];
  unknownFields: string[];
}

/**
 * Splits a patch into what an author may write and what they may not.
 *
 * The caller rejects the whole mutation when anything lands outside the
 * allowlist. Silently stripping the dangerous keys would mean a request to
 * publish yourself returns success having done something other than what was
 * asked, which is worse than a refusal: it is a refusal the caller cannot see.
 */
export function partitionPostPatch(patch: Record<string, unknown>): {
  allowed: Partial<Record<AuthorEditablePostColumn, unknown>>;
  rejected: RejectedFields;
} {
  const allowed: Partial<Record<AuthorEditablePostColumn, unknown>> = {};
  const protectedFields: string[] = [];
  const unknownFields: string[] = [];

  const editable = new Set<string>(AUTHOR_EDITABLE_POST_COLUMNS);
  const forbidden = new Set<string>(NEVER_AUTHOR_WRITABLE_POST_COLUMNS);

  for (const key of Object.keys(patch)) {
    if (editable.has(key)) {
      allowed[key as AuthorEditablePostColumn] = patch[key];
    } else if (forbidden.has(key)) {
      protectedFields.push(key);
    } else {
      // Not on either list. Refused too: an unknown column is either a typo,
      // which should be loud, or a column added since this list was written,
      // which is exactly the case default-deny exists for.
      unknownFields.push(key);
    }
  }

  return { allowed, rejected: { protectedFields, unknownFields } };
}

// ── State machine ────────────────────────────────────────────────────

/**
 * Every legal status transition, and who may make it.
 *
 * Derived from the flows that exist today, not from what a lifecycle diagram
 * ought to contain. Each entry names the call site that proves it:
 *
 *   draft -> draft        author   composer autosave
 *   draft -> published    author   app/(write)/write/actions.ts
 *   published -> published author  editing a published post
 *   * -> removed          admin    app/(main)/admin/moderation/actions.ts
 *   removed -> published  admin    moderation reversing itself
 *
 * Everything absent is forbidden. Phase 2I removed every transition belonging
 * to the review cycle: into `pending`, out of `pending` or `pending_revision`,
 * and into `withdrawn` or `rejected`. Those four statuses survive only as
 * sources of a moderation removal, because production still holds one `pending`
 * row and nothing in the product can move it anywhere else.
 */
export interface TransitionRule {
  from: PostStatus;
  to: PostStatus;
  actors: ReadonlyArray<PostActor["kind"]>;
}

export const POST_TRANSITIONS: readonly TransitionRule[] = [
  { from: "draft", to: "draft", actors: ["author", "system"] },
  { from: "draft", to: "published", actors: ["author", "system"] },
  { from: "published", to: "published", actors: ["author", "system"] },

  { from: "draft", to: "removed", actors: ["admin", "system"] },
  { from: "pending", to: "removed", actors: ["admin", "system"] },
  { from: "pending_revision", to: "removed", actors: ["admin", "system"] },
  { from: "published", to: "removed", actors: ["admin", "system"] },
  { from: "rejected", to: "removed", actors: ["admin", "system"] },
  { from: "withdrawn", to: "removed", actors: ["admin", "system"] },

  // Moderation reversing itself. The only way out of `removed`, available to
  // nobody else, and it restores to published because that is what the
  // moderation action does today: a removal is applied to a live post, so a
  // restoration returns it to being live.
  { from: "removed", to: "published", actors: ["admin", "system"] },
];

/** Terminal for the author. `removed` is reversible by moderation and by
 *  nobody else; `withdrawn` is reversible by nobody. */
export const TERMINAL_POST_STATUSES: readonly PostStatus[] = [
  "removed",
  "withdrawn",
];

export function findTransition(
  from: PostStatus,
  to: PostStatus
): TransitionRule | undefined {
  return POST_TRANSITIONS.find((rule) => rule.from === from && rule.to === to);
}

// ── The rules ────────────────────────────────────────────────────────

function isOwner(actor: PostActor, post: PostStateSnapshot): boolean {
  return actor.kind === "author" && actor.userId === post.author_id;
}

function isPrivileged(actor: PostActor): boolean {
  return actor.kind === "admin" || actor.kind === "system";
}

/**
 * May this actor write to this post at all, before considering what the write
 * says?
 *
 * The two unconditional locks come first, because they hold even for the owner
 * and even for an edit that changes nothing interesting. There used to be a
 * third, on a publication that had been through review; an author's own
 * published work is ordinarily editable now.
 */
export function canWriteToPost(
  actor: PostActor,
  post: PostStateSnapshot
): PolicyDecision {
  if (!isOwner(actor, post) && !isPrivileged(actor)) {
    return deny("not_owner", "The viewer does not own this post.");
  }

  // Moderation removed it. The author does not touch it again: an author
  // editing their way out of a moderation decision is the failure this
  // prevents.
  //
  // Moderation itself does, which is why `admin` is not on this list. That is
  // not a weakening: the trigger exempts service_role entirely, and restoring
  // a removed post is a thing moderation does today
  // (app/(main)/admin/moderation/actions.ts). The transition table is what
  // limits it to the one legitimate move, and `restorePost` is the only
  // operation that performs it.
  if (
    post.status === "removed" &&
    actor.kind !== "system" &&
    actor.kind !== "admin"
  ) {
    return deny("removed_post", "This post was removed and cannot be modified.");
  }

  // Terminal in the same way. No submission can reach this status any more, so
  // this protects the rows that already carry it rather than a live flow.
  if (post.status === "withdrawn" && actor.kind !== "system") {
    return deny(
      "withdrawn_post",
      "This submission was withdrawn and cannot be modified."
    );
  }

  return allow;
}

/**
 * The two columns that are evidence a workflow completed.
 *
 * Rejected in either direction: setting, clearing and replacing are all
 * refused. An author who can write one can award themselves a citation, and an
 * author who can clear one can break the `/publication/[citationId]` redirect
 * that still resolves somebody else's published link.
 */
export function checkWorkflowEvidence(
  actor: PostActor,
  post: PostStateSnapshot,
  patch: Record<string, unknown>
): PolicyDecision {
  if (actor.kind === "system") return allow;

  if ("citation_id" in patch && patch.citation_id !== post.citation_id) {
    return deny(
      "citation_id_forbidden",
      "citation_id belongs to the retired editorial workflow and cannot be changed."
    );
  }
  if (
    "published_version_id" in patch &&
    patch.published_version_id !== post.published_version_id
  ) {
    return deny(
      "published_version_id_forbidden",
      "published_version_id belongs to the retired editorial workflow and cannot be changed."
    );
  }
  return allow;
}

export interface TransitionRequest {
  actor: PostActor;
  post: PostStateSnapshot;
  nextStatus: PostStatus;
}

/**
 * May this actor move this post from where it is to where they want it?
 *
 * The order matters and mirrors the trigger's: the unconditional locks, then
 * the table. Checking the table first would report "illegal transition" for a
 * write that is actually refused because the post was removed, which is a worse
 * message and a worse log line.
 */
export function checkTransition(request: TransitionRequest): PolicyDecision {
  const { actor, post, nextStatus } = request;

  const writable = canWriteToPost(actor, post);
  if (!writable.allowed) return writable;

  const rule = findTransition(post.status, nextStatus);
  if (!rule) {
    return deny(
      "illegal_transition",
      `A post cannot move from ${post.status} to ${nextStatus}.`
    );
  }

  if (!rule.actors.includes(actor.kind)) {
    return deny(
      "role_required",
      `Moving a post from ${post.status} to ${nextStatus} is not something this viewer may do.`
    );
  }

  return allow;
}

/**
 * May this actor hard-delete this post?
 *
 * Drafts only, for everyone below `system`. A published piece has readers and
 * inbound links; taking one down is moderation, not an author's delete.
 */
export function checkDelete(
  actor: PostActor,
  post: PostStateSnapshot
): PolicyDecision {
  if (!isOwner(actor, post) && actor.kind !== "system" && actor.kind !== "admin") {
    return deny("not_owner", "The viewer does not own this post.");
  }

  if (actor.kind === "system") return allow;

  if (post.status !== "draft") {
    return deny("delete_non_draft", "Only drafts can be deleted directly.");
  }

  return canWriteToPost(actor, post);
}

/**
 * A composer write: content plus classification, while the piece is still the
 * author's to shape.
 *
 * Separate from `checkContentEdit` because the two have different allowlists
 * and the difference is the whole point. An ordinary edit may not touch
 * classification; composing may, because a title is what classification is.
 */
export function checkComposition(
  actor: PostActor,
  post: PostStateSnapshot,
  patch: Record<string, unknown>
): PolicyDecision {
  const writable = canWriteToPost(actor, post);
  if (!writable.allowed) return writable;

  const evidence = checkWorkflowEvidence(actor, post, patch);
  if (!evidence.allowed) return evidence;

  if (isPrivileged(actor)) return allow;

  const composable = new Set<string>(COMPOSABLE_POST_COLUMNS);
  const rejected = Object.keys(patch).filter((key) => !composable.has(key));
  if (rejected.length > 0) {
    return deny(
      "protected_field",
      `A composer write may not set: ${rejected.join(", ")}.`
    );
  }

  return allow;
}

/**
 * A slug the application is willing to put in a URL.
 *
 * Lowercase, alphanumeric and hyphens. Checked rather than sanitised: a rename
 * that silently produced a different slug from the one asked for would be a
 * rename nobody could predict, and the callers all build their slugs from a
 * title through the same helpers already.
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 200;

export function checkSlugRename(
  actor: PostActor,
  post: PostStateSnapshot,
  slug: string
): PolicyDecision {
  const writable = canWriteToPost(actor, post);
  if (!writable.allowed) return writable;

  if (!slug || slug.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(slug)) {
    return deny("protected_field", "That is not a usable slug.");
  }

  return allow;
}

/**
 * Creating a post.
 *
 * There is no stored row to authorize against, so this is the one check that
 * reads the caller's values rather than the database's. The trigger has an
 * INSERT branch for the same reason, and it enforces the same things:
 *
 *   - a new row may not already carry `citation_id` or
 *     `published_version_id`, because both are evidence a workflow completed
 *     and no workflow has run;
 *   - a new row may not be born into a status nothing creates;
 *   - and, which the trigger cannot check, the author is the viewer.
 *
 * Everything else about a new post is composition, so the allowlist is the
 * composer's plus the two columns only an insert sets.
 */
export const INSERTABLE_POST_COLUMNS = [
  ...COMPOSABLE_POST_COLUMNS,
  "author_id",
  "status",
  "published_at",
] as const;

export function checkInsert(
  actor: PostActor,
  values: Record<string, unknown>
): PolicyDecision {
  if (actor.kind === "system") return allow;

  if (actor.kind === "author" && values.author_id !== actor.userId) {
    return deny(
      "not_owner",
      "A post is created for the viewer, not for an author they name."
    );
  }

  if (values.citation_id != null) {
    return deny(
      "citation_id_forbidden",
      "citation_id belongs to the retired editorial workflow and cannot be set."
    );
  }
  if (values.published_version_id != null) {
    return deny(
      "published_version_id_forbidden",
      "published_version_id belongs to the retired editorial workflow and cannot be set."
    );
  }

  const status = (values.status as PostStatus | undefined) ?? "draft";

  if (status !== "draft" && status !== "published") {
    return deny(
      "illegal_transition",
      `A post cannot be created as ${status}.`
    );
  }

  const insertable = new Set<string>(INSERTABLE_POST_COLUMNS);
  const rejected = Object.keys(values).filter((key) => !insertable.has(key));
  if (rejected.length > 0) {
    return deny(
      "protected_field",
      `A new post may not set: ${rejected.join(", ")}.`
    );
  }

  return allow;
}

/**
 * An ordinary content edit: no status change, no classification change.
 *
 * The single entry point that composes the three checks in the order the
 * trigger applies them, so a caller cannot accidentally run two of the three.
 */
export function checkContentEdit(
  actor: PostActor,
  post: PostStateSnapshot,
  patch: Record<string, unknown>
): PolicyDecision {
  const writable = canWriteToPost(actor, post);
  if (!writable.allowed) return writable;

  const evidence = checkWorkflowEvidence(actor, post, patch);
  if (!evidence.allowed) return evidence;

  if (isPrivileged(actor)) return allow;

  const { rejected } = partitionPostPatch(patch);
  if (rejected.protectedFields.length > 0 || rejected.unknownFields.length > 0) {
    const named = [...rejected.protectedFields, ...rejected.unknownFields].join(", ");
    return deny(
      "protected_field",
      `An author edit may not write: ${named}.`
    );
  }

  return allow;
}
