export default function Loading() {
  return (
    <div className="animate-pulse">
      <section className="px-4 py-16">
        <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
          <div className="space-y-4">
            <div className="h-12 w-36 rounded bg-gray-200" />
            <div className="h-12 w-4/5 rounded bg-gray-200" />
            <div className="h-6 w-full rounded bg-gray-100" />
            <div className="h-6 w-3/4 rounded bg-gray-100" />
            <div className="flex gap-3 pt-2">
              <div className="h-12 w-36 rounded-xl bg-gray-200" />
              <div className="h-12 w-40 rounded-xl bg-gray-100" />
            </div>
          </div>

          <div className="space-y-3">
            {[...Array(3)].map((_, index) => (
              <div
                key={index}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4"
              >
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-20 rounded-full bg-gray-100" />
                  <div className="h-4 w-5/6 rounded bg-gray-200" />
                  <div className="h-3 w-1/2 rounded bg-gray-100" />
                </div>
                <div className="h-16 w-16 rounded-lg bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-gray-100 bg-gray-50 py-8">
        <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-3">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="space-y-2 text-center">
              <div className="mx-auto h-8 w-20 rounded bg-gray-200" />
              <div className="mx-auto h-4 w-28 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto grid max-w-4xl gap-8 sm:grid-cols-3">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="text-center space-y-3">
              <div className="mx-auto h-14 w-14 rounded-full bg-gray-100" />
              <div className="mx-auto h-5 w-24 rounded bg-gray-200" />
              <div className="h-4 w-full rounded bg-gray-100" />
              <div className="h-4 w-5/6 rounded bg-gray-100 mx-auto" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
