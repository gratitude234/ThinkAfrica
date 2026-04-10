interface StatsBarProps {
  totalViews: number;
  totalLikes: number;
  publishedCount: number;
  followerCount: number;
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

export default function StatsBar({
  totalViews,
  totalLikes,
  publishedCount,
  followerCount,
}: StatsBarProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <StatCard label="Total Views" value={totalViews} />
      <StatCard label="Total Likes" value={totalLikes} color="text-red-500" />
      <StatCard label="Published" value={publishedCount} color="text-emerald-brand" />
      <StatCard label="Followers" value={followerCount} color="text-blue-600" />
    </div>
  );
}
