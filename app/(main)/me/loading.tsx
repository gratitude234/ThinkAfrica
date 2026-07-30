export default function Loading() {
  return (
    <div
      className="mx-auto max-w-3xl space-y-6 animate-pulse motion-reduce:animate-none"
      role="status"
      aria-label="Opening your account"
    >
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="h-14 bg-gray-100" />
        <div className="flex items-end gap-3 px-5 pb-5">
          <div className="-mt-7 h-[72px] w-[72px] shrink-0 rounded-full border-4 border-white bg-gray-200" />
          <div className="flex-1 space-y-2 pb-1">
            <div className="h-6 w-44 rounded bg-gray-200" />
            <div className="h-3.5 w-28 rounded bg-gray-100" />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[...Array(3)].map((_, index) => (
          <div
            key={index}
            className="h-[92px] rounded-xl border border-gray-200 bg-white"
          />
        ))}
      </div>

      <span className="sr-only">Opening your account…</span>
    </div>
  );
}
