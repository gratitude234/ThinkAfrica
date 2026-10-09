import LoadingState from "@/components/ui/LoadingState";
import Skeleton from "@/components/ui/Skeleton";
import { FieldSkeleton, ToggleSkeleton } from "./FormSkeleton";

export default function SettingsSkeleton({
  tab = "account"
}: {
  tab?: "account" | "notifications" | "privacy";
}) {
  return <LoadingState label="Loading settings" className="mx-auto max-w-2xl">
    <Skeleton className="mb-6 h-8 w-28" />
    <div className="mb-6 overflow-x-auto"><div className="flex min-w-max gap-1 rounded-lg bg-divider/50 p-1">
      {["w-[168px]", "w-[122px]", "w-[80px]"].map(width => <Skeleton key={width} className={`h-8 rounded-md ${width}`} />)}
    </div></div>
    <div className="rounded-xl border border-card-border bg-card p-6">
      {tab === "account" ? <>
        <div className="space-y-6">
          <FieldSkeleton helper />
          <hr className="border-divider" />
          <div>
            <Skeleton className="mb-4 h-6 w-40" />
            <div className="space-y-4">
              <FieldSkeleton />
              <FieldSkeleton helper />
              <FieldSkeleton />
            </div>
          </div>
          <Skeleton className="ml-auto h-11 w-40 rounded-lg" />
        </div>
        <section className="mt-8 border-t border-divider pt-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="mt-1 h-6 w-72" />
          </div>
          <Skeleton className="h-11 w-28 shrink-0 rounded-lg" />
        </div></section>
      </> : tab === "notifications" ? <div className="space-y-8">
        {[5, 3, 6].map((count, section) => <section key={section}>
          <Skeleton className="mb-3 h-6 w-44" />
          {Array.from({
            length: count
          }, (_, index) => <ToggleSkeleton key={index} />)}
        </section>)}
        <Skeleton className="ml-auto h-11 w-40 rounded-lg" />
      </div> : <div className="space-y-6">
        <FieldSkeleton />
        <div className="rounded-xl border border-card-border px-4"><ToggleSkeleton /></div>
        <Skeleton className="ml-auto h-11 w-44 rounded-lg" />
      </div>}
    </div>
  </LoadingState>;
}
