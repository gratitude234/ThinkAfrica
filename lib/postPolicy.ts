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
 * role satisfies it. Every protection in those 117 lines is therefore absent
 * on Neon, and absent in the permissive direction.
 *
 * So the rules move here, where they hold regardless of which database is
 * underneath and regardless of who the connecting role is. The trigger stays
 * as a Supabase-side backstop; it is no longer what anything depends on.
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
 *
 * ## Fidelity
 *
 * Ported from the LIVE definition read out of `pg_catalog`, not from
 * `supabase/migrations/`. The live trigger matches neither file in the
 * repository: it is missing three checks that `20260720000001` defines. Those
 * three are implemented here and flagged `REPO_ONLY`, off by default, because
 * turning them on changes production behaviour and that is a product decision
 * rather than a migration one. See `docs/post-write-rules.md`.
 */

// ── Actors ───────────────────────────────────────────────────────────

/**
 * Who is asking, resolved by the server. Never sent by a browser.
 *
 * `system` is the editorial and moderation machinery: `publishReviewedPost()`,
 * `recordEditorDecision()`, the moderation actions. On Supabase those run
 * under the service role and bypass the trigger; here they are named, so the
 * exemption is a stated capability rather than a side effect of which key
 * happened to be in scope.
 */
export type PostActor =
  | { kind: "author"; userId: string }
  | { kind: "editor"; userId: string }
  | { kind: "admin"; userId: string }
  | { kind: "system" };

/** The row as it is now. Every field here is read from the database, never
 *  from the caller. */
export interface PostStateSnapshot {
  id: string;
  author_id: string;
  status: PostStatus;
  type: string;
  content_kind: string | null;
  article_format: string | null;
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
  | "locked_publication"
  | "removed_post"
  | "withdrawn_post"
  | "self_publish_reviewed"
  | "citation_id_forbidden"
  | "published_version_id_forbidden"
  | "classification_frozen"
  | "delete_non_draft"
  | "withdraw_not_eligible";

export type PolicyDecision =
  | { allowed: true }
  | { allowed: false; refusal: PostWriteRefusal; reason: string };

const allow: PolicyDecision = { allowed: true };

function deny(refusal: PostWriteRefusal, reason: string): PolicyDecision {
  return { allowed: false, refusal, reason };
}

// ── Content classification ───────────────────────────────────────────

/**
 * The types whose publication is an editorial act rather than an author's.
 *
 * Matches the live trigger exactly: `NEW.type IN ('research','policy_brief')`.
 * The repository's later version routes this through
 * `effective_content_kind()` so a row carrying `content_kind = 'research'`
 * counts too. Production does not, so neither does this by default; see
 * `REPO_ONLY_RULES`.
 */
export const EDITORIAL_POST_TYPES = ["research", "policy_brief"] as const;

export function requiresEditorialPublication(
  post: Pick<PostStateSnapshot, "type" | "content_kind">,
  options: PostPolicyOptions = {}
): boolean {
  if ((EDITORIAL_POST_TYPES as readonly string[]).includes(post.type)) return true;
  // Only when the repo-only widening is switched on. Live production checks
  // `type` alone, and a row can carry content_kind='research' with a
  // non-research type.
  if (options.classifyByContentKind && post.content_kind === "research") return true;
  return false;
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
 */
export const AUTHOR_EDITABLE_POST_COLUMNS = [
  "title",
  "slug",
  "content",
  "excerpt",
  "cover_image_url",
  "tags",
  "audio_summary_url",
  "document_path",
  "document_original_name",
  "document_mime_type",
  "document_size_bytes",
  "in_response_to",
  // The research submission form keeps its keywords apart from tags. Author
  // content like any other field here.
  "research_keywords",
] as const;

export type AuthorEditablePostColumn =
  (typeof AUTHOR_EDITABLE_POST_COLUMNS)[number];

/**
 * What the composer may additionally write while a piece is still being
 * composed.
 *
 * Classification is genuinely the author's to choose: deciding that a draft is
 * an essay rather than a blog post, or a research paper rather than either, is
 * the act of writing it. The trigger agrees, and this is worth being precise
 * about because it looks like a hole and is not: `guard_locked_post_write`
 * freezes classification only while a submission sits in `pending` or
 * `pending_revision`, and only in the repository's version at that. A draft's
 * type has never been locked.
 *
 * `current_round` and `revision_due_at` are here because the composer resets
 * them when a piece enters review, which is bookkeeping that belongs to the
 * same statement.
 *
 * `status` is deliberately still absent. Composition and publication remain
 * different acts.
 */
export const COMPOSABLE_POST_COLUMNS = [
  ...AUTHOR_EDITABLE_POST_COLUMNS,
  "type",
  "content_kind",
  "article_format",
  "current_round",
  "revision_due_at",
] as const;

export type ComposablePostColumn = (typeof COMPOSABLE_POST_COLUMNS)[number];

const CLASSIFICATION_COLUMNS = [
  "type",
  "content_kind",
  "article_format",
] as const;

/**
 * The only columns a named transition may carry alongside the status.
 *
 * A transition writes more than `status`: publishing stamps `published_at`,
 * entering review resets the round and the revision deadline. That bookkeeping
 * has to travel in the same statement or the row is briefly inconsistent.
 *
 * It is an allowlist for the same reason everything else here is. Without it,
 * `extra` would be a general patch parameter hiding behind a named operation,
 * and `citation_id` would be one keystroke from being writable again.
 * `published_version_id` is permitted here only so a transition can write the
 * null it already holds; `checkWorkflowEvidence` still refuses any actual
 * change for anyone but `system`.
 */
export const TRANSITION_BOOKKEEPING_COLUMNS = [
  "published_at",
  "current_round",
  "revision_due_at",
  "published_version_id",
  "slug",
] as const;

/**
 * Columns an authenticated write may never set, whatever else it is doing.
 *
 * The first four are the ones the trigger names. The rest are here because
 * they are the evidence other parts of the product trust:
 * `lib/contentModel.ts` reads `citation_id` and `published_version_id` as
 * proof that a workflow completed, and `role`/`verified` on the author side
 * have the same character. A field that proves something must not be writable
 * by the party it proves something about.
 */
export const NEVER_AUTHOR_WRITABLE_POST_COLUMNS = [
  "status",
  "author_id",
  "citation_id",
  "published_version_id",
  "published_at",
  "current_round",
  "revision_due_at",
  "type",
  "content_kind",
  "article_format",
  "view_count",
  "impression_count",
  "read_count",
  "featured",
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
 *   draft -> draft                  author   composer autosave
 *   draft -> published              author   app/(write)/write/actions.ts, non-editorial types only
 *   draft -> pending                author   app/(main)/submit/research/actions.ts
 *   pending -> pending              author   edit while awaiting review (content only)
 *   pending -> pending_revision     system   app/(main)/admin/review/actions.ts
 *   pending -> published            system   publishReviewedPost()
 *   pending -> rejected             system   app/(main)/admin/review/actions.ts
 *   pending -> withdrawn            author   withdraw_post_submission()
 *   pending_revision -> pending     author   app/(main)/edit/[slug]/actions.ts (resubmit)
 *   pending_revision -> pending_revision  author   edit during revision
 *   pending_revision -> withdrawn   author   withdraw_post_submission()
 *   published -> published          author   edit a published post, non-editorial types only
 *   * -> removed                    admin    app/(main)/admin/moderation/actions.ts
 *
 * Everything absent from this table is forbidden. In particular there is no
 * transition out of `removed`, `withdrawn` or `rejected`, and none into
 * `draft` from anywhere: un-rejecting or un-withdrawing a submission would
 * re-enter review with retired reviewer assignments and a stale editorial
 * history, and no flow in the product does it.
 */
export interface TransitionRule {
  from: PostStatus;
  to: PostStatus;
  actors: ReadonlyArray<PostActor["kind"]>;
  /** When true, the transition is refused for research and policy briefs. */
  forbiddenForEditorialTypes?: boolean;
  /** When true, the transition is ONLY available to research and policy
   *  briefs. Withdrawal is the only one: there is nothing to withdraw from
   *  for content that never entered review. */
  editorialTypesOnly?: boolean;
}

export const POST_TRANSITIONS: readonly TransitionRule[] = [
  { from: "draft", to: "draft", actors: ["author", "system"] },
  {
    from: "draft",
    to: "published",
    actors: ["author", "system"],
    // The rule the trigger states first: an author may not publish work whose
    // publication is an editorial decision.
    forbiddenForEditorialTypes: true,
  },
  { from: "draft", to: "pending", actors: ["author", "system"] },

  { from: "pending", to: "pending", actors: ["author", "system"] },
  { from: "pending", to: "pending_revision", actors: ["editor", "admin", "system"] },
  { from: "pending", to: "published", actors: ["editor", "admin", "system"] },
  { from: "pending", to: "rejected", actors: ["editor", "admin", "system"] },
  {
    from: "pending",
    to: "withdrawn",
    actors: ["author", "system"],
    editorialTypesOnly: true,
  },

  { from: "pending_revision", to: "pending_revision", actors: ["author", "system"] },
  { from: "pending_revision", to: "pending", actors: ["author", "system"] },
  { from: "pending_revision", to: "published", actors: ["editor", "admin", "system"] },
  { from: "pending_revision", to: "rejected", actors: ["editor", "admin", "system"] },
  {
    from: "pending_revision",
    to: "withdrawn",
    actors: ["author", "system"],
    editorialTypesOnly: true,
  },

  {
    from: "published",
    to: "published",
    actors: ["author", "system"],
    // A published research paper or policy brief is locked after acceptance
    // so its citation record stays stable.
    forbiddenForEditorialTypes: true,
  },

  { from: "draft", to: "removed", actors: ["admin", "system"] },
  { from: "pending", to: "removed", actors: ["admin", "system"] },
  { from: "pending_revision", to: "removed", actors: ["admin", "system"] },
  { from: "published", to: "removed", actors: ["admin", "system"] },
  { from: "rejected", to: "removed", actors: ["admin", "system"] },
  { from: "withdrawn", to: "removed", actors: ["admin", "system"] },
];

/** Terminal for everyone below `system`: nothing may be written to a post in
 *  one of these states through an ordinary flow. */
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

// ── Options ──────────────────────────────────────────────────────────

/**
 * The three checks that exist in `supabase/migrations/20260720000001` and in
 * `lib/contentModel.test.ts`, but NOT in the live database.
 *
 * They are implemented and default to off, so this module reproduces
 * production exactly until somebody decides otherwise. Turning them on is a
 * one-line change and a product decision, not a migration one.
 *
 * See `docs/post-write-rules.md` for what production permits today and what
 * the repository intended.
 */
export interface PostPolicyOptions {
  /** Freeze type/content_kind/article_format while a submission is in review,
   *  and restrict its status moves to the author-legitimate subset. */
  freezeClassificationInReview?: boolean;
  /** Treat `content_kind = 'research'` as editorial even when `type` is not. */
  classifyByContentKind?: boolean;
}

/** Production, exactly as it behaves today. */
export const LIVE_POLICY: PostPolicyOptions = {};

/** What `20260720000001` intended. Not active anywhere yet. */
export const REPO_POLICY: PostPolicyOptions = {
  freezeClassificationInReview: true,
  classifyByContentKind: true,
};

// ── The rules ────────────────────────────────────────────────────────

function isOwner(actor: PostActor, post: PostStateSnapshot): boolean {
  return actor.kind === "author" && actor.userId === post.author_id;
}

function isPrivileged(actor: PostActor): boolean {
  return actor.kind === "editor" || actor.kind === "admin" || actor.kind === "system";
}

/**
 * May this actor write to this post at all, before considering what the write
 * says?
 *
 * The three unconditional locks come first, because they hold even for the
 * owner and even for an edit that changes nothing interesting.
 */
export function canWriteToPost(
  actor: PostActor,
  post: PostStateSnapshot,
  options: PostPolicyOptions = LIVE_POLICY
): PolicyDecision {
  if (!isOwner(actor, post) && !isPrivileged(actor)) {
    return deny("not_owner", "The viewer does not own this post.");
  }

  // Moderation removed it. Nothing below `system` touches it again, owner
  // included: an author editing their way out of a moderation decision is the
  // failure this prevents.
  if (post.status === "removed" && actor.kind !== "system") {
    return deny("removed_post", "This post was removed and cannot be modified.");
  }

  // Terminal in the same way, and for a sharper reason: flipping a withdrawn
  // submission back to pending would resurrect it outside any resubmission
  // flow, with retired reviewer assignments and a stale editorial history.
  if (post.status === "withdrawn" && actor.kind !== "system") {
    return deny(
      "withdrawn_post",
      "This submission was withdrawn and cannot be modified."
    );
  }

  // Locked after acceptance so the citation record stays stable.
  if (
    post.status === "published" &&
    requiresEditorialPublication(post, options) &&
    !isPrivileged(actor)
  ) {
    return deny(
      "locked_publication",
      "This publication is locked after acceptance and cannot be modified directly."
    );
  }

  return allow;
}

/**
 * The two columns that are evidence a workflow completed.
 *
 * Rejected in either direction: setting, clearing and replacing are all
 * refused. `lib/contentModel.ts` treats a non-null value as proof of formal
 * review, so an author who can write one can award themselves a citation, and
 * an author who can clear one can erase somebody else's.
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
      "citation_id can only be assigned by the editorial acceptance workflow."
    );
  }
  if (
    "published_version_id" in patch &&
    patch.published_version_id !== post.published_version_id
  ) {
    return deny(
      "published_version_id_forbidden",
      "published_version_id can only be assigned by the editorial acceptance workflow."
    );
  }
  return allow;
}

export interface TransitionRequest {
  actor: PostActor;
  post: PostStateSnapshot;
  nextStatus: PostStatus;
  /** Only for a request that also changes classification, which is refused
   *  outright while a submission is in review under REPO_POLICY. */
  nextClassification?: {
    type?: string;
    content_kind?: string | null;
    article_format?: string | null;
  };
}

/**
 * May this actor move this post from where it is to where they want it?
 *
 * The order matters and mirrors the trigger's: the unconditional locks, then
 * self-publication, then the frozen-classification window, then the table.
 * Checking the table first would report "illegal transition" for a write that
 * is actually refused because the post was removed, which is a worse message
 * and a worse log line.
 */
export function checkTransition(
  request: TransitionRequest,
  options: PostPolicyOptions = LIVE_POLICY
): PolicyDecision {
  const { actor, post, nextStatus } = request;

  const writable = canWriteToPost(actor, post, options);
  if (!writable.allowed) return writable;

  // The trigger's first check, and the one with the most product weight: an
  // author may not produce a row claiming to be an accepted, formally
  // reviewed publication.
  if (
    nextStatus === "published" &&
    !isPrivileged(actor) &&
    requiresEditorialPublication(
      {
        type: request.nextClassification?.type ?? post.type,
        content_kind:
          request.nextClassification?.content_kind !== undefined
            ? request.nextClassification.content_kind
            : post.content_kind,
      },
      options
    )
  ) {
    return deny(
      "self_publish_reviewed",
      "Research and policy briefs can only be published by an editor accepting a submission."
    );
  }

  // REPO_ONLY. Off by default; see PostPolicyOptions.
  if (
    options.freezeClassificationInReview &&
    (post.status === "pending" || post.status === "pending_revision") &&
    requiresEditorialPublication(post, options) &&
    !isPrivileged(actor)
  ) {
    const next = request.nextClassification;
    if (
      next &&
      ((next.type !== undefined && next.type !== post.type) ||
        (next.content_kind !== undefined &&
          (next.content_kind ?? null) !== post.content_kind) ||
        (next.article_format !== undefined &&
          (next.article_format ?? null) !== post.article_format))
    ) {
      return deny(
        "classification_frozen",
        "A submission awaiting review or in revision cannot change its classification."
      );
    }

    if (post.status === "pending" && nextStatus !== "pending") {
      return deny(
        "illegal_transition",
        "A submission awaiting review can only be changed by the editorial decision workflow."
      );
    }
    if (
      post.status === "pending_revision" &&
      nextStatus !== "pending_revision" &&
      nextStatus !== "pending"
    ) {
      return deny(
        "illegal_transition",
        "A submission in revision can only stay in revision or be resubmitted for review."
      );
    }
  }

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

  const editorial = requiresEditorialPublication(post, options);

  if (rule.forbiddenForEditorialTypes && editorial && !isPrivileged(actor)) {
    return deny(
      "self_publish_reviewed",
      "Research and policy briefs can only be published by an editor accepting a submission."
    );
  }

  if (rule.editorialTypesOnly && !editorial) {
    return deny(
      "withdraw_not_eligible",
      "Only a research paper or policy brief submission can be withdrawn."
    );
  }

  return allow;
}

/**
 * May this actor hard-delete this post?
 *
 * Drafts only, for everyone below `system`. Everything else is withdrawn,
 * rejected or removed instead, so the editorial record survives the author
 * changing their mind.
 */
export function checkDelete(
  actor: PostActor,
  post: PostStateSnapshot,
  options: PostPolicyOptions = LIVE_POLICY
): PolicyDecision {
  if (!isOwner(actor, post) && actor.kind !== "system" && actor.kind !== "admin") {
    return deny("not_owner", "The viewer does not own this post.");
  }

  if (actor.kind === "system") return allow;

  if (post.status !== "draft") {
    return deny(
      "delete_non_draft",
      "Only drafts can be deleted directly. Withdraw a submission instead of deleting it."
    );
  }

  return canWriteToPost(actor, post, options);
}

/** Does this patch actually change how the post is classified, as opposed to
 *  writing the same values back? The composer derives classification from the
 *  stored row and rewrites it on every save, so "present in the patch" and
 *  "changed" are very different questions. */
export function changesClassification(
  post: PostStateSnapshot,
  patch: Record<string, unknown>
): boolean {
  return CLASSIFICATION_COLUMNS.some(
    (column) =>
      column in patch && (patch[column] ?? null) !== (post[column] ?? null)
  );
}

/**
 * A composer write: content plus classification, while the piece is still the
 * author's to shape.
 *
 * Separate from `checkContentEdit` because the two have different allowlists
 * and the difference is the whole point. An ordinary edit may not touch
 * classification; composing may. Collapsing them would mean either forbidding
 * the composer from doing its job or letting an edit reclassify a submission.
 */
export function checkComposition(
  actor: PostActor,
  post: PostStateSnapshot,
  patch: Record<string, unknown>,
  options: PostPolicyOptions = LIVE_POLICY
): PolicyDecision {
  const writable = canWriteToPost(actor, post, options);
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

  const reclassifying = changesClassification(post, patch);

  // A published post's classification is the published record. Changing it
  // after the fact rewrites what readers and citations already refer to,
  // whatever the type is.
  if (reclassifying && post.status === "published") {
    return deny(
      "classification_frozen",
      "A published post cannot be reclassified."
    );
  }

  // REPO_ONLY. Production permits this today; see PostPolicyOptions.
  if (
    options.freezeClassificationInReview &&
    reclassifying &&
    (post.status === "pending" || post.status === "pending_revision") &&
    requiresEditorialPublication(post, options)
  ) {
    return deny(
      "classification_frozen",
      "A submission awaiting review or in revision cannot change its classification."
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
  patch: Record<string, unknown>,
  options: PostPolicyOptions = LIVE_POLICY
): PolicyDecision {
  const writable = canWriteToPost(actor, post, options);
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
