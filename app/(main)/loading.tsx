export default function Loading() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-pulse">
      {/* Feed column */}
      <div className="lg:col-span-2 space-y-4">
        <div className="h-8 w-56 bg-gray-200 rounded-lg mb-2" />
        <div className="h-4 w-72 bg-gray-100 rounded mb-6" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-5 w-16 bg-gray-200 rounded-full" />
              <div className="h-4 w-24 bg-gray-100 rounded" />
            </div>
            <div className="h-5 w-4/5 bg-gray-200 rounded" />
            <div className="h-4 w-full bg-gray-100 rounded" />
            <div className="h-4 w-3/4 bg-gray-100 rounded" />
            <div className="flex items-center gap-3 pt-1">
              <div className="h-7 w-7 rounded-full bg-gray-200" />
              <div className="h-3 w-32 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Sidebar column */}
      <div className="hidden lg:block space-y-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="h-4 w-28 bg-gray-200 rounded" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-3 w-full bg-gray-100 rounded" />
          ))}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="h-4 w-28 bg-gray-200 rounded" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-3 w-full bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
