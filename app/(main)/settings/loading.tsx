export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto animate-pulse">
      <div className="h-7 w-24 bg-gray-200 rounded mb-6" />
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-200" />
          <div className="h-8 w-28 bg-gray-200 rounded-lg" />
        </div>
        {/* Fields */}
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-24 bg-gray-200 rounded" />
            <div className="h-10 w-full bg-gray-100 rounded-lg" />
          </div>
        ))}
        <div className="h-10 w-28 bg-gray-200 rounded-lg" />
      </div>
    </div>
  );
}
