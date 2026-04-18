import Link from "next/link";

const DISCOVERY_TOPICS = [
  "Law & Justice",
  "Economics",
  "Technology",
  "Public Health",
  "Politics & Governance",
  "Environment & Climate",
  "Education Policy",
  "African Culture",
];

export default function ForYouEmptyState() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
      <p className="text-base font-semibold text-gray-900">
        Nothing matches your interests yet.
      </p>
      <p className="mt-1 text-sm text-gray-500">
        Explore popular topics — tap any to follow.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {DISCOVERY_TOPICS.map((topic) => (
          <Link
            key={topic}
            href={`/topics/${encodeURIComponent(topic.toLowerCase())}`}
            className="rounded-full border border-gray-200 bg-canvas px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-emerald-brand hover:text-emerald-brand"
          >
            {topic}
          </Link>
        ))}
      </div>
    </div>
  );
}
