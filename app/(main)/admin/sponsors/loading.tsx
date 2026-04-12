export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded bg-gray-200" />
          <div className="h-4 w-32 rounded bg-gray-100" />
        </div>
        <div className="h-10 w-28 rounded-lg bg-gray-200" />
      </div>

      <div className="space-y-3">
        {[...Array(5)].map((_, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5"
          >
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 rounded bg-gray-200" />
              <div className="h-3 w-24 rounded-full bg-gray-100" />
              <div className="h-3 w-3/4 rounded bg-gray-100" />
            </div>
            <div className="h-8 w-20 rounded-full bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
