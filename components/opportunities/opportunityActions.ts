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
 * The three opportunity mutations that used to be issued from the browser:
 * saving an opportunity, unsaving it, and editing a talent profile.
 *
 * All three sent `user_id` from the client. That was safe only because RLS
 * refused a row whose `user_id` was not `auth.uid()`; the value itself was
 * whatever the component had been handed as a prop. Here the viewer comes from
 * the session and there is no user id in any input.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Saving an opportunity for later.
 *
 * The referenced fellowship is checked to exist before the row is written. The
 * foreign key would refuse a bad id anyway, but it would refuse it as a
 * constraint violation whose message names a constraint, and a saved-item
 * button is not a place to surface those.
 */
export async function toggleSavedOpportunity(input: {
  fellowshipId: string;
  save: boolean;
}): Promise<ActionResult<{ saved: boolean }>> {
  const viewer = await requireViewer();
  if (!viewer) return fail(NOT_SIGNED_IN);

  if (!UUID_PATTERN.test(input.fellowshipId ?? "")) {
    return fail(NOT_FOUND_OR_FORBIDDEN);
  }

  const supabase = await createClient();

  if (!input.save) {
    const { error } = await supabase
      .from("saved_opportunities")
      .delete()
      .eq("user_id", viewer.userId)
      .eq("fellowship_id", input.fellowshipId);

    if (error) {
      console.error("[opportunities] unsave failed", error);
      return fail("Could not update your saved list. Try again.");
    }
    // Deleting a row that was not there is not a failure: the requested state
    // is the achieved state, and a double click should not report an error.
    return ok({ saved: false });
  }

  const { data: fellowship, error: lookupError } = await supabase
    .from("fellowships")
    .select("id")
    .eq("id", input.fellowshipId)
    .maybeSingle();

  if (lookupError) {
    console.error("[opportunities] fellowship lookup failed", lookupError);
    return fail("Could not update your saved list. Try again.");
  }
  if (!fellowship) return fail(NOT_FOUND_OR_FORBIDDEN);

  const { error } = await supabase.from("saved_opportunities").upsert(
    { user_id: viewer.userId, fellowship_id: input.fellowshipId },
    { onConflict: "user_id,fellowship_id" }
  );

  if (error) {
    console.error("[opportunities] save failed", error);
    return fail("Could not update your saved list. Try again.");
  }

  return ok({ saved: true });
}

const OPPORTUNITY_TYPES = ["internship", "research", "fellowship", "job"] as const;
const TALENT_VISIBILITY = ["public", "partners_only", "private"] as const;

const MAX_SKILLS = 30;
const MAX_SKILL_LENGTH = 60;

export interface SaveTalentProfileInput {
  openToOpportunities: boolean;
  opportunityTypes: string[];
  cvUrl: string;
  linkedinUrl: string;
  skills: string[];
  visibility: string;
}

/**
 * The talent profile a member offers to partners.
 *
 * Both URL fields are validated rather than stored as typed: this row is
 * rendered to partners and to admins, so an unchecked value here is a link
 * those readers are invited to click. `javascript:` and `data:` are the ones
 * that matter, and an allowlist of two schemes is easier to be sure about than
 * a denylist.
 */
export async function saveTalentProfile(
  input: SaveTalentProfileInput
): Promise<ActionResult<null>> {
  const viewer = await requireViewer();
  if (!viewer) return fail(NOT_SIGNED_IN);

  const opportunityTypes = [...new Set(input.opportunityTypes ?? [])].filter(
    (type): type is (typeof OPPORTUNITY_TYPES)[number] =>
      (OPPORTUNITY_TYPES as readonly string[]).includes(type)
  );

  const visibility = (TALENT_VISIBILITY as readonly string[]).includes(
    input.visibility
  )
    ? input.visibility
    : "public";

  const skills = [
    ...new Set(
      (input.skills ?? [])
        .filter((skill): skill is string => typeof skill === "string")
        .map((skill) => skill.trim())
        .filter((skill) => skill.length > 0 && skill.length <= MAX_SKILL_LENGTH)
    ),
  ].slice(0, MAX_SKILLS);

  const cvUrl = normalizeLink(input.cvUrl);
  const linkedinUrl = normalizeLink(input.linkedinUrl);
  if (cvUrl === INVALID_LINK || linkedinUrl === INVALID_LINK) {
    return fail("Links must start with http:// or https://.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("talent_profiles").upsert(
    {
      user_id: viewer.userId,
      open_to_opportunities: Boolean(input.openToOpportunities),
      opportunity_types: opportunityTypes,
      cv_url: cvUrl,
      linkedin_url: linkedinUrl,
      skills,
      visibility,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("[opportunities] talent profile save failed", error);
    return fail("Could not save your opportunity profile. Try again.");
  }

  revalidatePath("/opportunities");
  revalidatePath("/talent");
  return ok();
}

const INVALID_LINK = Symbol("invalid-link");

function normalizeLink(value: string | null | undefined): string | null | typeof INVALID_LINK {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.length > 2048) return INVALID_LINK;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return INVALID_LINK;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return INVALID_LINK;
  }
  return parsed.toString();
}
