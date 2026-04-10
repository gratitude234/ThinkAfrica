export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto animate-pulse">
      <div className="h-8 w-32 bg-gray-200 rounded mb-2" />
      <div className="h-4 w-56 bg-gray-100 rounded mb-8" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="h-40 bg-gray-200" />
            <div className="p-4 space-y-2">
              <div className="h-4 w-3/4 bg-gray-200 rounded" />
              <div className="h-3 w-full bg-gray-100 rounded" />
              <div className="h-3 w-1/2 bg-gray-100 rounded" />
              <div className="h-8 w-24 bg-gray-200 rounded-lg mt-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
