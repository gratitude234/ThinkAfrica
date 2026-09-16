interface StatsBarProps {
  publishedCount: number;
  draftCount: number;
  totalViews: number;
  totalLikes: number;
}

function StatCard({
  label,
  value,
  color = "text-gray-900",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
      <p className={`text-2xl font-bold ${color}`}>
        {value.toLocaleString()}
      </p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </div>
  );
}

/**
 * Four plain numbers about the writer's own work. Views and likes count
 * published work only; a draft has neither.
 */
export default function StatsBar({
  publishedCount,
  draftCount,
  totalViews,
  totalLikes,
}: StatsBarProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <StatCard label="Published" value={publishedCount} color="text-emerald-brand" />
      <StatCard label="Drafts" value={draftCount} />
      <StatCard label="Views" value={totalViews} />
      <StatCard label="Likes" value={totalLikes} />
    </div>
  );
}
