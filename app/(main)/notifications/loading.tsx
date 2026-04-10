export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto animate-pulse">
      <div className="h-7 w-32 bg-gray-200 rounded mb-6" />
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-4 border-b border-gray-100 last:border-0">
            <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-4/5 bg-gray-200 rounded" />
              <div className="h-3 w-24 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
