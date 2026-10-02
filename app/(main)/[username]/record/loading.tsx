import "@/components/profile/profile.css";
import { PROFILE_SHELL } from "@/lib/profileLayout";

export default function LoadingRecord() {
  return (
    <div
      className={`${PROFILE_SHELL} profile-record-shell animate-pulse motion-reduce:animate-none`}
      role="status"
      aria-label="Loading intellectual record"
    >
      <div className="profile-record-page">
        <header className="profile-record-page-header">
          <div className="h-4 w-36 rounded bg-[#EDE8DD]" />
          <div className="mt-7 h-10 w-64 max-w-full rounded bg-[#E4DFD4]" />
          <div className="mt-3 h-4 w-[34rem] max-w-full rounded bg-[#EDE8DD]" />
          <div className="mt-7 grid max-w-[660px] grid-cols-3 gap-8 max-sm:grid-cols-2">
            {[0, 1, 2].map((metric) => (
              <div key={metric} className="space-y-2">
                <div className="h-8 w-14 rounded bg-[#E4DFD4]" />
                <div className="h-3 w-24 rounded bg-[#EDE8DD]" />
              </div>
            ))}
          </div>
          <div className="mt-7 border-t border-card-border pt-6">
            <div className="h-5 w-28 rounded bg-[#E4DFD4]" />
            <div className="mt-4 flex flex-wrap gap-2">
              {[0, 1, 2, 3].map((topic) => (
                <div key={topic} className="h-8 w-24 rounded-full bg-[#EDE8DD]" />
              ))}
            </div>
          </div>
        </header>

        <div className="mt-9 space-y-8">
          {[0, 1].map((year) => (
            <div key={year} className="grid grid-cols-[86px_minmax(0,1fr)] gap-7 max-sm:block">
              <div className="h-6 w-14 rounded bg-[#E4DFD4] max-sm:mb-4" />
              <div className="divide-y divide-card-border border-t border-card-border">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="space-y-2 py-5">
                    <div className="h-3 w-14 rounded bg-[#EDE8DD]" />
                    <div className="h-6 w-3/4 rounded bg-[#E4DFD4]" />
                    <div className="h-4 w-full rounded bg-[#EDE8DD]" />
                    <div className="h-3 w-24 rounded bg-[#EDE8DD]" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading intellectual record...</span>
    </div>
  );
}
