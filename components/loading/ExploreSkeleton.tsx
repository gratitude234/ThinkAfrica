import FeedSkeleton from "@/components/post/FeedSkeleton";
import LoadingState from "@/components/ui/LoadingState";
import Skeleton from "@/components/ui/Skeleton";

export default function ExploreSkeleton({
  tab = "for-you"
}: {
  tab?: "for-you" | "trending" | "topics" | "people";
}) {
  const feed = tab === "for-you" || tab === "trending";
  return <LoadingState label="Loading Explore" className="mx-auto max-w-full min-[1280px]:max-w-[1064px]">
    <header>
      <Skeleton className="h-7 w-96 sm:h-9" />
      <Skeleton className="mt-1.5 h-5 w-96 sm:mt-2 sm:h-6" />
      <Skeleton className="mt-3.5 h-[46px] w-full max-w-[640px] rounded-xl sm:mt-[22px] sm:h-[52px]" />
    </header>
    <div className="mt-[18px] overflow-x-auto border-b border-card-border sm:mt-[26px]"><div className="flex min-w-max gap-[18px] pb-3 sm:gap-[26px]">{["w-14", "w-16", "w-12", "w-[52px]"].map(width => <Skeleton key={width} className={`h-5 ${width}`} />)}</div></div>
    <div className={`mt-3.5 grid grid-cols-1 items-start sm:mt-6 ${feed ? "min-[1280px]:grid-cols-[minmax(0,720px)_312px] min-[1280px]:gap-8" : ""}`}>
      <div className="min-w-0">
        {feed ? <div className="mb-[22px] flex gap-2">{["w-[50px]", "w-[62px]", "w-[70px]"].map(width => <Skeleton key={width} className={`h-8 rounded-full ${width}`} />)}</div> : null}
        <div className={`mb-[18px] ${tab === "topics" ? "flex flex-wrap items-end justify-between gap-4" : ""}`}>
          <div className="min-w-0">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="mt-1 h-4 w-72" />
          </div>
          {tab === "topics" ? <Skeleton className="h-10 w-32 rounded-lg" /> : null}
        </div>
        {feed ? <FeedSkeleton announce={false} /> : tab === "topics" ? <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">{Array.from({
          length: 10
        }, (_, index) => <div key={index} className="flex min-h-[68px] items-center gap-3 border-b border-divider py-4">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-0.5 h-4 w-24" />
          </div>
          <Skeleton className="h-8 w-16 rounded-full" />
        </div>)}</div> : <div className="grid grid-cols-1 gap-x-7 gap-y-3.5 sm:grid-cols-2">{Array.from({
          length: 6
        }, (_, index) => <div key={index} className="flex items-center gap-3 border-b border-divider py-4">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-1 h-4 w-24" />
          </div>
          <Skeleton className="h-8 w-16 shrink-0 rounded-full" />
        </div>)}</div>}
      </div>
      {feed ? <aside className="hidden min-w-0 min-[1280px]:block">
        <div className="mb-3.5 flex justify-between gap-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-10" />
        </div>
        {[0, 1, 2, 3].map(index => <div key={index} className="flex items-center gap-2.5 border-b border-divider pb-3.5 pt-3.5 first:pt-0">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-8 w-16 shrink-0 rounded-full" />
        </div>)}
      </aside> : null}
    </div>
  </LoadingState>;
}
