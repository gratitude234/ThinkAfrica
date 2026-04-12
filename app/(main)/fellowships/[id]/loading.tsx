export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse">
      <div className="mb-6 h-4 w-24 rounded bg-gray-100" />

      <div className="rounded-xl border border-gray-200 bg-white p-8 space-y-6">
        <div className="flex gap-2">
          <div className="h-5 w-16 rounded-full bg-gray-100" />
          <div className="h-5 w-24 rounded-full bg-gray-100" />
        </div>
        <div className="h-8 w-3/4 rounded bg-gray-200" />
        <div className="h-4 w-32 rounded bg-gray-100" />

        <div className="grid grid-cols-2 gap-4">
          {[...Array(2)].map((_, index) => (
            <div key={index} className="rounded-lg bg-gray-50 p-3 space-y-2">
              <div className="h-3 w-16 rounded bg-gray-100" />
              <div className="h-4 w-24 rounded bg-gray-200" />
            </div>
          ))}
        </div>

        {[...Array(3)].map((_, index) => (
          <div key={index} className="space-y-2">
            <div className="h-5 w-36 rounded bg-gray-200" />
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-5/6 rounded bg-gray-100" />
          </div>
        ))}

        <div className="border-t border-gray-100 pt-4">
          <div className="h-11 w-40 rounded-lg bg-gray-200" />
        </div>
      </div>
    </div>
  );
}
