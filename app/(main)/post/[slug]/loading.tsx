export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto animate-pulse">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3">
          <div className="max-w-3xl space-y-4">
            {/* Cover image placeholder */}
            <div className="w-full h-64 bg-gray-200 rounded-xl mb-8" />

            {/* Badges + title */}
            <div className="flex gap-2 mb-4">
              <div className="h-5 w-16 bg-gray-200 rounded-full" />
              <div className="h-5 w-12 bg-gray-100 rounded-full" />
            </div>
            <div className="h-8 w-4/5 bg-gray-200 rounded mb-2" />
            <div className="h-6 w-2/3 bg-gray-100 rounded mb-6" />

            {/* Author row */}
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-full bg-gray-200" />
              <div className="space-y-1.5">
                <div className="h-4 w-28 bg-gray-200 rounded" />
                <div className="h-3 w-40 bg-gray-100 rounded" />
              </div>
            </div>

            <div className="border-t border-gray-200 mb-8" />

            {/* Body lines */}
            <div className="space-y-3">
              {[100, 95, 100, 88, 100, 75, 100, 90].map((w, i) => (
                <div key={i} className={`h-4 bg-gray-100 rounded`} style={{ width: `${w}%` }} />
              ))}
              <div className="h-4 w-1/2 bg-gray-100 rounded" />
            </div>

            <div className="border-t border-gray-200 my-8" />

            {/* Comments skeleton */}
            <div className="space-y-4">
              <div className="h-5 w-24 bg-gray-200 rounded" />
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-28 bg-gray-200 rounded" />
                    <div className="h-3 w-full bg-gray-100 rounded" />
                    <div className="h-3 w-4/5 bg-gray-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* TOC sidebar placeholder */}
        <div className="hidden lg:block lg:col-span-1">
          <div className="sticky top-24 space-y-2">
            <div className="h-3 w-16 bg-gray-200 rounded mb-3" />
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-3 w-full bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
