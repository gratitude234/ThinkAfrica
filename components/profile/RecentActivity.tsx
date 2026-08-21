import Link from "next/link";
import { formatRelativeTime } from "@/lib/utils";

/**
 * Private engagement history. Lives on the dashboard rather than the profile:
 * it is visible only to the account owner, and it reports what the owner has
 * been reading and reacting to, not what they have contributed. On the public
 * profile it read as record content while never being visible to any reader.
 */

export type RecentActivityType = "like" | "response" | "debate";

export interface RecentActivityItem {
  type: RecentActivityType;
  description: string;
  link: string;
  created_at: string;
}

const TYPE_LABELS: Record<RecentActivityType, string> = {
  like: "Like",
  response: "Response",
  debate: "Debate",
};

export default function RecentActivity({
  items,
}: {
  items: RecentActivityItem[];
}) {
  return (
    <section aria-labelledby="recent-activity-title" className="mt-10">
      <h2
        id="recent-activity-title"
        className="text-lg font-semibold text-ink"
      >
        Your recent activity
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Private to you. Useful for tracking your latest engagement.
      </p>

      {items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-card-border bg-card p-6 text-sm text-ink-muted">
          No recent activity yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item, index) => (
            <li key={`${item.type}-${item.created_at}-${index}`}>
              <Link
                href={item.link}
                className="flex items-start gap-3 rounded-xl border border-card-border bg-card p-4 transition-colors hover:border-card-border-hover"
              >
                <span className="mt-0.5 rounded-full bg-canvas px-2 py-0.5 text-kicker font-semibold uppercase text-ink-muted">
                  {TYPE_LABELS[item.type]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-soft">{item.description}</p>
                  <p className="mt-0.5 text-meta text-ink-muted">
                    {formatRelativeTime(item.created_at)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
