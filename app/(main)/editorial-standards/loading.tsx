export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse">
      <div className="mb-10 space-y-3">
        <div className="h-9 w-64 rounded bg-gray-200" />
        <div className="h-4 w-full rounded bg-gray-100" />
        <div className="h-4 w-3/4 rounded bg-gray-100" />
      </div>

      <div className="space-y-10">
        <div className="space-y-4">
          <div className="h-6 w-40 rounded bg-gray-200" />
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {[...Array(5)].map((_, index) => (
              <div
                key={index}
                className="grid grid-cols-4 gap-4 border-b border-gray-100 px-4 py-3 last:border-b-0"
              >
                <div className="h-4 rounded bg-gray-100" />
                <div className="h-4 rounded bg-gray-100" />
                <div className="h-4 rounded bg-gray-100" />
                <div className="h-4 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        </div>

        {[...Array(2)].map((_, index) => (
          <div key={index} className="space-y-4">
            <div className="h-6 w-48 rounded bg-gray-200" />
            <div className="space-y-3">
              {[...Array(4)].map((__, itemIndex) => (
                <div
                  key={itemIndex}
                  className="rounded-xl border border-gray-200 bg-white p-4 space-y-2"
                >
                  <div className="h-4 w-40 rounded bg-gray-200" />
                  <div className="h-4 w-full rounded bg-gray-100" />
                  <div className="h-4 w-5/6 rounded bg-gray-100" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
