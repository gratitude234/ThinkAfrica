export function PostCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white animate-pulse">
      <div className="aspect-[16/9] w-full bg-gray-200" />
      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div className="h-5 w-16 rounded-full bg-gray-200" />
          <div className="h-3 w-12 rounded bg-gray-100" />
        </div>
        <div className="h-5 w-4/5 rounded bg-gray-200" />
        <div className="h-4 w-full rounded bg-gray-100" />
        <div className="h-4 w-3/4 rounded bg-gray-100" />
        <div className="mt-2 flex items-center gap-3 border-t border-gray-100 pt-2">
          <div className="h-8 w-8 flex-shrink-0 rounded-full bg-gray-200" />
          <div className="space-y-1.5">
            <div className="h-3 w-28 rounded bg-gray-200" />
            <div className="h-2.5 w-20 rounded bg-gray-100" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProfileCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
      <div className="flex items-start gap-4 mb-4">
        <div className="w-16 h-16 rounded-full bg-gray-200 flex-shrink-0" />
        <div className="flex-1">
          <div className="h-5 bg-gray-200 rounded w-32 mb-2" />
          <div className="h-3.5 bg-gray-100 rounded w-24 mb-1" />
          <div className="h-3.5 bg-gray-100 rounded w-40" />
        </div>
      </div>
      <div className="h-3.5 bg-gray-100 rounded w-full mb-1" />
      <div className="h-3.5 bg-gray-100 rounded w-4/5 mb-4" />
      <div className="flex gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex-1 text-center">
            <div className="h-5 bg-gray-200 rounded w-8 mx-auto mb-1" />
            <div className="h-3 bg-gray-100 rounded w-12 mx-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DebateCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 bg-gray-200 rounded-full w-16" />
        <div className="h-5 bg-gray-100 rounded-full w-20" />
      </div>
      <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="h-4 bg-gray-100 rounded w-full mb-1" />
      <div className="h-4 bg-gray-100 rounded w-2/3 mb-3" />
      <div className="flex gap-2">
        <div className="h-5 bg-gray-100 rounded-full w-16" />
        <div className="h-5 bg-gray-100 rounded-full w-20" />
      </div>
    </div>
  );
}

export function WebinarCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
      <div className="h-5 bg-gray-200 rounded-full w-20 mb-3" />
      <div className="h-5 bg-gray-200 rounded w-2/3 mb-2" />
      <div className="h-4 bg-gray-100 rounded w-full mb-1" />
      <div className="h-4 bg-gray-100 rounded w-4/5 mb-3" />
      <div className="flex gap-2 mb-3">
        <div className="h-5 bg-gray-100 rounded-full w-14" />
        <div className="h-5 bg-gray-100 rounded-full w-18" />
      </div>
      <div className="flex gap-3 text-xs">
        <div className="h-3 bg-gray-100 rounded w-24" />
        <div className="h-3 bg-gray-100 rounded w-16" />
        <div className="h-3 bg-gray-100 rounded w-20" />
      </div>
    </div>
  );
}
