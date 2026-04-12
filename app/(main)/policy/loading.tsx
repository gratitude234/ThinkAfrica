export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse">
      <div className="mb-10 space-y-3 text-center">
        <div className="mx-auto h-9 w-40 rounded bg-gray-200" />
        <div className="mx-auto h-5 w-72 rounded bg-gray-100" />
      </div>

      <div className="mb-10 space-y-4">
        <div className="h-6 w-48 rounded bg-gray-200" />
        {[...Array(2)].map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-amber-200 bg-amber-50 p-6 space-y-3"
          >
            <div className="h-4 w-36 rounded bg-gray-100" />
            <div className="h-5 w-3/4 rounded bg-gray-200" />
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-2/3 rounded bg-gray-100" />
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <div className="h-6 w-44 rounded bg-gray-200" />
        {[...Array(4)].map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-gray-200 bg-white p-5 space-y-3"
          >
            <div className="h-5 w-3/4 rounded bg-gray-200" />
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-3/4 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
