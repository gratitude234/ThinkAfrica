export default function Loading() {
  return (
    <div className="mx-auto max-w-xl animate-pulse">
      <div className="mb-8 space-y-2">
        <div className="h-8 w-56 rounded bg-gray-200" />
        <div className="h-4 w-80 rounded bg-gray-100" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
        {[...Array(3)].map((_, index) => (
          <div key={index} className="space-y-2">
            <div className="h-4 w-44 rounded bg-gray-200" />
            <div className="h-24 w-full rounded-lg bg-gray-100" />
          </div>
        ))}
        <div className="flex justify-end">
          <div className="h-10 w-36 rounded-lg bg-gray-200" />
        </div>
      </div>
    </div>
  );
}
