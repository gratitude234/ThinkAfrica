export default function ResponsesLoading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse motion-reduce:animate-none">
      <div className="h-64 rounded-2xl border border-gray-100 bg-white" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-44 rounded-xl border border-gray-100 bg-white" />
        ))}
      </div>
    </div>
  );
}
