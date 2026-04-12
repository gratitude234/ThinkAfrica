export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse">
      <div className="mb-12 space-y-3 text-center">
        <div className="mx-auto h-9 w-56 rounded bg-gray-200" />
        <div className="mx-auto h-5 w-80 rounded bg-gray-100" />
      </div>

      <div className="mb-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-gray-200 bg-white p-5 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="h-10 w-10 rounded-lg bg-gray-100" />
              <div className="h-5 w-20 rounded-full bg-gray-100" />
            </div>
            <div className="h-4 w-32 rounded bg-gray-200" />
            <div className="h-3 w-20 rounded bg-gray-100" />
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-5/6 rounded bg-gray-100" />
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-gray-100 p-8 space-y-4">
        <div className="mx-auto h-6 w-40 rounded bg-gray-200" />
        <div className="mx-auto h-4 w-72 rounded bg-gray-100" />
        <div className="rounded-xl bg-white p-6 space-y-4">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="h-11 w-full rounded-lg bg-gray-100" />
          ))}
          <div className="h-10 w-32 rounded-lg bg-gray-200" />
        </div>
      </div>
    </div>
  );
}
