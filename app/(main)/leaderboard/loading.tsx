export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto animate-pulse">
      <div className="h-8 w-40 bg-gray-200 rounded mb-2" />
      <div className="h-4 w-56 bg-gray-100 rounded mb-8" />
      {/* Tab strip */}
      <div className="h-9 w-48 bg-gray-200 rounded-lg mb-6" />
      {/* Rows */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-gray-100 last:border-0">
            <div className="h-4 w-6 bg-gray-200 rounded" />
            <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-36 bg-gray-200 rounded" />
              <div className="h-3 w-24 bg-gray-100 rounded" />
            </div>
            <div className="h-5 w-16 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
