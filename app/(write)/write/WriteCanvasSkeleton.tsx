export default function WriteCanvasSkeleton() {
  return (
    <div className="min-h-dvh animate-pulse bg-white motion-reduce:animate-none" role="status" aria-label="Loading the writing canvas">
      <div className="border-b border-gray-100">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4 sm:px-6">
          <div className="h-11 w-11 rounded-full bg-gray-100" />
          <div className="h-3 w-36 rounded bg-gray-100" />
          <div className="ml-auto h-11 w-24 rounded-full bg-gray-200" />
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-5 pt-10 sm:px-8">
        <div className="h-11 w-24 rounded-lg bg-gray-100" />
        <div className="mt-7 h-6 w-full rounded bg-gray-100" />
        <div className="mt-3 h-6 w-4/5 rounded bg-gray-100" />
        <div className="mt-3 h-6 w-3/5 rounded bg-gray-100" />
      </div>
      <span className="sr-only">Loading the writing canvas…</span>
    </div>
  );
}
