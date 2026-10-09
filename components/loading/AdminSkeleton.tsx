import { PrototypeNotice } from "@/app/(main)/admin/communications/CommunicationsChrome";
import LoadingState from "@/components/ui/LoadingState";
import Skeleton from "@/components/ui/Skeleton";

function PageHeader({
  eyebrow = false
}: {
  eyebrow?: boolean;
}) {
  return <header>
    {eyebrow ? <Skeleton className="h-4 w-24" /> : null}
    <Skeleton className={`${eyebrow ? "mt-2 h-9" : "h-8"} w-80`} />
    <Skeleton className={`${eyebrow ? "mt-2" : "mt-1"} h-6 w-full max-w-xl`} />
  </header>;
}

export function AdminOverviewSkeleton() {
  return <LoadingState label="Loading platform operations" contentClassName="space-y-8">
    <PageHeader eyebrow />
    <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map(index => <div key={index} className="min-w-0 rounded-xl border border-card-border bg-card p-5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-2 h-9 w-14" />
      <Skeleton className="mt-1 h-5 w-40" />
    </div>)}</div>
    <section>
      <Skeleton className="h-6 w-28" />
      <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3].map(index => <div key={index} className="min-w-0 rounded-xl border border-card-border bg-card p-5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-2 h-5 w-full" />
        <Skeleton className="mt-2 h-5 w-4/5" />
      </div>)}</div>
    </section>
    <section className="rounded-xl border border-card-border bg-card p-5">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="mt-1 h-5 w-full" />
      <div className="mt-4 divide-y divide-divider">{[0, 1, 2].map(index => <div key={index} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-1 h-4 w-40" />
        </div>
        <Skeleton className="h-4 w-20" />
      </div>)}</div>
    </section>
  </LoadingState>;
}

export function VerificationSkeleton() {
  return <LoadingState label="Loading verification requests" className="mx-auto max-w-4xl">
    <div className="mb-8"><PageHeader /></div>
    <div className="space-y-3">{[0, 1, 2, 3].map(index => <div key={index} className="flex flex-col gap-4 rounded-xl border border-card-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-1 h-4 w-80" />
      </div>
      <div className="flex min-w-0 max-w-full flex-wrap gap-2">
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
    </div>)}</div>
  </LoadingState>;
}

export function ModerationSkeleton() {
  return <LoadingState label="Loading moderation" className="mx-auto max-w-4xl">
    <div className="mb-6"><PageHeader /></div>
    <div className="mb-6 flex flex-wrap gap-2">{[0, 1, 2, 3].map(index => <Skeleton key={index} className="h-8 w-20 rounded-full" />)}</div>
    <div className="space-y-4">{[0, 1, 2, 3].map(index => <div key={index} className="rounded-xl border border-card-border bg-card p-5">
      <div className="flex min-w-0 max-w-full flex-wrap gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-16 w-full rounded-lg" />
      <Skeleton className="mt-3 h-4 w-48" />
      <div className="mt-3 flex flex-wrap gap-2 border-t border-divider pt-3">
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
    </div>)}</div>
  </LoadingState>;
}

export function UsersSkeleton() {
  return <LoadingState label="Loading users" className="mx-auto max-w-4xl">
    <div className="mb-8"><PageHeader /></div>
    <div className="divide-y divide-divider overflow-hidden rounded-xl border border-card-border bg-card">{Array.from({
      length: 6
    }, (_, index) => <div key={index} className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-1 h-5 w-28" />
      </div>
      <Skeleton className="h-7 w-20 shrink-0 rounded-full" />
    </div>)}</div>
  </LoadingState>;
}

function BroadcastRows() {
  return <div className="mt-3 overflow-hidden rounded-xl border border-card-border bg-card">{[0, 1, 2].map(index => <div key={index} className="flex flex-col gap-3 border-b border-divider px-5 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0 flex-1">
      <Skeleton className="h-5 w-80" />
      <Skeleton className="mt-2 h-4 w-48" />
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Skeleton className="h-6 w-16 rounded-full" />
      <Skeleton className="h-4 w-20" />
    </div>
  </div>)}</div>;
}

export function CommunicationsSkeleton() {
  return <LoadingState label="Loading communications" contentClassName="space-y-8">
    <PrototypeNotice />
    <header>
      <Skeleton className="h-4 w-32" />
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <Skeleton className="h-9 w-80" />
          <Skeleton className="mt-2 h-6 w-full max-w-xl" />
        </div>
        <Skeleton className="h-11 w-36 rounded-lg" />
      </div>
    </header>
    <div className="overflow-x-auto border-b border-divider"><div className="flex min-w-max gap-7 pb-3">
      <Skeleton className="h-5 w-20" />
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-5 w-24" />
    </div></div>
    {[0, 1].map(section => <section key={section}>
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-1 h-5 w-80" />
      <BroadcastRows />
    </section>)}
  </LoadingState>;
}

export function BroadcastComposerSkeleton() {
  return <LoadingState label="Opening broadcast editor" contentClassName="space-y-5">
    <PrototypeNotice />
    <div className="sticky top-[var(--app-sticky-offset)] flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl border border-card-border bg-card px-4 py-3">
      <Skeleton className="h-5 w-56" />
      <div className="flex min-w-0 max-w-full flex-wrap gap-2">
        <Skeleton className="h-9 w-20 rounded-lg" />
        <Skeleton className="h-9 w-20 rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
    </div>
    <div className="mx-auto max-w-[720px] overflow-hidden rounded-xl border border-card-border bg-card">
      <div className="divide-y divide-divider border-b border-divider">{[0, 1].map(index => <div key={index} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-5 sm:px-6">
        <Skeleton className="mt-2.5 h-4 w-14 shrink-0" />
        <div className="min-w-0 flex-1 p-2.5">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="mt-1 h-4 w-64" />
          {index === 1 ? <Skeleton className="mt-3 h-5 w-full" /> : null}
        </div>
      </div>)}</div>
      <div className="border-b border-divider px-4 pb-4 pt-5 sm:px-6">
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="mt-2 h-4 w-60" />
        <Skeleton className="mt-4 h-6 w-11/12" />
      </div>
      <div className="border-b border-divider px-4 py-2 sm:px-6"><div className="flex min-w-0 max-w-full flex-wrap gap-2">{[0, 1, 2, 3, 4, 5].map(index => <Skeleton key={index} className="h-8 w-8" />)}</div></div>
      <div className="min-h-[320px] space-y-4 p-4 sm:p-6">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-11/12" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    </div>
  </LoadingState>;
}

export function BroadcastDetailSkeleton() {
  return <LoadingState label="Loading broadcast" contentClassName="space-y-8">
    <PrototypeNotice />
    <header>
      <Skeleton className="h-4 w-40" />
      <div className="mt-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <Skeleton className="h-9 w-80" />
          <Skeleton className="mt-2 h-5 w-48" />
        </div>
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
    </header>
    <div className="divide-y divide-divider overflow-hidden rounded-xl border border-card-border bg-card">{[0, 1, 2].map(index => <div key={index} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:gap-5 sm:px-6">
      <Skeleton className="h-4 w-24 shrink-0" />
      <Skeleton className="h-5 w-80" />
    </div>)}</div>
    <section>
      <Skeleton className="h-5 w-16" />
      <div className="mt-3 grid grid-cols-2 rounded-xl border border-card-border bg-card sm:grid-cols-4">{[0, 1, 2, 3].map(index => <div key={index} className="min-w-0 p-4">
        <Skeleton className="h-8 w-12" />
        <Skeleton className="mt-2 h-4 w-28" />
      </div>)}</div>
    </section>
    <section>
      <Skeleton className="h-5 w-20" />
      <Skeleton className="mt-1 h-5 w-full" />
      <div className="mt-3 rounded-xl border border-card-border bg-canvas p-3 sm:p-5"><Skeleton className="h-[620px] w-full rounded-lg" /></div>
    </section>
  </LoadingState>;
}
