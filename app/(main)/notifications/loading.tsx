import LoadingState from "@/components/ui/LoadingState";
import Skeleton from "@/components/ui/Skeleton";

export default function Loading() {
  return <LoadingState label="Loading notifications" className="mx-auto max-w-3xl">
    <header className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-5 w-36" />
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-12" />
      </div>
    </header>
    <div className="mb-4 flex gap-2">
      <Skeleton className="h-9 w-12 rounded-full" />
      <Skeleton className="h-9 w-24 rounded-full" />
    </div>
    <div className="space-y-5">{[0, 1, 2].map(group => <section key={group}>
      <Skeleton className="mb-2 h-4 w-28" />
      <div className="divide-y divide-divider overflow-hidden rounded-xl border border-card-border bg-card">
        {[0, 1].map(index => <div key={index} className="flex items-start gap-3 px-4 py-4">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="mt-1 h-4 w-16" />
          </div>
          <Skeleton className="h-4 w-4 shrink-0" />
        </div>)}
      </div>
    </section>)}</div>
  </LoadingState>;
}
