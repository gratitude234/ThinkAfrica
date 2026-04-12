export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse">
      <div className="mb-8 space-y-2">
        <div className="h-8 w-32 rounded bg-gray-200" />
        <div className="h-4 w-48 rounded bg-gray-100" />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[...Array(4)].map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-gray-200 bg-white p-5 space-y-2"
          >
            <div className="h-4 w-20 rounded bg-gray-100" />
            <div className="h-8 w-24 rounded bg-gray-200" />
            <div className="h-3 w-24 rounded bg-gray-100" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="h-5 w-36 rounded bg-gray-200" />
        </div>
        <div className="divide-y divide-gray-100">
          {[...Array(6)].map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-4 px-6 py-4"
            >
              <div className="flex-1 space-y-2">
                <div className="h-4 w-56 rounded bg-gray-200" />
                <div className="h-3 w-28 rounded bg-gray-100" />
              </div>
              <div className="h-5 w-16 rounded-full bg-gray-100" />
              <div className="space-y-2 text-right">
                <div className="h-4 w-12 rounded bg-gray-200" />
                <div className="h-3 w-10 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
