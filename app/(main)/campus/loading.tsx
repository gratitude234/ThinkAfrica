export default function CampusLoading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-6 motion-reduce:animate-none">
      <div className="h-56 rounded-2xl bg-emerald-900/15" />
      <div className="h-32 rounded-xl bg-gray-200" />
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="h-56 rounded-xl bg-gray-200" />)}
      </div>
    </div>
  );
}
