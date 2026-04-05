import Link from "next/link";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  cta?: { label: string; href: string };
}

export default function EmptyState({ icon, title, description, cta }: EmptyStateProps) {
  return (
    <div className="text-center py-16 px-4">
      {icon && <div className="text-4xl mb-3">{icon}</div>}
      <h3 className="text-base font-semibold text-gray-700 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-400 mb-5">{description}</p>}
      {cta && (
        <Link
          href={cta.href}
          className="inline-flex items-center px-4 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}

export const EMPTY_STATES = {
  posts: {
    icon: "📝",
    title: "No articles yet.",
    description: "Be the first to share your ideas with Africa.",
    cta: { label: "Write an article", href: "/write" },
  },
  debates: {
    icon: "⚡",
    title: "No debates yet.",
    description: "Start a conversation that matters.",
    cta: { label: "Start a debate", href: "/debates/create" },
  },
  webinars: {
    icon: "🎙",
    title: "No webinars scheduled yet.",
    description: "Be the first to host a live session.",
    cta: { label: "Host a webinar", href: "/webinars/create" },
  },
  fellowships: {
    icon: "🎓",
    title: "No open fellowships right now.",
    description: "Check back soon for new funding opportunities.",
    cta: undefined,
  },
} as const;
