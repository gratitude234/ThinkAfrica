export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto animate-pulse">
      <div className="h-8 w-56 bg-gray-200 rounded mx-auto mb-2" />
      <div className="h-4 w-72 bg-gray-100 rounded mx-auto mb-8" />
      <div className="h-9 w-48 bg-gray-200 rounded-lg mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
            <div className="h-5 w-3/4 bg-gray-200 rounded" />
            <div className="h-3 w-24 bg-gray-100 rounded" />
            <div className="h-4 w-20 bg-gray-200 rounded" />
            <div className="h-3 w-full bg-gray-100 rounded" />
            <div className="h-3 w-5/6 bg-gray-100 rounded" />
            <div className="h-9 w-28 bg-gray-200 rounded-lg mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
