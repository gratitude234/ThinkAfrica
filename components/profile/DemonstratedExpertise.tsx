import Link from "next/link";
import {
  buildExpertiseSummary,
  PROFILE_EXPERTISE_LIMIT,
  type TopicEvidence,
} from "@/lib/demonstratedExpertise";
import { buildProfileRecordHref } from "@/lib/profileRecord";

/**
 * What an author's published work shows they work on, with the evidence.
 *
 * Subordinate to Featured Work and the Intellectual Record by design: this is
 * a summary of the work, and the work itself is the thing worth reading. It
 * is hidden entirely from visitors when no topic qualifies, so a new profile
 * does not carry an empty section explaining what it does not have.
 *
 * Every number here is inspectable: the topic label links into the record
 * filtered to that topic, so a reader can go and count for themselves.
 */
export default function DemonstratedExpertise({
  username,
  topics,
  isOwnProfile,
  limit = PROFILE_EXPERTISE_LIMIT,
}: {
  username: string;
  topics: TopicEvidence[];
  isOwnProfile: boolean;
  limit?: number;
}) {
  const shown = topics.slice(0, limit);

  if (shown.length === 0) {
    if (!isOwnProfile) return null;
    return (
      <section
        id="demonstrated-expertise"
        aria-labelledby="demonstrated-expertise-title"
        className="rounded-xl border border-dashed border-card-border bg-card p-5 sm:p-6"
      >
        <h2
          id="demonstrated-expertise-title"
          className="font-display text-xl font-semibold text-ink"
        >
          Demonstrated expertise
        </h2>
        <p className="mt-2 max-w-[60ch] text-sm leading-6 text-ink-muted">
          A topic appears here once your published work carries it twice, or
          once with a completed review, an inbound citation, or a citation
          record. Tag your work when you publish so a reader can find the
          thread through it.
        </p>
      </section>
    );
  }

  return (
    <section
      id="demonstrated-expertise"
      aria-labelledby="demonstrated-expertise-title"
      className="space-y-4"
    >
      <div className="flex flex-col gap-3 border-b border-card-border pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-ink">
            Evidence
          </p>
          <h2
            id="demonstrated-expertise-title"
            className="font-display mt-1 text-xl font-semibold text-ink"
          >
            Demonstrated expertise
          </h2>
        </div>
        {topics.length > shown.length ? (
          <Link
            href={buildProfileRecordHref({ username })}
            className="tap-target focus-ring text-sm font-semibold text-emerald-ink hover:underline"
          >
            See all demonstrated topics →
          </Link>
        ) : null}
      </div>

      <ul className="space-y-4">
        {shown.map((topic) => (
          <li key={topic.key}>
            <h3 className="text-sm font-semibold text-ink">
              <Link
                href={buildProfileRecordHref({ username, topic: topic.key })}
                /* Says what the link opens, rather than making a screen
                   reader guess from the topic name alone. */
                aria-label={`${topic.label}: see the ${topic.contributionCount} contributions behind this in the Intellectual Record`}
                className="focus-ring hover:underline"
              >
                {topic.label}
              </Link>
            </h3>
            <p className="mt-1 max-w-[68ch] text-sm leading-6 text-ink-soft">
              {buildExpertiseSummary(topic)}
            </p>
            {topic.representativeWorks.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {topic.representativeWorks.map((work) => (
                  <li key={work.postId}>
                    <Link
                      href={`/post/${work.slug}`}
                      className="tap-target focus-ring text-xs font-medium text-emerald-ink hover:underline"
                    >
                      {work.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="text-xs leading-5 text-ink-muted">
        Counted from tags on published work. Declared interests are listed
        separately under Background and are not evidence.
      </p>
    </section>
  );
}
