"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  deleteOwnedDraftPosts,
  planPostDeletion,
} from "@/lib/postDeletion";
import {
  fail,
  ok,
  requireViewer,
  type ActionResult,
  NOT_FOUND_OR_FORBIDDEN,
  NOT_SIGNED_IN,
} from "@/lib/serverActions";

/**
 * Draft deletion, for the dashboard table and the composer's draft list.
 *
 * Both used to issue `supabase.from("posts").delete().eq("id", id)` from the
 * browser. One server boundary replaces both, because they are the same
 * operation asked twice: the dashboard deletes one draft, the composer sweeps
 * several, and neither needs its own authorization story.
 *
 * The viewer comes from the session. The caller sends ids and nothing else;
 * there is deliberately no author id in the input, because an input is
 * something a browser can choose.
 */

/** A sweep of abandoned scraps is the largest legitimate call. Anything past
 *  this is not a user clearing their drafts. */
const MAX_IDS_PER_CALL = 50;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DeletePostsResult {
  /** Ids that are gone. The client removes exactly these from its list. */
  deleted: string[];
  /** Present when some ids were owned drafts and others were not, so the UI
   *  can say what happened without a second round trip. */
  refusedCount: number;
}

export async function deleteOwnDraftPosts(input: {
  postIds: string[];
}): Promise<ActionResult<DeletePostsResult>> {
  const viewer = await requireViewer();
  if (!viewer) return fail(NOT_SIGNED_IN);

  const requested = [...new Set(input.postIds ?? [])].filter(
    (id): id is string => typeof id === "string" && UUID_PATTERN.test(id)
  );

  if (requested.length === 0) {
    return fail("Nothing was selected to delete.");
  }
  if (requested.length > MAX_IDS_PER_CALL) {
    return fail(`You can delete at most ${MAX_IDS_PER_CALL} drafts at once.`);
  }

  const supabase = await createClient();

  const planned = await planPostDeletion(supabase, {
    postIds: requested,
    viewerId: viewer.userId,
  });
  if ("error" in planned) {
    return fail("Could not check those drafts. Try again.");
  }

  const { deletable, refused, missing } = planned.plan;

  if (deletable.length === 0) {
    if (refused.length > 0) {
      return fail(
        "Only drafts can be deleted. Withdraw a submission instead of deleting it."
      );
    }
    return fail(NOT_FOUND_OR_FORBIDDEN);
  }

  const result = await deleteOwnedDraftPosts(supabase, {
    postIds: deletable,
    viewerId: viewer.userId,
  });
  if ("error" in result) {
    return fail("Could not delete that. Try again.");
  }

  // The plan said these rows were deletable and the statement disagreed, which
  // means something changed in between. Reported rather than smoothed over: the
  // caller's list is about to be updated from this array and a silent
  // difference would leave a row on screen that is still in the database.
  if (result.deleted.length !== deletable.length) {
    console.warn(
      `[deleteOwnDraftPosts] planned ${deletable.length}, deleted ${result.deleted.length}`
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/write");

  return ok({
    deleted: result.deleted,
    refusedCount: refused.length + missing.length,
  });
}
