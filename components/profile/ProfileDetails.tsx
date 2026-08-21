import Link from "next/link";
import { getPointTier } from "@/lib/utils";

/**
 * Secondary profile context, kept deliberately below the record.
 *
 * Everything here is either reach (reads, likes, follows) or platform
 * recognition (badges, points tier). None of it is evidence that a
 * contribution was sourced, reviewed or cited, so none of it belongs in
 * RecordPanel -- keeping the two apart is what stops popularity from reading
 * as credibility.
 *
 * Replaces CredentialsCard, which reported the record's own counts a second
 * time and was rendered twice into the DOM (once per breakpoint).
 */

interface Badge {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
}

interface ProfileDetailsProps {
  username: string;
  points: number;
  badges: Badge[];
  topicStats: Array<{ tag: string; count: number }>;
  totalViews: number;
  totalLikes: number;
  followerCount: number;
  followingCount: number;
  isOpenToOpportunities: boolean;
  opportunityVisible: boolean;
  opportunityReadinessStatus: string;
  isOwnProfile: boolean;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-kicker font-semibold uppercase text-ink-muted">
        {label}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export default function ProfileDetails({
  username,
  points,
  badges,
  topicStats,
  totalViews,
  totalLikes,
  followerCount,
  followingCount,
  isOpenToOpportunities,
  opportunityVisible,
  opportunityReadinessStatus,
  isOwnProfile,
}: ProfileDetailsProps) {
  const tier = getPointTier(points);

  const opportunityStatus = isOpenToOpportunities
    ? opportunityVisible
      ? "Open and discoverable"
      : "Open with limited visibility"
    : "Not currently open";

  const reach = [
    { label: "Reads", value: totalViews },
    { label: "Likes", value: totalLikes },
  ];

  return (
    <section
      aria-labelledby="profile-details-title"
      className="rounded-xl border border-card-border bg-canvas p-6"
    >
      <h2
        id="profile-details-title"
        className="text-kicker font-semibold uppercase text-ink-muted"
      >
        Details
      </h2>

      <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Reach">
          <dl className="flex gap-6">
            {reach.map((item) => (
              <div key={item.label}>
                <dt className="sr-only">{item.label}</dt>
                <dd className="text-lg font-semibold tabular-nums text-ink">
                  {item.value.toLocaleString()}
                </dd>
                <p className="text-meta text-ink-muted">{item.label}</p>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-meta text-ink-muted">
            <Link
              href={`/${username}/followers`}
              className="font-medium text-ink-soft transition-colors hover:text-ink"
            >
              {followerCount.toLocaleString()} followers
            </Link>
            <span className="mx-1.5 text-divider">·</span>
            <Link
              href={`/${username}/following`}
              className="font-medium text-ink-soft transition-colors hover:text-ink"
            >
              {followingCount.toLocaleString()} following
            </Link>
          </p>
        </Field>

        {badges.length > 0 ? (
          <Field label="Recognition">
            <ul className="flex flex-wrap gap-2">
              {badges.map((badge) => (
                <li
                  key={badge.id}
                  title={badge.description ?? badge.name}
                  className="inline-flex items-center gap-1 rounded-full bg-gold-tint px-2.5 py-1 text-meta text-gold-ink"
                >
                  {badge.icon ? <span aria-hidden="true">{badge.icon}</span> : null}
                  <span>{badge.name}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-meta text-ink-muted">{tier.name}</p>
          </Field>
        ) : (
          <Field label="Contribution tier">
            <p className="text-sm font-medium text-ink">{tier.name}</p>
            <p className="mt-1 text-meta text-ink-muted">
              Earned through platform activity, not editorial review.
            </p>
          </Field>
        )}

        {topicStats.length > 0 ? (
          <Field label="Topics written on">
            <ul className="flex flex-wrap gap-2">
              {topicStats.slice(0, 8).map((topic) => (
                <li key={topic.tag}>
                  <Link
                    href={`/topics/${encodeURIComponent(topic.tag)}`}
                    className="inline-flex rounded-full bg-green-tint px-2.5 py-1 text-meta font-medium text-emerald-brand transition-opacity hover:opacity-80"
                  >
                    {topic.tag}
                    {topic.count > 1 ? (
                      <span className="ml-1 tabular-nums opacity-70">
                        {topic.count}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </Field>
        ) : null}

        {isOpenToOpportunities || isOwnProfile ? (
          <Field label="Opportunity status">
            <p className="text-sm font-medium text-ink">{opportunityStatus}</p>
            <p className="mt-1 text-meta text-ink-muted">
              {opportunityReadinessStatus}
            </p>
          </Field>
        ) : null}
      </div>
    </section>
  );
}
