export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse">
      <div className="mb-8 space-y-2">
        <div className="h-4 w-16 rounded bg-gray-100" />
        <div className="h-10 w-48 rounded bg-gray-200" />
        <div className="h-4 w-20 rounded bg-gray-100" />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {[...Array(3)].map((_, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white"
            >
              <div className="aspect-video w-full bg-gray-100" />
              <div className="p-5 space-y-3">
                <div className="h-5 w-20 rounded-full bg-gray-100" />
                <div className="h-5 w-3/4 rounded bg-gray-200" />
                <div className="h-4 w-full rounded bg-gray-100" />
                <div className="h-4 w-2/3 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <div className="h-5 w-32 rounded bg-gray-200" />
            {[...Array(3)].map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="h-7 w-7 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 rounded bg-gray-200" />
                  <div className="h-3 w-16 rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
