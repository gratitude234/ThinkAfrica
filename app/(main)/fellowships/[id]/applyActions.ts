"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  fail,
  ok,
  requireViewer,
  type ActionResult,
  NOT_FOUND_OR_FORBIDDEN,
  NOT_SIGNED_IN,
} from "@/lib/serverActions";

/**
 * Applying to an opportunity.
 *
 * The browser used to insert into `fellowship_applications` with a `user_id`
 * it had been handed as a prop, and with every business rule enforced only by
 * the form: the 200-word minimum was a disabled button, the closed-opportunity
 * check was a rendered branch, and the "already applied" check was a different
 * rendered branch. None of them survived a request made any other way; the
 * unique constraint on `(fellowship_id, user_id)` was the only real one.
 *
 * All four are decided here now, before the insert.
 */

const MINIMUM_COVER_LETTER_WORDS = 200;
const MAX_COVER_LETTER_LENGTH = 20000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PostgREST's unique-violation code. Here it means the member already
 *  applied, which is a state to report rather than an error to raise. */
const UNIQUE_VIOLATION = "23505";

/** Not exported: a "use server" module may only export async functions, and
 *  every export in one becomes a callable endpoint. A word count does not need
 *  to be either. */
function countCoverLetterWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export async function submitFellowshipApplication(input: {
  fellowshipId: string;
  coverLetter: string;
  proofPostId: string | null;
}): Promise<ActionResult<null>> {
  const viewer = await requireViewer();
  if (!viewer) return fail(NOT_SIGNED_IN);

  if (!UUID_PATTERN.test(input.fellowshipId ?? "")) {
    return fail(NOT_FOUND_OR_FORBIDDEN);
  }

  const coverLetter = (input.coverLetter ?? "").trim();
  if (coverLetter.length > MAX_COVER_LETTER_LENGTH) {
    return fail("That cover letter is too long.");
  }
  if (countCoverLetterWords(coverLetter) < MINIMUM_COVER_LETTER_WORDS) {
    return fail(
      `Write at least ${MINIMUM_COVER_LETTER_WORDS} words in your cover letter.`
    );
  }

  const proofPostId =
    input.proofPostId && UUID_PATTERN.test(input.proofPostId)
      ? input.proofPostId
      : null;
  if (input.proofPostId && !proofPostId) {
    return fail("That piece of work could not be attached.");
  }

  const supabase = await createClient();

  const { data: fellowship, error: lookupError } = await supabase
    .from("fellowships")
    .select("id, status")
    .eq("id", input.fellowshipId)
    .maybeSingle<{ id: string; status: string }>();

  if (lookupError) {
    console.error("[fellowships] lookup failed", lookupError);
    return fail("Could not submit your application. Try again.");
  }
  if (!fellowship) return fail(NOT_FOUND_OR_FORBIDDEN);
  if (fellowship.status === "closed") {
    return fail("This opportunity is now closed.");
  }

  // The attached work has to be the applicant's own. Without this an applicant
  // could attach any post id and have someone else's publication rendered as
  // evidence of their own record in the admin review screen.
  if (proofPostId) {
    const { data: proof, error: proofError } = await supabase
      .from("posts")
      .select("id, author_id")
      .eq("id", proofPostId)
      .maybeSingle<{ id: string; author_id: string }>();

    if (proofError) {
      console.error("[fellowships] proof lookup failed", proofError);
      return fail("Could not submit your application. Try again.");
    }
    if (!proof || proof.author_id !== viewer.userId) {
      return fail("That piece of work could not be attached.");
    }
  }

  const { error } = await supabase.from("fellowship_applications").insert({
    fellowship_id: input.fellowshipId,
    user_id: viewer.userId,
    cover_letter: coverLetter,
    proof_post_id: proofPostId,
  });

  if (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      return fail("You have already applied to this opportunity.");
    }
    console.error("[fellowships] application insert failed", error);
    return fail("Could not submit your application. Try again.");
  }

  revalidatePath(`/fellowships/${input.fellowshipId}`);
  return ok();
}
