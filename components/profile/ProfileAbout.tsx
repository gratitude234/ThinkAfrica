import Link from "next/link";
import type { ReactNode } from "react";
import { getProfileHeadline } from "@/lib/profileIdentity";
import { formatInterestLabel } from "@/lib/profileTopics";
import type { ProfileIdentityRecord } from "@/lib/profileViewData";
import { getExactCanonicalTag, normalizeTagValue } from "@/lib/tags";

function text(value: string | null | undefined) {
  return value?.trim() || null;
}

/**
 * An interest links out only when it names a real platform topic. Interests
 * include free text from older signups, and a topic page for a word nobody has
 * tagged would be empty.
 */
function interestTopicHref(interest: string) {
  const canonical = getExactCanonicalTag(interest);
  if (!canonical) return null;
  return `/topics/${encodeURIComponent(normalizeTagValue(canonical))}`;
}

function joinedLabel(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-6">
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
        {label}
      </dt>
      <dd className="min-w-0 text-[15px] leading-relaxed text-ink-soft">{children}</dd>
    </div>
  );
}

/**
 * What a writer says about themselves: bio, headline, location, education,
 * interests, and when they joined. Nothing else, and nothing here is scored,
 * counted or presented as a credential. Education is an ordinary fact a
 * member may add, shown only when they did.
 */
export default function ProfileAbout({
  profile,
  isOwnProfile,
}: {
  profile: ProfileIdentityRecord;
  isOwnProfile: boolean;
}) {
  const bio = text(profile.bio);
  const headline = getProfileHeadline(profile);
  const location = text(profile.country);
  const field = text(profile.field_of_study);
  const university = text(profile.university);
  const graduationYear = profile.graduation_year;
  const hasEducation = Boolean(field || university || graduationYear);
  const interests = [
    ...new Map(
      (profile.interests ?? [])
        .map((interest) => interest.trim())
        .filter(Boolean)
        .map((interest) => [interest.toLowerCase(), interest])
    ).values(),
  ];
  const joined = joinedLabel(profile.created_at);

  return (
    <section aria-labelledby="profile-about-title">
      <div className="flex items-center justify-between gap-4">
        <h2 id="profile-about-title" className="sr-only">
          About
        </h2>
        {isOwnProfile ? (
          <Link
            href="/settings/profile"
            className="tap-target focus-ring ml-auto text-sm font-semibold text-emerald-ink"
          >
            Edit profile
          </Link>
        ) : null}
      </div>

      <dl className="divide-y divide-card-border">
        {bio ? (
          <Row label="Bio">
            <p className="whitespace-pre-line">{bio}</p>
          </Row>
        ) : null}
        {headline ? <Row label="Headline">{headline}</Row> : null}
        {location ? <Row label="Location">{location}</Row> : null}
        {hasEducation ? (
          <Row label="Education">
            {field ? <p className="text-ink">{field}</p> : null}
            {university ? <p>{university}</p> : null}
            {graduationYear ? <p className="text-sm text-ink-muted">{graduationYear}</p> : null}
          </Row>
        ) : null}
        {interests.length > 0 ? (
          <Row label="Interests">
            <ul className="flex flex-wrap gap-2">
              {interests.map((interest) => {
                const href = interestTopicHref(interest);
                const label = formatInterestLabel(interest);
                const chip =
                  "inline-flex items-center rounded-full border border-card-border bg-canvas px-3 py-1.5 text-xs font-medium text-ink-soft";
                return (
                  <li key={interest}>
                    {href ? (
                      <Link href={href} className={`tap-target focus-ring hover:text-ink ${chip}`}>
                        {label}
                      </Link>
                    ) : (
                      <span className={chip}>{label}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Row>
        ) : null}
        {joined ? <Row label="Joined">{joined}</Row> : null}
      </dl>
    </section>
  );
}
