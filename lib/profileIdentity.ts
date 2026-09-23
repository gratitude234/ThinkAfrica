/**
 * The identity a writer's profile header and page metadata render.
 *
 * The publishing reset, Phase 2G, reduced it to what a public writer profile
 * shows: a name, a username, a photo, an optional one-line headline and an
 * optional bio. The persona label, the derived "Political Science student"
 * line, the organisation line and the "intellectual focus" statement are gone;
 * a member who wants a line under their name writes it themselves.
 */
export interface PublicProfileIdentity {
  id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  /** The member's own headline. Stored in `profiles.professional_title`. */
  professional_title?: string | null;
  verified?: boolean;
}

/** A headline is one line under a name, not a paragraph. */
export const PROFILE_HEADLINE_MAX_LENGTH = 120;

export const PROFILE_BIO_MAX_LENGTH = 300;

export const PROFILE_NAME_MAX_LENGTH = 120;

export function getProfileDisplayName(profile: {
  full_name: string | null;
  username: string;
}) {
  return profile.full_name?.trim() || profile.username;
}

/** The headline as it reads under a name, with pasted line breaks collapsed. */
export function getProfileHeadline(profile: {
  professional_title?: string | null;
  verified?: boolean;
}): string | null {
  const collapsed = profile.professional_title?.replace(/\s+/g, " ").trim();
  return collapsed ? collapsed : null;
}

export function getProfileTitle(profile: {
  full_name: string | null;
  username: string;
  professional_title?: string | null;
  verified?: boolean;
}) {
  const name = getProfileDisplayName(profile);
  const headline = getProfileHeadline(profile);
  return headline ? `${name}: ${headline}` : name;
}

/** What the writer said about themselves, or a plain line when they said nothing. */
export function getProfileMetaDescription(
  profile: { bio: string | null; professional_title?: string | null },
  name: string
) {
  const bio = profile.bio?.trim();
  if (bio) return bio;

  const headline = getProfileHeadline(profile);
  return headline
    ? `${headline}. Posts and Articles by ${name} on Indegenius.`
    : `Posts and Articles by ${name} on Indegenius.`;
}
