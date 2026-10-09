import LoadingState from "@/components/ui/LoadingState";
import Skeleton from "@/components/ui/Skeleton";

/** The standard PostCard uses a side thumbnail, never a full-width video cover. */
export default function PublicationCardSkeleton() {
  return <article className="mb-3 overflow-hidden rounded-xl border border-card-border bg-card px-3.5 py-3.5 sm:px-5 sm:py-[18px]">
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_78px] gap-3 min-[420px]:grid-cols-[minmax(0,1fr)_88px] sm:grid-cols-[minmax(0,1fr)_96px] sm:gap-4">
      <div className="min-w-0">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-2 h-5 w-11/12" />
        <Skeleton className="mt-2 h-5 w-3/4" />
        <Skeleton className="mt-2 hidden h-3.5 w-4/5 min-[359px]:block" />
      </div>
      <Skeleton className="h-[78px] w-[78px] rounded-[9px] min-[420px]:h-[88px] min-[420px]:w-[88px] sm:h-24 sm:w-24" />
    </div>
    <div className="mt-3 flex items-center gap-2 border-t border-divider pt-2.5">
      <Skeleton className="h-6 w-6 shrink-0 rounded-full sm:h-7 sm:w-7" />
      <div className="min-w-0 flex-1"><Skeleton className="h-3 w-28" /></div>
      <Skeleton className="h-4 w-12" />
    </div>
  </article>;
}

export function BookmarkSkeletons({
  announce = true
}: {
  announce?: boolean;
}) {
  const content = <>
    <div className="mb-6 flex flex-wrap gap-2">
      {["w-16", "w-20", "w-24"].map(width => <Skeleton key={width} className={`h-9 rounded-full ${width}`} />)}
    </div>
    <div className="space-y-4">{[0, 1, 2].map(index => <PublicationCardSkeleton key={index} />)}</div>
  </>;
  return announce ? <LoadingState label="Loading bookmarks">{content}</LoadingState> : content;
}

export function BookmarksPageSkeleton() {
  return <LoadingState label="Loading bookmarks" className="mx-auto max-w-3xl">
    <header className="mb-8">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-1 h-5 w-64" />
    </header>
    <BookmarkSkeletons announce={false} />
  </LoadingState>;
}
