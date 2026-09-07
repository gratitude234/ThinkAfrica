import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { checkDelete, type PostStateSnapshot } from "@/lib/postPolicy";

/**
 * Who may hard-delete a post, decided in application code.
 *
 * This used to be decided in three places at once: a UI that only rendered the
 * button for drafts, an RLS policy (`auth.uid() = author_id`), and the
 * `guard_locked_post_write` trigger (drafts only). The browser issued the
 * DELETE itself and relied on the last two to refuse anything the first got
 * wrong.
 *
 * Two of those three disappear when the database becomes a direct connection
 * the application authenticates to itself, so the decision moves in front of
 * the statement. The trigger stays: this module deliberately runs its delete
 * through the viewer's own client rather than the service role, so RLS and the
 * trigger remain underneath as a backstop for as long as they exist.
 *
 * The decision itself is NOT made here. It is `checkDelete()` from
 * lib/postPolicy.ts, the same function the single-post path uses, so there is
 * one statement of "an author may hard-delete their own draft and nothing
 * else" rather than one per call shape. What this module adds is the batch: a
 * partition of many ids into deletable, refused and missing, which the policy
 * has no opinion about because it decides about one post at a time.
 */

/** The only status an author may hard-delete. Kept as a named constant for
 *  the SQL predicate below; the *decision* is `checkDelete()`, and this must
 *  not drift from it. lib/postDeletion.test.ts pins that they agree. */
export const DELETABLE_POST_STATUS = "draft";

export type DeletionRefusal =
  | "not_found_or_forbidden"
  | "not_a_draft"
  | "query_failed";

export interface DeletionPlan {
  /** Ids the viewer owns and that are drafts. Safe to delete. */
  deletable: string[];
  /** Ids that exist and are the viewer's, but are past draft. */
  refused: string[];
  /** Ids that do not exist or are not the viewer's. Deliberately not
   *  distinguished from each other beyond this module. */
  missing: string[];
}

/** Everything `checkDelete` inspects. Wider than the two columns the old
 *  hand-rolled check needed, because the policy also refuses a removed or
 *  withdrawn post and a locked publication, and it cannot do that from a
 *  status alone. */
type PostOwnershipRow = PostStateSnapshot;

/**
 * Resolves what the viewer is actually allowed to delete.
 *
 * Reads ownership and status for the requested ids and partitions them. It
 * asks for `author_id` and compares in TypeScript rather than filtering by
 * `.eq("author_id", userId)`, because the two answer different questions: a
 * filtered query cannot tell "not yours" from "does not exist", and the
 * difference is what decides whether the caller is told nothing happened or
 * told nothing was permitted.
 */
export async function planPostDeletion(
  supabase: Pick<SupabaseClient, "from">,
  input: { postIds: string[]; viewerId: string }
): Promise<{ plan: DeletionPlan } | { error: DeletionRefusal }> {
  const requested = [...new Set(input.postIds)];
  if (requested.length === 0) {
    return { plan: { deletable: [], refused: [], missing: [] } };
  }

  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, author_id, status, type, content_kind, article_format, citation_id, published_version_id"
    )
    .in("id", requested);

  if (error) {
    console.error("[postDeletion] ownership lookup failed", error);
    return { error: "query_failed" };
  }

  const rows = (data ?? []) as PostOwnershipRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));

  const plan: DeletionPlan = { deletable: [], refused: [], missing: [] };
  for (const id of requested) {
    const row = byId.get(id);
    if (!row) {
      plan.missing.push(id);
      continue;
    }

    const decision = checkDelete(
      { kind: "author", userId: input.viewerId },
      row
    );

    if (decision.allowed) {
      plan.deletable.push(id);
      continue;
    }

    // "Not yours" and "does not exist" stay indistinguishable to the caller;
    // "yours, but not a draft" is the one refusal the author is supposed to
    // understand, because it tells them to withdraw instead.
    if (decision.refusal === "not_owner") plan.missing.push(id);
    else plan.refused.push(id);
  }

  return { plan };
}

/**
 * Deletes the planned ids and reports which rows actually went.
 *
 * The `author_id` and `status` predicates are repeated in the statement even
 * though `planPostDeletion` has already checked both. That is not redundancy
 * for its own sake: the plan is a read and the delete is a separate write, and
 * a post submitted for review in another tab between the two would otherwise
 * be deleted on the strength of a stale answer. `.select("id")` is what turns
 * the delete into something whose effect can be checked rather than assumed.
 */
export async function deleteOwnedDraftPosts(
  supabase: Pick<SupabaseClient, "from">,
  input: { postIds: string[]; viewerId: string }
): Promise<{ deleted: string[] } | { error: DeletionRefusal }> {
  if (input.postIds.length === 0) return { deleted: [] };

  const { data, error } = await supabase
    .from("posts")
    .delete()
    .in("id", input.postIds)
    .eq("author_id", input.viewerId)
    .eq("status", DELETABLE_POST_STATUS)
    .select("id");

  if (error) {
    console.error("[postDeletion] delete failed", error);
    return { error: "query_failed" };
  }

  return { deleted: ((data ?? []) as Array<{ id: string }>).map((row) => row.id) };
}
