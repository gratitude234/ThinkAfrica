export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto animate-pulse">
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-2">
          <div className="h-7 w-32 bg-gray-200 rounded" />
          <div className="h-4 w-56 bg-gray-100 rounded" />
        </div>
      </div>
      {/* Type selector */}
      <div className="flex gap-2 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 w-24 bg-gray-200 rounded-lg" />
        ))}
      </div>
      {/* Title */}
      <div className="h-10 w-full bg-gray-200 rounded-lg mb-4" />
      {/* Summary */}
      <div className="h-16 w-full bg-gray-100 rounded-lg mb-4" />
      {/* Tags */}
      <div className="h-10 w-full bg-gray-100 rounded-lg mb-4" />
      {/* Editor */}
      <div className="h-96 w-full bg-gray-100 rounded-lg" />
    </div>
  );
}
