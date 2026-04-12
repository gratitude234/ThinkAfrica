export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-56 rounded bg-gray-200" />
          <div className="h-4 w-52 rounded bg-gray-100" />
        </div>
        <div className="h-10 w-28 rounded-lg bg-gray-200" />
      </div>

      <div className="space-y-8">
        {[...Array(3)].map((_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-xl border border-gray-200 bg-white"
          >
            <div className="flex items-center justify-between gap-4 border-b border-gray-100 bg-gray-50 px-6 py-4">
              <div className="space-y-2">
                <div className="h-5 w-56 rounded bg-gray-200" />
                <div className="h-3 w-40 rounded bg-gray-100" />
              </div>
              <div className="h-5 w-20 rounded-full bg-gray-100" />
            </div>
            <div className="space-y-4 p-6">
              {[...Array(2)].map((__, rowIndex) => (
                <div key={rowIndex} className="space-y-2">
                  <div className="h-4 w-40 rounded bg-gray-200" />
                  <div className="h-3 w-64 rounded bg-gray-100" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
