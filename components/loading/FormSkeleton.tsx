import Skeleton from "@/components/ui/Skeleton";

export function FieldSkeleton({
  multiline = false,
  helper = false,
  tall = false
}: {
  multiline?: boolean;
  helper?: boolean;
  tall?: boolean;
}) {
  return <div>
    <Skeleton className="mb-1 h-5 w-28" />
    <Skeleton className={`w-full rounded-xl ${multiline ? "h-28" : tall ? "h-12" : "h-[46px]"}`} />
    {helper ? <Skeleton className="mt-1 h-4 w-60" /> : null}
  </div>;
}

export function ToggleSkeleton() {
  return <div className="flex items-center justify-between gap-4 py-3">
    <div className="min-w-0 flex-1">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="mt-1 h-4 w-72" />
    </div>
    <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
  </div>;
}
