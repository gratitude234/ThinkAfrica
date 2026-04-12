export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse">
      <div className="mb-6 h-4 w-24 rounded bg-gray-100" />

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <div className="h-5 w-24 rounded-full bg-gray-100" />
        <div className="h-8 w-3/4 rounded bg-gray-200" />
        <div className="h-4 w-full rounded bg-gray-100" />
        <div className="h-4 w-2/3 rounded bg-gray-100" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(2)].map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="h-4 w-20 rounded bg-gray-200" />
              <div className="h-4 w-28 rounded bg-gray-100" />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-gray-200" />
            <div className="space-y-2">
              <div className="h-4 w-28 rounded bg-gray-200" />
              <div className="h-3 w-24 rounded bg-gray-100" />
            </div>
          </div>
          <div className="h-10 w-28 rounded-lg bg-gray-200" />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <div className="h-6 w-40 rounded bg-gray-200" />
        {[...Array(4)].map((_, index) => (
          <div key={index} className="space-y-2">
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-5/6 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
