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
 * Draft deletion, for the owner's Drafts tab on their profile.
 *
 * The dashboard table and the composer's draft list both used to issue
 * `supabase.from("posts").delete().eq("id", id)` from the browser. This server
 * boundary replaced them, and outlived both: the final UI simplification moved
 * draft management to the profile. It still accepts several ids, so a sweep
 * needs no authorization story of its own.
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
    // Refused means the writer's own piece, but not one the policy lets them
    // delete: it is past draft, or a moderator removed it. The plan does not
    // say which, so the message claims neither.
    if (refused.length > 0) {
      return fail(
        refused.length === 1
          ? "This draft can’t be deleted right now."
          : "These drafts can’t be deleted right now."
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

  revalidatePath("/[username]", "page");
  revalidatePath("/write");

  return ok({
    deleted: result.deleted,
    refusedCount: refused.length + missing.length,
  });
}
