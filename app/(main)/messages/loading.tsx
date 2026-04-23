export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      {[...Array(5)].map((_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-xl bg-gray-100"
        />
      ))}
    </div>
  );
}
