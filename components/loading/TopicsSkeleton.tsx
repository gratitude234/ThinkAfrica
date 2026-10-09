import PublicationCardSkeleton from "@/components/post/PublicationCardSkeleton";
import LoadingState from "@/components/ui/LoadingState";
import Skeleton from "@/components/ui/Skeleton";

export function TopicsSkeleton() {
  return <LoadingState label="Loading topics" className="mx-auto max-w-5xl">
    <header className="mb-6">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="mt-2 h-8 w-48" />
      <Skeleton className="mt-2 h-6 w-[600px]" />
    </header>
    <div className="mb-8 grid gap-3 sm:grid-cols-3">
      {[0, 1].map(index => <div key={index} className="rounded-xl border border-card-border bg-card p-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-2 h-8 w-12" />
      </div>)}
    </div>
    {[0, 1, 2, 3].map(index => <section key={index} className="mb-10">
      <Skeleton className="mb-3 h-5 w-40" />
      <div className="flex flex-wrap gap-2">{["w-28", "w-40", "w-24", "w-36", "w-32"].map(width => <Skeleton key={width} className={`h-10 rounded-full ${width}`} />)}</div>
    </section>)}
  </LoadingState>;
}

export function TopicSkeleton() {
  return <LoadingState label="Loading topic" className="mx-auto max-w-4xl">
    <header className="mb-8 rounded-2xl border border-card-border bg-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Skeleton className="h-8 w-60" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>
        <Skeleton className="h-11 w-32 rounded-full" />
      </div>
    </header>
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div className="min-w-0 space-y-4 lg:col-span-2">{[0, 1, 2].map(index => <PublicationCardSkeleton key={index} />)}</div>
      <aside className="rounded-xl border border-card-border bg-card p-5">
        <Skeleton className="mb-4 h-5 w-36" />
        <div className="space-y-4">{[0, 1, 2].map(index => <div key={index} className="flex items-center gap-2">
          <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1"><Skeleton className="h-3 w-28" /></div>
        </div>)}</div>
      </aside>
    </div>
  </LoadingState>;
}
