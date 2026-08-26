export interface PublicProfileIdentity {
  id: string;
  username: string;
  full_name: string | null;
  country: string | null;
  university: string | null;
  field_of_study: string | null;
  graduation_year?: number | null;
  is_alumni?: boolean;
  bio: string | null;
  avatar_url: string | null;
  cover_image_url?: string | null;
  verified: boolean;
  verified_type: string | null;
  profile_type?: string | null;
  professional_title?: string | null;
  organization_name?: string | null;
  organization_website?: string | null;
  /**
   * The author's own answer to "what are you trying to understand?". Public,
   * optional, and deliberately not a job title: see
   * `POSITIONING_STATEMENT_MAX_LENGTH`.
   */
  positioning_statement?: string | null;
}

/**
 * One sentence, not a paragraph. The bio next to it already holds 300
 * characters, and a positioning statement that runs longer than a headline
 * stops functioning as one. 180 also survives two lines at the size the
 * profile renders it, on a 390px phone, without pushing the record down the
 * page. Mirrored by a CHECK constraint in
 * supabase/migrations/20260826000001_profile_positioning_statement.sql.
 */
export const POSITIONING_STATEMENT_MAX_LENGTH = 180;

export const POSITIONING_STATEMENT_LABEL = "Intellectual focus";

export const POSITIONING_STATEMENT_PROMPT =
  "What subjects, problems, or questions are you trying to understand?";

export const POSITIONING_STATEMENT_HELPER =
  "Describe the subjects, problems, or questions you are trying to understand.";

export const POSITIONING_STATEMENT_EXAMPLE =
  "Why Nigerian state budgets rarely survive contact with local government, and what a workable audit trail would look like.";

function text(value: string | null | undefined) {
  return value?.trim() || null;
}

/**
 * Collapses the newlines a paste introduces: this reads as one line under the
 * author's name, so a stored line break would open a gap the editor never saw.
 */
export function normalizePositioningStatement(
  value: string | null | undefined
): string | null {
  const collapsed = value?.replace(/\s+/g, " ").trim();
  return collapsed ? collapsed : null;
}

export function getPositioningStatementError(
  value: string | null | undefined
): string | null {
  const normalized = normalizePositioningStatement(value);
  if (!normalized) return null;
  if (normalized.length > POSITIONING_STATEMENT_MAX_LENGTH) {
    return `Keep your intellectual focus to ${POSITIONING_STATEMENT_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

export function getProfileIdentityLines(profile: PublicProfileIdentity) {
  const professionalTitle = text(profile.professional_title);
  const organization = text(profile.organization_name);
  const university = text(profile.university);
  const field = text(profile.field_of_study);
  const country = text(profile.country);
  const studentIdentity = profile.profile_type === "student";

  let headline = professionalTitle;
  if (!headline && studentIdentity) {
    if (profile.is_alumni) {
      headline = field ? `${field} graduate` : "Graduate";
    } else {
      headline = field ? `${field} student` : "Student";
    }
  }
  if (!headline) headline = "Writer on Indegenius";

  return {
    headline,
    affiliation: [organization ?? university, country]
      .filter(Boolean)
      .join(" · "),
    positioning: normalizePositioningStatement(profile.positioning_statement),
  };
}

/**
 * The page description, in the order a reader would want it: what the author
 * says they are working on, then what they wrote about themselves, then the
 * identity line the profile derives.
 */
export function getProfileMetaDescription(
  profile: PublicProfileIdentity,
  name: string
) {
  const identity = getProfileIdentityLines(profile);
  if (identity.positioning) return identity.positioning;

  const bio = text(profile.bio);
  if (bio) return bio;

  return `${identity.headline}${
    identity.affiliation ? ` at ${identity.affiliation}` : ""
  }. View ${name}'s Intellectual Record on Indegenius.`;
}
