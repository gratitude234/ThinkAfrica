export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-48 rounded bg-gray-200" />
        <div className="h-4 w-32 rounded bg-gray-100" />
      </div>

      <div className="mb-6 flex gap-2">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="h-7 w-20 rounded-full bg-gray-100" />
        ))}
      </div>

      <div className="space-y-4">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <div className="h-5 w-16 rounded-full bg-gray-200" />
              <div className="h-5 w-24 rounded-full bg-gray-100" />
            </div>
            <div className="mt-3 h-16 rounded-lg bg-gray-50" />
            <div className="mt-3 flex gap-2">
              <div className="h-7 w-20 rounded-lg bg-gray-100" />
              <div className="h-7 w-20 rounded-lg bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
