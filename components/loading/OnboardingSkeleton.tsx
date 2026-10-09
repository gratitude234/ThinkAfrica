import LoadingState from "@/components/ui/LoadingState";
import Skeleton from "@/components/ui/Skeleton";
import { FieldSkeleton } from "./FormSkeleton";

export default function OnboardingSkeleton({
  step = "profile"
}: {
  step?: "profile" | "topics";
}) {
  return <LoadingState label="Loading onboarding" className="h-dvh overflow-hidden bg-canvas" contentClassName="mx-auto flex h-full w-full max-w-xl flex-col">
    <header className="shrink-0 px-5 pt-6 sm:px-8 sm:pt-8">
      <div className="flex min-h-11 items-center justify-between">
        <div className="h-11 w-11">{step === "topics" ? <Skeleton className="mt-3 h-5 w-3" /> : null}</div>
        <div className="flex items-center gap-2">
          <Skeleton className={`h-2.5 rounded-full ${step === "profile" ? "w-7" : "w-2.5"}`} />
          <Skeleton className={`h-2.5 rounded-full ${step === "topics" ? "w-7" : "w-2.5"}`} />
        </div>
        <div className="h-11 w-11" />
      </div>
      <div className="pb-2 pt-3">
        {step === "profile" ? <Skeleton className="mb-5 h-7 w-32" /> : null}
        <Skeleton className="h-8 w-72" />
        <Skeleton className="mt-2 h-6 w-full" />
      </div>
    </header>
    <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-8">{step === "profile" ? <div className="space-y-5">
      <div>
        <Skeleton className="mb-1 h-5 w-28" />
        <Skeleton className="h-16 w-16 rounded-full" />
      </div>
      <FieldSkeleton tall />
      <FieldSkeleton tall helper />
      <FieldSkeleton tall helper />
      <FieldSkeleton multiline helper />
    </div> : <>
      <Skeleton className="mb-4 h-4 w-32" />
      <div className="flex flex-wrap gap-2.5">{["w-32", "w-28", "w-40", "w-24", "w-36", "w-32", "w-40", "w-28", "w-24", "w-36", "w-28", "w-32"].map((width, index) => <Skeleton key={index} className={`h-11 rounded-full ${width}`} />)}</div>
    </>}</div>
    <footer className="shrink-0 border-t border-card-border bg-card px-5 pt-3.5 sm:px-8" style={{
      paddingBottom: "max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem))"
    }}><div className={step === "topics" ? "grid gap-2 sm:grid-cols-2" : ""}>
        <Skeleton className="h-12 w-full rounded-xl" />
        {step === "topics" ? <Skeleton className="h-12 w-full rounded-xl" /> : null}
      </div></footer>
  </LoadingState>;
}
