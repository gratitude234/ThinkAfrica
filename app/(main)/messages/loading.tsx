export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-3"
      role="status"
      aria-label="Loading your conversations"
    >
      {[...Array(5)].map((_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse motion-reduce:animate-none rounded-xl bg-gray-100"
        />
      ))}

      <span className="sr-only">Loading your conversations…</span>
    </div>
  );
}
