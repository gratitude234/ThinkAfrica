import { getPointTier, getNextTier } from "@/lib/utils";

interface Props {
  points: number;
  showProgress?: boolean;
}

export default function PointsTierBadge({
  points,
  showProgress = false,
}: Props) {
  const tier = getPointTier(points);
  const nextTier = getNextTier(points);

  const progressPercent = nextTier
    ? Math.min(
        100,
        Math.round(((points - tier.min) / (nextTier.min - tier.min)) * 100)
      )
    : 100;

  return (
    <div className="inline-flex flex-col gap-1">
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tier.bg} ${tier.color}`}
      >
        {tier.name}
      </span>
      {showProgress && nextTier && (
        <div>
          <div className="flex items-center justify-between text-xs text-gray-400 mb-0.5">
            <span>{points} pts</span>
            <span>{nextTier.min} for {nextTier.name}</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden w-24">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
