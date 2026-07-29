export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl"
      role="status"
      aria-label="Loading this conversation"
    >
      <div className="mb-4 h-14 animate-pulse motion-reduce:animate-none rounded-xl bg-gray-100" />
      <div className="space-y-3 px-4">
        {[...Array(6)].map((_, index) => (
          <div
            key={index}
            className={`h-10 animate-pulse motion-reduce:animate-none rounded-xl bg-gray-100 ${
              index % 2 === 0 ? "w-3/4" : "ml-auto w-1/2"
            }`}
          />
        ))}
      </div>

      <span className="sr-only">Loading this conversation…</span>
    </div>
  );
}
