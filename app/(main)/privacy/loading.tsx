export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse">
      <div className="mb-8 space-y-3">
        <div className="h-9 w-56 rounded bg-gray-200" />
        <div className="h-4 w-32 rounded bg-gray-100" />
      </div>

      <div className="space-y-8">
        {[...Array(5)].map((_, index) => (
          <section key={index} className="space-y-3">
            <div className="h-5 w-40 rounded bg-gray-200" />
            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-gray-100" />
              <div className="h-4 w-11/12 rounded bg-gray-100" />
              <div className="h-4 w-2/3 rounded bg-gray-100" />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
