export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto animate-pulse">
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-2">
          <div className="h-7 w-32 bg-gray-200 rounded" />
          <div className="h-4 w-56 bg-gray-100 rounded" />
        </div>
        <div className="h-9 w-24 bg-gray-200 rounded-lg" />
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 space-y-2">
            <div className="h-3 w-16 bg-gray-100 rounded" />
            <div className="h-7 w-12 bg-gray-200 rounded" />
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex gap-4 px-4 py-3 border-b border-gray-100 bg-gray-50">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-3 w-16 bg-gray-200 rounded" />
          ))}
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-4 border-b border-gray-100 last:border-0">
            <div className="h-4 w-48 bg-gray-200 rounded flex-1" />
            <div className="h-4 w-16 bg-gray-100 rounded" />
            <div className="h-4 w-12 bg-gray-100 rounded" />
            <div className="h-4 w-12 bg-gray-100 rounded" />
            <div className="h-4 w-20 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
