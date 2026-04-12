export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-48 rounded bg-gray-200" />
        <div className="h-4 w-80 rounded bg-gray-100" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
        {[...Array(3)].map((_, index) => (
          <div key={index} className="space-y-2">
            <div className="h-4 w-32 rounded bg-gray-200" />
            <div className="h-11 w-full rounded-lg bg-gray-100" />
          </div>
        ))}
        <div className="space-y-2">
          <div className="h-4 w-28 rounded bg-gray-200" />
          <div className="flex gap-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="h-10 w-20 rounded-lg bg-gray-100" />
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <div className="h-10 w-32 rounded-lg bg-gray-200" />
          <div className="h-10 w-24 rounded-lg bg-gray-100" />
        </div>
      </div>
    </div>
  );
}
