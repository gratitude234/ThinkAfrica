import Link from "next/link";
import type { PublicProfileIdentity } from "@/lib/profileIdentity";
import { buildProfileRecordHref } from "@/lib/profileRecord";

interface ResearchBackground {
  headline?: string | null;
  research_interests?: string[] | null;
  methods?: string[] | null;
  website_url?: string | null;
  orcid_url?: string | null;
}

function value(value: string | null | undefined) {
  return value?.trim() || null;
}

function safeExternalUrl(valueToCheck: string | null | undefined) {
  const candidate = value(valueToCheck);
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function BackgroundField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted">
        {label}
      </h3>
      <div className="mt-2 text-sm leading-6 text-ink-soft">{children}</div>
    </div>
  );
}

interface BackgroundInput {
  profile: PublicProfileIdentity;
  topics: string[];
  research?: ResearchBackground | null;
}

/**
 * Whether this section will render anything for a visitor. The page needs the
 * same answer to decide if its anchor nav should advertise a Background link,
 * and a new profile should not be pointed at an empty section.
 *
 * Country is deliberately not counted. `getProfileIdentityLines` already joins
 * it into the affiliation line the header prints under the author's name, so a
 * Location field here restated it on the same screen. With the field gone, a
 * country-only profile would otherwise open an empty section.
 */
export function hasBackgroundContent({ profile, topics, research }: BackgroundInput) {
  const hasEducation = Boolean(
    (profile.profile_type === "student" || profile.is_alumni) &&
      (value(profile.university) || value(profile.field_of_study) || profile.graduation_year)
  );
  const hasRole = Boolean(value(profile.professional_title) || value(profile.organization_name));
  const hasResearch = Boolean(
    research?.headline ||
      research?.research_interests?.length ||
      research?.methods?.length ||
      safeExternalUrl(research?.orcid_url) ||
      safeExternalUrl(research?.website_url)
  );

  return Boolean(
    hasEducation ||
      hasRole ||
      topics.length > 0 ||
      hasResearch ||
      profile.verified ||
      profile.is_alumni
  );
}

export default function ProfileBackground({
  profile,
  topics,
  research,
  isOwnProfile,
}: BackgroundInput & {
  isOwnProfile: boolean;
}) {
  const university = value(profile.university);
  const field = value(profile.field_of_study);
  const professionalTitle = value(profile.professional_title);
  const organization = value(profile.organization_name);
  const organizationWebsite = safeExternalUrl(profile.organization_website);
  const orcidUrl = safeExternalUrl(research?.orcid_url);
  const researchWebsite = safeExternalUrl(research?.website_url);

  const hasEducation = Boolean(
    (profile.profile_type === "student" || profile.is_alumni) &&
      (university || field || profile.graduation_year)
  );
  const hasRole = Boolean(professionalTitle || organization);
  const hasResearch = Boolean(
    research?.headline ||
      research?.research_interests?.length ||
      research?.methods?.length ||
      orcidUrl ||
      researchWebsite
  );
  const hasRecognition = profile.verified || profile.is_alumni;
  const hasContent = hasBackgroundContent({ profile, topics, research });

  if (!hasContent && !isOwnProfile) return null;

  return (
    <section
      aria-labelledby="profile-background-title"
      className="rounded-xl border border-card-border bg-card p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="profile-background-title" className="font-display text-xl font-semibold text-ink">
          Background
        </h2>
        {isOwnProfile ? (
          <Link
            href="/settings?tab=profile#profile-identity"
            className="tap-target focus-ring text-xs font-semibold text-emerald-ink"
          >
            Edit
          </Link>
        ) : null}
      </div>

      {hasContent ? (
        <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
          {hasEducation ? (
            <BackgroundField label="Education">
              {field ? <p className="font-medium text-ink">{field}</p> : null}
              {university ? <p>{university}</p> : null}
              {profile.graduation_year ? (
                <p className="text-xs text-ink-muted">
                  {profile.is_alumni ? "Graduated" : "Expected graduation"} {profile.graduation_year}
                </p>
              ) : null}
            </BackgroundField>
          ) : null}

          {hasRole ? (
            <BackgroundField label="Current role">
              {professionalTitle ? <p className="font-medium text-ink">{professionalTitle}</p> : null}
              {organization ? <p>{organization}</p> : null}
              {organizationWebsite ? (
                <a
                  href={organizationWebsite}
                  target="_blank"
                  rel="noreferrer"
                  className="tap-target focus-ring text-xs font-semibold text-emerald-ink hover:underline"
                >
                  Organisation website ↗
                </a>
              ) : null}
            </BackgroundField>
          ) : null}

          {topics.length > 0 ? (
            <BackgroundField label="Topics and expertise">
              <ul className="flex flex-wrap gap-2">
                {topics.slice(0, 8).map((topic) => (
                  <li key={topic}>
                    <Link
                      href={buildProfileRecordHref({ username: profile.username, topic })}
                      className="tap-target focus-ring inline-flex items-center rounded-full bg-green-tint px-3 py-1.5 text-xs font-medium text-emerald-brand hover:opacity-80"
                    >
                      {topic}
                    </Link>
                  </li>
                ))}
              </ul>
            </BackgroundField>
          ) : null}

          {hasResearch ? (
            <BackgroundField label="Research">
              {research?.headline ? <p className="font-medium text-ink">{research.headline}</p> : null}
              {research?.research_interests?.length ? (
                <p>{research.research_interests.slice(0, 5).join(" · ")}</p>
              ) : null}
              {research?.methods?.length ? (
                <p className="text-xs text-ink-muted">Methods: {research.methods.slice(0, 5).join(", ")}</p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                {orcidUrl ? (
                  <a href={orcidUrl} target="_blank" rel="noreferrer" className="tap-target focus-ring text-xs font-semibold text-emerald-ink">
                    ORCID ↗
                  </a>
                ) : null}
                {researchWebsite ? (
                  <a href={researchWebsite} target="_blank" rel="noreferrer" className="tap-target focus-ring text-xs font-semibold text-emerald-ink">
                    Research website ↗
                  </a>
                ) : null}
              </div>
            </BackgroundField>
          ) : null}

          {hasRecognition ? (
            <BackgroundField label="Recognition">
              <ul className="flex flex-wrap gap-2">
                {profile.verified ? (
                  <li className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {profile.verified_type ? `Verified ${profile.verified_type}` : "Verified profile"}
                  </li>
                ) : null}
                {profile.is_alumni ? (
                  <li className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                    Alumni
                  </li>
                ) : null}
              </ul>
            </BackgroundField>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink-muted">
          Add your education, current role, and topics to complete this section.
        </p>
      )}
    </section>
  );
}
