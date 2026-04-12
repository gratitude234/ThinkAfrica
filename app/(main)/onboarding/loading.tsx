export default function Loading() {
  return (
    <div className="mx-auto max-w-xl py-8 animate-pulse">
      <div className="mb-8 flex items-center justify-center gap-3">
        {[...Array(3)].map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-gray-200" />
            {index < 2 ? <div className="h-1 w-10 rounded bg-gray-100" /> : null}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-5">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="space-y-2">
            <div className="h-4 w-32 rounded bg-gray-200" />
            <div className="h-11 w-full rounded-lg bg-gray-100" />
          </div>
        ))}
        <div className="flex gap-3 pt-2">
          <div className="h-10 w-24 rounded-lg bg-gray-100" />
          <div className="h-10 w-28 rounded-lg bg-gray-200" />
        </div>
      </div>
    </div>
  );
}
