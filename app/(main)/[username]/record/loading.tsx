import "@/components/profile/profile.css";
import LoadingState from "@/components/ui/LoadingState";
import Skeleton from "@/components/ui/Skeleton";
import { PROFILE_SHELL } from "@/lib/profileLayout";

export default function Loading() {
  return <LoadingState label="Loading Intellectual Record" className={`${PROFILE_SHELL} profile-record-shell`} contentClassName="profile-record-page">
    <header className="profile-record-page-header">
      <div className="profile-record-back"><Skeleton className="h-4 w-36" /></div>
      <div className="profile-record-page-title-row">
        <Skeleton className="mb-[7px] h-3 w-36" />
        <Skeleton className="h-9 w-80 md:h-11" />
        <Skeleton className="mt-2 h-6 w-full max-w-[680px]" />
      </div>
      <dl className="profile-record-page-metrics">{[0, 1, 2].map(index => <div key={index} className="min-w-0">
        <dt className="min-w-0"><Skeleton className="h-4 w-28" /></dt>
        <dd className="min-w-0"><Skeleton className="h-[30px] w-12" /></dd>
      </div>)}</dl>
      <section className="profile-record-topics">
        <div>
          <Skeleton className="h-6 w-28" />
          <Skeleton className="mt-1 h-9 w-full" />
        </div>
        <ul>{["w-28", "w-32", "w-24"].map(width => <li key={width} className="max-w-full"><Skeleton className={`h-8 rounded-full ${width}`} /></li>)}</ul>
      </section>
    </header>
    <div className="profile-record-years">{[0, 1].map(year => <section key={year} className="profile-record-year">
      <h2><Skeleton className="h-6 w-14" /></h2>
      <ul>{[0, 1, 2].map(index => <li key={index}>
        <article className={`profile-record-item ${index === 1 ? "is-post" : "is-article"}`}>
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-7 w-11/12" />
            <Skeleton className="mt-2 h-5 w-4/5" />
            <Skeleton className="mt-3 h-4 w-36" />
          </div>
          {index !== 2 ? <Skeleton className="profile-record-cover" /> : null}
        </article>
      </li>)}</ul>
    </section>)}</div>
  </LoadingState>;
}
