export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto animate-pulse">
      <div className="h-7 w-24 bg-gray-200 rounded mb-6" />
      <div className="h-11 w-full bg-gray-200 rounded-lg mb-8" />
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 flex gap-3">
            <div className="h-5 w-16 bg-gray-200 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 bg-gray-200 rounded" />
              <div className="h-3 w-full bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
