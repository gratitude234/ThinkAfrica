export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse">
      <div className="mb-10 space-y-3 text-center">
        <div className="mx-auto h-9 w-48 rounded bg-gray-200" />
        <div className="mx-auto h-5 w-80 max-w-full rounded bg-gray-100" />
      </div>

      <div className="mb-10 rounded-2xl border border-gray-200 bg-white p-6">
        <div className="mx-auto h-6 w-56 rounded bg-gray-200" />
        <div className="mx-auto mt-3 h-4 w-96 max-w-full rounded bg-gray-100" />
      </div>

      <div className="mb-4 space-y-2">
        <div className="h-6 w-56 rounded bg-gray-200" />
        <div className="h-4 w-96 max-w-full rounded bg-gray-100" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[...Array(6)].map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-gray-200 bg-white p-5"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-28 rounded bg-gray-200" />
                <div className="h-3 w-24 rounded bg-gray-100" />
              </div>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {[...Array(3)].map((__, badgeIndex) => (
                <div
                  key={badgeIndex}
                  className="h-5 w-16 rounded-full bg-gray-100"
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {[...Array(4)].map((__, skillIndex) => (
                <div
                  key={skillIndex}
                  className="h-5 w-14 rounded-full bg-gray-100"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
