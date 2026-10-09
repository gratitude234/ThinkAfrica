import LoadingState from "@/components/ui/LoadingState";
import Skeleton from "@/components/ui/Skeleton";

export default function WriteCanvasSkeleton({
  variant = "post",
  fullScreen = false
}: {
  variant?: "post" | "article";
  fullScreen?: boolean;
}) {
  const article = variant === "article";
  return <LoadingState label={fullScreen ? "Opening publication editor" : "Opening your writing space"} className={fullScreen ? "fixed inset-0 z-[70] overflow-y-auto bg-canvas" : ""}>
    <div className={`min-h-dvh bg-canvas text-ink ${fullScreen ? "" : "md:min-h-[calc(100dvh-var(--app-nav-height))]"} ${article ? "" : "md:bg-[#F1EEE7] md:py-14"}`}>
      <section className={article ? "w-full" : "mx-auto min-h-dvh w-full bg-canvas md:min-h-0 md:w-[560px] md:rounded-[14px] md:border md:border-card-border md:shadow-[0_8px_30px_rgba(0,0,0,0.07)]"}>
        <div className={`grid grid-cols-[1fr_auto_1fr] items-center gap-1 border-b border-divider ${article ? "min-h-[52px] px-2 sm:px-6 md:min-h-[60px] md:px-10" : "min-h-14 px-3 sm:px-5"}`}>
          <Skeleton className="h-11 w-16 rounded-lg" />
          <Skeleton className="h-4 w-20" />
          <div className="flex min-w-0 justify-end gap-2">
            <Skeleton className="h-11 w-7 rounded-lg" />
            <Skeleton className="h-11 w-16 rounded-lg" />
          </div>
        </div>
        {article ? <>
          <div className="flex min-h-8 items-center gap-2 border-b border-divider px-5 md:hidden"><Skeleton className="h-3 w-24" /></div>
          <div className="mx-auto w-full max-w-[680px] px-5 pt-5 sm:px-8 md:pt-10">
            <Skeleton className="mb-6 hidden h-11 w-32 rounded-lg md:block" />
            <Skeleton className="h-10 w-11/12 sm:h-14" />
            <Skeleton className="mt-3 h-10 w-3/4 sm:h-14" />
            <div className="mt-6 min-h-[50vh] space-y-4 sm:mt-8">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-11/12" />
              <Skeleton className="h-5 w-4/5" />
            </div>
          </div>
        </> : <div className="px-4 pb-24 pt-3.5 sm:px-5 md:pb-5 md:pt-5">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="mt-3 min-h-24 space-y-3">
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-5 w-3/5" />
          </div>
          <div className="mt-3 hidden min-h-11 items-center md:flex"><Skeleton className="h-11 w-11 rounded-lg" /></div>
          <Skeleton className="mt-3 h-11 w-full rounded-lg" />
        </div>}
      </section>
      <div className="fixed inset-x-0 bottom-0 flex min-h-14 items-center gap-4 border-t border-divider bg-canvas px-5 pb-[env(safe-area-inset-bottom)] md:hidden">{[0, 1, 2].map(index => <Skeleton key={index} className="h-8 w-8 rounded-lg" />)}</div>
    </div>
  </LoadingState>;
}
