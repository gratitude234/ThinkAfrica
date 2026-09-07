import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

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
 * the application authenticates to itself, so the decision moves here, in
 * front of the statement. The trigger stays: this module deliberately runs its
 * delete through the viewer's own client rather than the service role, so RLS
 * and the trigger remain underneath as a backstop for as long as they exist.
 */

/** The only status an author may hard-delete. Everything else is withdrawn,
 *  rejected, published or under review, and `guard_locked_post_write` refuses
 *  it in the database too. */
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

type PostOwnershipRow = { id: string; author_id: string; status: string };

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
    .select("id, author_id, status")
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
    if (!row || row.author_id !== input.viewerId) {
      plan.missing.push(id);
      continue;
    }
    if (row.status !== DELETABLE_POST_STATUS) {
      plan.refused.push(id);
      continue;
    }
    plan.deletable.push(id);
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
