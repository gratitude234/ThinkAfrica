export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 h-14 animate-pulse rounded-xl bg-gray-100" />
      <div className="space-y-3 px-4">
        {[...Array(6)].map((_, index) => (
          <div
            key={index}
            className={`h-10 animate-pulse rounded-xl bg-gray-100 ${
              index % 2 === 0 ? "w-3/4" : "ml-auto w-1/2"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
