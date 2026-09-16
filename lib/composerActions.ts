"use server";

import { composerRepository } from "@/lib/db/readAdapter";
import {
  RESUMABLE_LIMIT,
  REVISION_LIMIT,
} from "@/lib/composerLimits";
import { getCurrentUser } from "@/lib/serverAuth";
import { createClient } from "@/lib/supabase/server";

import type { ResumableDraftRow, RevisionRow } from "@/lib/db/composer";

/**
 * The composer's reads, on the server.
 *
 * Five client components used to run these against the anon key: the draft
 * list, the resume prompt, revision history, the co-author picker (twice), and
 * the username check (twice). RLS made each of them safe and has no successor,
 * because after the migration there is no key a browser can hold.
 *
 * Server actions rather than route handlers, because every one of these is an
 * authenticated fetch tied to something the member is doing rather than a
 * pollable resource. Nothing here is public, and nothing here is cacheable.
 *
 * ## The shape every result uses
 *
 * A discriminated result, not a bare array. This migration has repeatedly
 * found reads whose failure was indistinguishable from an empty answer, and a
 * draft list that renders "no drafts" during an outage is exactly that bug.
 * The caller has to decide what to show, so it has to be told which happened.
 */

export type ComposerResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "unauthorized" | "not-found" | "unavailable" };

const UNAUTHORIZED = { ok: false, reason: "unauthorized" } as const;
const UNAVAILABLE = { ok: false, reason: "unavailable" } as const;



export async function loadResumableDrafts(): Promise<
  ComposerResult<ResumableDraftRow[]>
> {
  const user = await getCurrentUser();
  if (!user) return UNAUTHORIZED;

  try {
    const supabase = await createClient();
    return {
      ok: true,
      data: await composerRepository(supabase).resumableDrafts(
        user.id,
        RESUMABLE_LIMIT
      ),
    };
  } catch (error) {
    console.error("[composer] resumable drafts failed", error);
    return UNAVAILABLE;
  }
}

/**
 * One post's revision history.
 *
 * The browser names the post; the server decides whether this viewer may read
 * it. `not-found` covers both a missing post and one the viewer has no access
 * to, deliberately: telling them apart would let a caller probe for the
 * existence of drafts they cannot see.
 */
export async function loadPostRevisions(
  postId: string
): Promise<ComposerResult<RevisionRow[]>> {
  const user = await getCurrentUser();
  if (!user) return UNAUTHORIZED;

  try {
    const supabase = await createClient();
    const revisions = await composerRepository(supabase).postRevisions(
      postId,
      user.id,
      REVISION_LIMIT
    );
    if (revisions === null) return { ok: false, reason: "not-found" };
    return { ok: true, data: revisions };
  } catch (error) {
    console.error("[composer] revisions failed", error);
    return UNAVAILABLE;
  }
}

/**
 * Whether a username is already taken by somebody else.
 *
 * The viewer is the session's, so a caller cannot ask whether a name is free
 * for another member. On failure this reports `unavailable` rather than
 * "available": telling somebody a name is free and then rejecting the submit
 * is worse than saying the check could not run.
 */
export async function checkUsernameAvailable(
  username: string
): Promise<ComposerResult<{ taken: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return UNAUTHORIZED;

  const normalized = username.trim().toLowerCase();
  if (normalized === "") return { ok: true, data: { taken: false } };

  try {
    const supabase = await createClient();
    return {
      ok: true,
      data: {
        taken: await composerRepository(supabase).isUsernameTaken(
          normalized,
          user.id
        ),
      },
    };
  } catch (error) {
    console.error("[composer] username check failed", error);
    return UNAVAILABLE;
  }
}
