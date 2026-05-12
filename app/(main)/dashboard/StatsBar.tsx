interface StatsBarProps {
  totalViews: number;
  publishedCount: number;
  reviewedCount: number;
  sourceBackedCount: number;
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
  publishedCount,
  reviewedCount,
  sourceBackedCount,
}: StatsBarProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <StatCard label="Published" value={publishedCount} color="text-emerald-brand" />
      <StatCard label="Reviewed / Citable" value={reviewedCount} color="text-blue-600" />
      <StatCard label="Source-backed" value={sourceBackedCount} color="text-amber-600" />
      <StatCard label="Total Views" value={totalViews} />
    </div>
  );
}
