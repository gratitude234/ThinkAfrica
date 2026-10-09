import LoadingState from "@/components/ui/LoadingState";
import Skeleton from "@/components/ui/Skeleton";

export function SearchResultsSkeleton({
  announce = true
}: {
  announce?: boolean;
}) {
  const content = <>
    <Skeleton className="mb-2 mt-4 h-4 w-20" />
    <div className="space-y-3">
      {[0, 1].map(index => <div key={index} className="flex items-center gap-4 rounded-xl border border-divider bg-card p-4">
        <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>)}
    </div>
    <Skeleton className="mb-2 mt-4 h-4 w-16" />
    <div className="space-y-3">
      {[0, 1].map(index => <div key={index} className="rounded-xl border border-divider bg-card p-5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-3 h-7 w-4/5" />
        <Skeleton className="mt-3 h-3 w-36" />
        <Skeleton className="mt-2 h-4 w-11/12" />
      </div>)}
    </div>
    <Skeleton className="mb-2 mt-4 h-4 w-20" />
    <div className="flex flex-wrap gap-2">{["w-24", "w-32", "w-28"].map(width => <Skeleton key={width} className={`h-9 rounded-full ${width}`} />)}</div>
  </>;
  return announce ? <LoadingState label="Loading search results">{content}</LoadingState> : content;
}

export default function SearchPageSkeleton({ withResults = false }: { withResults?: boolean }) {
  return <LoadingState label="Loading search" className="mx-auto max-w-3xl">
    <header className="mb-6">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="mt-2 h-8 w-96" />
      <Skeleton className="mt-2 h-6 w-full" />
    </header>
    <Skeleton className="mb-3 h-[50px] w-full rounded-xl" />
    {withResults ? <SearchResultsSkeleton announce={false} /> : <section className="mb-8">
      <Skeleton className="mb-3 h-4 w-32" />
      <div className="flex flex-wrap gap-2">
        {["w-28", "w-36", "w-24", "w-32"].map((width) => <Skeleton key={width} className={`h-10 rounded-full ${width}`} />)}
      </div>
    </section>}
  </LoadingState>;
}
