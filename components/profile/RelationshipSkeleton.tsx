import LoadingState from "@/components/ui/LoadingState";
import Skeleton from "@/components/ui/Skeleton";

export default function RelationshipSkeleton({
  kind
}: {
  kind: "followers" | "following";
}) {
  return <LoadingState label={`Loading ${kind}`} className="mx-auto max-w-2xl">
    <header className="mb-6">
      <Skeleton className="mb-2 h-5 w-32" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-1 h-5 w-24" />
    </header>
    <div className="space-y-3">{[0, 1, 2, 3, 4, 5].map(index => <div key={index} className="flex items-center gap-3 rounded-xl border border-card-border bg-card p-4">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>)}</div>
  </LoadingState>;
}
