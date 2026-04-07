import Link from "next/link";

interface Props {
  userId: string;
  hasPublished: boolean;
  hasFollowed: boolean;
  hasDebated: boolean;
}

export default function ActivationBanner({
  hasPublished,
  hasFollowed,
  hasDebated,
}: Props) {
  if (hasPublished && hasFollowed && hasDebated) return null;

  const doneCount = [hasPublished, hasFollowed, hasDebated].filter(Boolean).length;

  const items = [
    { label: "Write your first post", href: "/write", done: hasPublished },
    { label: "Follow someone", href: "/leaderboard", done: hasFollowed },
    { label: "Join a debate", href: "/debates", done: hasDebated },
  ];

  return (
    <div className="bg-emerald-50/40 border border-gray-200 border-l-4 border-l-emerald-500 rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-800">
          Get activated — {doneCount}/3 complete
        </p>
        <div className="flex gap-1.5">
          {items.map((item, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full ${item.done ? "bg-emerald-500" : "bg-gray-300"}`}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2 flex-1 min-w-0"
          >
            {item.done ? (
              <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-3 h-3 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </span>
            ) : (
              <span className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
            )}
            {item.done ? (
              <span className="text-sm text-gray-400 line-through truncate">
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="text-sm text-emerald-700 hover:text-emerald-800 font-medium hover:underline truncate"
              >
                {item.label} →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
