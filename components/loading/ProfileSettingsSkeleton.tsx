import type { ReactNode } from "react";
import LoadingState from "@/components/ui/LoadingState";
import Skeleton from "@/components/ui/Skeleton";
import { FieldSkeleton, ToggleSkeleton } from "@/components/loading/FormSkeleton";

function Section({
  children
}: {
  children: ReactNode;
}) {
  return <section className="scroll-mt-24 rounded-xl border border-card-border bg-card p-5 sm:p-6">
    <header className="border-b border-divider pb-4">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="mt-1 h-6 w-full" />
    </header>
    <div className="mt-5 space-y-5">{children}</div>
    <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-divider pt-4"><Skeleton className="h-11 w-32 rounded-lg" /></div>
  </section>;
}

export default function ProfileSettingsSkeleton() {
  return <LoadingState label="Loading profile settings" className="mx-auto w-full max-w-[720px]">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <Skeleton className="h-8 w-40 sm:h-9" />
        <Skeleton className="mt-1 h-6 w-96" />
      </div>
      <Skeleton className="h-11 w-32 shrink-0 rounded-lg" />
    </header>
    <div className="mt-6 space-y-6">
      <Section>
        <div>
          <Skeleton className="mb-1 h-5 w-16" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
            <Skeleton className="h-11 w-32 rounded-lg" />
          </div>
        </div>
        <div>
          <Skeleton className="mb-1 h-5 w-24" />
          <Skeleton className="mb-2 h-5 w-80" />
          <Skeleton className="h-36 w-full rounded-xl sm:h-40" />
        </div>
        {Array.from({
          length: 9
        }, (_, index) => <FieldSkeleton key={index} multiline={index === 3} helper={index === 1} />)}
      </Section>
      <Section>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-11 flex-1 basis-40 rounded-lg" />
          <Skeleton className="h-11 w-24 rounded-lg" />
        </div>
        <Skeleton className="h-5 w-80" />
        {[0, 1, 2].map(index => <div key={index} className="flex items-center gap-3 border-b border-divider py-4">
          <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="mt-2 h-4 w-32" />
          </div>
        </div>)}
      </Section>
      <Section><div className="flex flex-wrap gap-2">{["w-28", "w-36", "w-24", "w-32", "w-40", "w-28", "w-32", "w-24"].map((width, index) => <Skeleton key={index} className={`h-11 rounded-full ${width}`} />)}</div></Section>
      <Section>
        <Skeleton className="h-6 w-full" />
        <FieldSkeleton />
        <ToggleSkeleton />
      </Section>
    </div>
  </LoadingState>;
}

