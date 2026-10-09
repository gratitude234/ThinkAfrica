import LoadingState from "@/components/ui/LoadingState";
import Skeleton from "@/components/ui/Skeleton";

export default function RedirectSkeleton() {
  return <LoadingState label="Opening your profile" className="mx-auto w-full max-w-[980px] py-8">
    <Skeleton className="h-6 w-40" />
    <Skeleton className="mt-4 h-4 w-56" />
  </LoadingState>;
}
