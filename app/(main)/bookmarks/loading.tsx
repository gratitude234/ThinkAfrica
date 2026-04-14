export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse">
      <div className="mb-6 h-7 w-32 rounded bg-gray-200" />
      <div className="mb-6 flex gap-2">
        {[...Array(3)].map((_, index) => (
          <div key={index} className="h-10 w-20 rounded-full bg-gray-100" />
        ))}
      </div>
      <div className="space-y-4">
        {[...Array(3)].map((_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-2xl border border-gray-100 bg-white"
          >
            <div className="aspect-[16/9] w-full bg-gray-200" />
            <div className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <div className="h-5 w-16 rounded-full bg-gray-200" />
                <div className="h-3 w-12 rounded bg-gray-100" />
              </div>
              <div className="h-5 w-4/5 rounded bg-gray-200" />
              <div className="h-4 w-full rounded bg-gray-100" />
              <div className="h-4 w-3/4 rounded bg-gray-100" />
              <div className="mt-2 flex items-center gap-3 border-t border-gray-100 pt-2">
                <div className="h-8 w-8 rounded-full bg-gray-200" />
                <div className="space-y-1.5">
                  <div className="h-3 w-28 rounded bg-gray-200" />
                  <div className="h-2.5 w-20 rounded bg-gray-100" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
