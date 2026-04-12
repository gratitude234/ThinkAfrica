export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse">
      <div className="mb-10 rounded-2xl bg-gray-100 p-8 text-center space-y-4">
        <div className="mx-auto h-14 w-14 rounded-full bg-gray-200" />
        <div className="mx-auto h-8 w-72 rounded bg-gray-200" />
        <div className="mx-auto h-4 w-3/4 rounded bg-gray-100" />
        <div className="mx-auto h-10 w-56 rounded-lg bg-gray-200" />
      </div>

      <div className="mb-12 grid gap-4 sm:grid-cols-2">
        {[...Array(4)].map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-gray-200 bg-white p-5 space-y-3"
          >
            <div className="h-8 w-8 rounded bg-gray-100" />
            <div className="h-4 w-40 rounded bg-gray-200" />
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-5/6 rounded bg-gray-100" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-gray-200 bg-white p-5 text-center space-y-3"
          >
            <div className="mx-auto h-12 w-12 rounded-full bg-gray-200" />
            <div className="mx-auto h-4 w-28 rounded bg-gray-200" />
            <div className="mx-auto h-3 w-24 rounded bg-gray-100" />
            <div className="mx-auto h-3 w-20 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
