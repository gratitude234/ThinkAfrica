export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse">
      <div className="mb-12 space-y-4 text-center">
        <div className="mx-auto h-10 w-64 rounded bg-gray-200" />
        <div className="mx-auto h-5 w-3/4 rounded bg-gray-100" />
      </div>

      <div className="space-y-10">
        {[...Array(4)].map((_, index) => (
          <section key={index} className="space-y-3">
            <div className="h-6 w-40 rounded bg-gray-200" />
            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-gray-100" />
              <div className="h-4 w-11/12 rounded bg-gray-100" />
              <div className="h-4 w-3/4 rounded bg-gray-100" />
            </div>
          </section>
        ))}
      </div>

      <div className="mt-12 rounded-2xl bg-gray-100 p-8">
        <div className="mx-auto h-6 w-44 rounded bg-gray-200" />
        <div className="mx-auto mt-3 h-4 w-64 rounded bg-gray-100" />
        <div className="mx-auto mt-5 h-10 w-40 rounded-xl bg-gray-200" />
      </div>
    </div>
  );
}
