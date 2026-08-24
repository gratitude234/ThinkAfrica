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
}

function text(value: string | null | undefined) {
  return value?.trim() || null;
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
  };
}
