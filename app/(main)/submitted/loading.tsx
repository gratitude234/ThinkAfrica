export default function Loading() {
  return (
    <div className="mx-auto max-w-lg animate-pulse py-20">
      <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-gray-200" />
        <div className="mx-auto h-7 w-2/3 rounded bg-gray-200" />
        <div className="mx-auto mt-3 h-5 w-32 rounded-full bg-gray-100" />
        <div className="mt-8 space-y-3">
          {[...Array(3)].map((_, index) => (
            <div key={index}>
              <div className="flex items-center gap-3 py-2">
                <div className="h-6 w-6 rounded-full bg-gray-200" />
                <div className="h-4 w-32 rounded bg-gray-200" />
              </div>
              {index < 2 ? <div className="ml-3 h-6 w-px bg-gray-100" /> : null}
            </div>
          ))}
        </div>
        <div className="mt-8 rounded-2xl bg-gray-50 p-4">
          <div className="h-4 w-32 rounded bg-gray-200" />
          <div className="mt-3 h-3 w-full rounded bg-gray-100" />
          <div className="mt-2 h-3 w-4/5 rounded bg-gray-100" />
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <div className="h-12 flex-1 rounded-xl bg-gray-100" />
          <div className="h-12 flex-1 rounded-xl bg-gray-200" />
        </div>
      </div>
    </div>
  );
}
