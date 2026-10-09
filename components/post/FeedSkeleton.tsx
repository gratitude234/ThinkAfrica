import LoadingState from "@/components/ui/LoadingState";
import Skeleton from "@/components/ui/Skeleton";
import { CARD_SHELL } from "./cardShell";

function SkeletonByline({
  nameWidth
}: {
  nameWidth: string;
}) {
  return <div className="flex items-center gap-[9px] sm:gap-2.5">
    <Skeleton className="h-[30px] w-[30px] shrink-0 rounded-full sm:h-[34px] sm:w-[34px]" />
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <Skeleton className={`h-3 ${nameWidth}`} />
      <Skeleton className="h-2.5 w-8" />
    </div>
  </div>;
}

function EngagementSkeleton() {
  return <div className="mt-3 flex min-h-9 items-center justify-between gap-3 sm:mt-4 sm:min-h-10">
    <div className="flex min-w-0 items-center gap-5">
      {[0, 1, 2].map(index => <Skeleton key={index} className="h-4 w-8" />)}
    </div>
    <Skeleton className="h-4 w-4 shrink-0" />
  </div>;
}

function PostSkeletonCard() {
  return <article className={CARD_SHELL}>
    <SkeletonByline nameWidth="w-32" />
    <div className="mt-2.5 space-y-2 sm:mt-3">
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-4/5" />
    </div>
    <EngagementSkeleton />
  </article>;
}

function ArticleSkeletonCard({
  withCover
}: {
  withCover: boolean;
}) {
  return <article className={CARD_SHELL}>
    <SkeletonByline nameWidth="w-28" />
    <div className="mt-3 flex items-start gap-3 sm:gap-5">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="mt-2 h-5 w-5/6" />
        <Skeleton className="mt-2 h-3.5 w-3/5" />
      </div>
      {withCover ? <Skeleton className="mt-1 aspect-square w-24 shrink-0 rounded-xl sm:aspect-[4/3] sm:w-40" /> : null}
    </div>
    <EngagementSkeleton />
  </article>;
}

const SEQUENCE = ["post", "article-cover", "article", "post"] as const;

/** Shares card spacing with HomeFeedCard; reserves its always-present action row. */
export default function FeedSkeleton({
  count = 4,
  label = "Loading posts",
  announce = true
}: {
  count?: number;
  label?: string;
  announce?: boolean;
}) {
  const cards = Array.from({
    length: count
  }, (_, index) => {
    const variant = SEQUENCE[index % SEQUENCE.length];
    return variant === "post" ? <PostSkeletonCard key={index} /> : <ArticleSkeletonCard key={index} withCover={variant === "article-cover"} />;
  });
  return announce ? <LoadingState label={label}>{cards}</LoadingState> : <>{cards}</>;
}
