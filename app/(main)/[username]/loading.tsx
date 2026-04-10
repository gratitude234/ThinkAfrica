export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 animate-pulse">
      {/* Profile sidebar */}
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="w-20 h-20 rounded-full bg-gray-200 mx-auto" />
          <div className="h-5 w-36 bg-gray-200 rounded mx-auto" />
          <div className="h-3 w-24 bg-gray-100 rounded mx-auto" />
          <div className="h-3 w-full bg-gray-100 rounded" />
          <div className="h-3 w-5/6 bg-gray-100 rounded" />
          <div className="h-8 w-full bg-gray-200 rounded-lg mt-2" />
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-3 space-y-2">
                <div className="h-6 w-12 bg-gray-200 rounded mx-auto" />
                <div className="h-3 w-10 bg-gray-100 rounded mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Posts content */}
      <div className="lg:col-span-2 space-y-4">
        <div className="h-9 w-64 bg-gray-200 rounded-lg mb-6" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <div className="h-4 w-3/4 bg-gray-200 rounded" />
            <div className="h-3 w-full bg-gray-100 rounded" />
            <div className="h-3 w-2/3 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
