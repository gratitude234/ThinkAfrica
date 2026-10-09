import LoadingState from "@/components/ui/LoadingState";
import Skeleton from "@/components/ui/Skeleton";
import { ARTICLE_DETAIL_SHELL, POST_DETAIL_SHELL } from "@/lib/publicationLayout";

export function ArticleAuthorSkeleton({
  announce = true
}: {
  announce?: boolean;
}) {
  const content = <div className="mt-[18px] flex items-center gap-2.5 sm:mt-6 sm:gap-3">
    <Skeleton className="h-[34px] w-[34px] shrink-0 rounded-full sm:h-10 sm:w-10" />
    <div className="min-w-0 flex-1">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="mt-1 h-4 w-28 sm:hidden" />
    </div>
    <Skeleton className="h-8 w-16 rounded-full" />
  </div>;
  return announce ? <LoadingState label="Loading author">{content}</LoadingState> : content;
}

function DiscussionSkeleton() {
  return <section className="mt-10 space-y-5 border-t border-divider pt-6 sm:mt-12">
    <Skeleton className="h-6 w-32" />
    <Skeleton className="h-24 w-full rounded-xl" />
    {[0, 1].map(index => <div key={index} className="flex gap-3">
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>)}
  </section>;
}

/** The route has not resolved content kind yet; known Post boundaries select the Post variant. */
export default function PublicationSkeleton({
  kind = "article"
}: {
  kind?: "article" | "post";
}) {
  const article = kind === "article";
  return <LoadingState label={article ? "Loading publication" : "Loading Post"} className={article ? ARTICLE_DETAIL_SHELL : POST_DETAIL_SHELL}>
    {article ? <>
      <header className="pt-2 sm:pt-4">
        <Skeleton className="h-[42px] w-full sm:h-[51px]" />
        <Skeleton className="mt-2 h-[42px] w-4/5 sm:h-[51px]" />
        <Skeleton className="mt-3 h-6 w-full sm:mt-4 sm:h-7" />
        <Skeleton className="mt-2 h-6 w-3/4 sm:h-7" />
        <ArticleAuthorSkeleton announce={false} />
        <Skeleton className="mt-3 hidden h-5 w-44 sm:block" />
      </header>
      <Skeleton className="mt-[18px] aspect-[16/9] w-full rounded-lg sm:mt-7" />
      <div className="space-y-4 pt-6 sm:pt-9">{["w-full", "w-11/12", "w-full", "w-4/5", "w-full", "w-11/12"].map((width, index) => <Skeleton key={index} className={`h-5 ${width}`} />)}</div>
    </> : <>
      <header className="flex items-center gap-3 pt-2 sm:pt-4">
        <Skeleton className="h-[38px] w-[38px] shrink-0 rounded-full" />
        <div className="min-w-0 flex-1"><Skeleton className="h-5 w-48" /></div>
        <Skeleton className="h-8 w-16 rounded-full" />
      </header>
      <div className="mt-5 space-y-3 sm:mt-6">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-11/12" />
        <Skeleton className="h-6 w-4/5" />
      </div>
      <div className="mb-7 mt-7 flex items-center justify-between gap-3">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-20" />
      </div>
    </>}
    <DiscussionSkeleton />
  </LoadingState>;
}
