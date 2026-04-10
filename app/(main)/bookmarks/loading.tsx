export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto animate-pulse">
      <div className="h-7 w-32 bg-gray-200 rounded mb-6" />
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-5 w-16 bg-gray-200 rounded-full" />
            </div>
            <div className="h-5 w-3/4 bg-gray-200 rounded" />
            <div className="h-4 w-full bg-gray-100 rounded" />
            <div className="h-4 w-2/3 bg-gray-100 rounded" />
            <div className="flex items-center gap-3 pt-1">
              <div className="h-7 w-7 rounded-full bg-gray-200" />
              <div className="h-3 w-32 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
