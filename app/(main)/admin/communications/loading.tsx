export default function Loading() {
  return (
    <div className="animate-pulse space-y-8 motion-reduce:animate-none">
      <div className="h-12 rounded-lg bg-gray-100" />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <div className="h-3 w-28 rounded bg-gray-200" />
          <div className="h-9 w-64 rounded bg-gray-200" />
          <div className="h-4 w-80 rounded bg-gray-100" />
        </div>
        <div className="h-10 w-36 rounded-lg bg-gray-200" />
      </div>

      <div className="h-8 border-b border-gray-200" />

      <div className="space-y-3">
        <div className="h-4 w-36 rounded bg-gray-200" />
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {[...Array(5)].map((_, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-4 last:border-b-0"
            >
              <div className="space-y-2">
                <div className="h-4 w-64 rounded bg-gray-200" />
                <div className="h-3 w-48 rounded bg-gray-100" />
                <div className="h-3 w-40 rounded bg-gray-100" />
              </div>
              <div className="h-6 w-16 rounded-full bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
