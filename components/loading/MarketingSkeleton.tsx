import LoadingState from "@/components/ui/LoadingState";
import Skeleton from "@/components/ui/Skeleton";

function Actions() {
  return <div className="flex flex-wrap gap-3">
    <Skeleton className="h-11 w-40 rounded-full" />
    <Skeleton className="h-11 w-36 rounded-full" />
  </div>;
}

export function AboutSkeleton() {
  return <LoadingState label="Loading About Indegenius" className="mx-auto max-w-3xl py-8" contentClassName="space-y-14">
    <header>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-4 h-10 w-11/12 sm:h-12" />
      <Skeleton className="mt-3 h-10 w-3/4 sm:h-12" />
      <div className="mt-5 max-w-2xl space-y-3">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-11/12" />
        <Skeleton className="h-5 w-4/5" />
      </div>
    </header>
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">{[0, 1].map(index => <div key={index} className="min-w-0 rounded-2xl border border-card-border bg-card p-6">
      <Skeleton className="h-8 w-48" />
      <div className="mt-3 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>)}</section>
    <section className="rounded-2xl bg-ink px-7 py-10 sm:px-10">
      <Skeleton className="h-9 w-4/5 bg-canvas/20" />
      <Skeleton className="mt-3 h-5 w-11/12 bg-canvas/20" />
      <div className="mt-7"><Actions /></div>
    </section>
  </LoadingState>;
}

export function LandingSkeleton() {
  return <LoadingState label="Loading Indegenius" className="min-h-screen bg-canvas text-ink">
    <div className="sticky top-0 border-b border-card-border bg-card">
      <div className="mx-auto flex h-[60px] max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Skeleton className="h-6 w-28" />
        <div className="hidden gap-6 md:flex">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex min-w-0 gap-2">
          <Skeleton className="h-9 w-14" />
          <Skeleton className="h-9 w-16 rounded-full" />
        </div>
      </div>
    </div>
    <main>
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <Skeleton className="h-4 w-52" />
        <div className="mt-5 max-w-4xl space-y-3">
          <Skeleton className="h-12 w-full sm:h-[72px]" />
          <Skeleton className="h-12 w-4/5 sm:h-[72px]" />
        </div>
        <div className="mt-6 max-w-2xl space-y-3">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-11/12" />
        </div>
        <div className="mt-9"><Actions /></div>
      </section>
      <section className="border-y border-card-border bg-card"><div className="mx-auto grid max-w-6xl gap-px bg-card-border sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map(index => <div key={index} className="min-w-0 bg-card p-7">
          <Skeleton className="h-8 w-40" />
          <div className="mt-3 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>)}
      </div></section>
      <section className="mx-auto max-w-4xl px-5 py-20 sm:px-8">
        <Skeleton className="mx-auto h-9 w-4/5 sm:h-10" />
        <Skeleton className="mx-auto mt-4 h-5 w-full max-w-2xl" />
        <Skeleton className="mx-auto mt-3 h-5 w-2/3" />
        <Skeleton className="mx-auto mt-8 h-11 w-44 rounded-full" />
      </section>
    </main>
    <div className="mt-16 bg-ink"><div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-4">{[0, 1, 2, 3].map(index => <div key={index} className="min-w-0 space-y-4">
        <Skeleton className="h-5 w-28 bg-canvas/20" />
        <Skeleton className="h-4 w-32 bg-canvas/20" />
        <Skeleton className="h-4 w-24 bg-canvas/20" />
      </div>)}</div>
      <Skeleton className="mt-10 h-12 w-full bg-canvas/20" />
    </div></div>
  </LoadingState>;
}

export function LegalSkeleton({
  kind
}: {
  kind: "privacy" | "terms";
}) {
  return <LoadingState label={kind === "privacy" ? "Loading Privacy Policy" : "Loading Terms of Use"} className="mx-auto max-w-3xl">
    <Skeleton className="mb-4 h-9 w-56" />
    <Skeleton className="mb-8 h-5 w-44" />
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-11/12" />
        <Skeleton className="h-5 w-2/3" />
      </div>
      {Array.from({
        length: kind === "privacy" ? 4 : 6
      }, (_, index) => <section key={index} className="space-y-6">
        <Skeleton className="h-7 w-44" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      </section>)}
    </div>
  </LoadingState>;
}
