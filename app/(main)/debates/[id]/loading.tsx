export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="border-b border-gray-200 py-4 px-6 flex items-center justify-between">
        <div className="h-6 w-64 bg-gray-200 rounded" />
        <div className="h-5 w-24 bg-gray-100 rounded-full" />
      </div>
      <div className="max-w-5xl mx-auto px-4 py-8 grid md:grid-cols-2 gap-6">
        {[0, 1].map((col) => (
          <div key={col} className="space-y-3">
            <div className="h-10 bg-gray-100 rounded-xl" />
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="border border-gray-200 rounded-xl p-4 space-y-2"
              >
                <div className="h-4 w-full bg-gray-100 rounded" />
                <div className="h-4 w-4/5 bg-gray-100 rounded" />
                <div className="h-3 w-20 bg-gray-200 rounded-full mt-2" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
