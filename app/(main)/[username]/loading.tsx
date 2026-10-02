import "@/components/profile/profile.css";
import { PROFILE_SHELL } from "@/lib/profileLayout";

/** Mirrors Profile V3: compact identity, tabs, work-first main column and supporting aside. */
export default function Loading() {
  return (
    <div
      className={`${PROFILE_SHELL} animate-pulse motion-reduce:animate-none`}
      role="status"
      aria-label="Loading this profile"
    >
      <div className="pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="h-[76px] w-[76px] shrink-0 rounded-full bg-[#E4DFD4]" />
            <div className="space-y-2">
              <div className="h-8 w-52 max-w-full rounded bg-[#E4DFD4]" />
              <div className="h-4 w-28 rounded bg-[#EDE8DD]" />
              <div className="h-4 w-44 rounded bg-[#EDE8DD]" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-11 w-28 rounded-lg bg-[#E4DFD4]" />
            <div className="h-11 w-11 rounded-lg bg-[#EDE8DD]" />
          </div>
        </div>
        <div className="mt-4 h-4 w-3/4 max-w-xl rounded bg-[#EDE8DD]" />
        <div className="mt-3 h-4 w-40 rounded bg-[#EDE8DD]" />
      </div>

      <div className="flex gap-6 overflow-hidden border-b border-card-border pb-3">
        {[0, 1, 2, 3].map((tab) => (
          <div key={tab} className="h-5 w-16 rounded bg-[#EDE8DD]" />
        ))}
      </div>

      <div className="profile-panel profile-panel-overview">
        <div className="profile-overview-grid">
          <div className="min-w-0">
            <div className="border-b border-card-border pb-7">
              <div className="h-6 w-40 rounded bg-[#E4DFD4]" />
              <div className="mt-2 h-3 w-56 rounded bg-[#EDE8DD]" />
              <div className="mt-6 grid grid-cols-3 gap-6 max-sm:grid-cols-2">
                {[0, 1, 2].map((metric) => (
                  <div key={metric} className="space-y-2">
                    <div className="h-8 w-14 rounded bg-[#E4DFD4]" />
                    <div className="h-3 w-20 rounded bg-[#EDE8DD]" />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8">
              <div className="h-6 w-32 rounded bg-[#E4DFD4]" />
              <div className="mt-4 divide-y divide-card-border border-t border-card-border">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="space-y-2 py-6">
                    <div className="h-3 w-14 rounded bg-[#EDE8DD]" />
                    <div className="h-6 w-3/4 rounded bg-[#E4DFD4]" />
                    <div className="h-4 w-full rounded bg-[#EDE8DD]" />
                    <div className="h-3 w-24 rounded bg-[#EDE8DD]" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="hidden space-y-6 lg:block">
            <div className="space-y-3 border-b border-card-border pb-6">
              <div className="h-5 w-16 rounded bg-[#E4DFD4]" />
              <div className="h-3 w-full rounded bg-[#EDE8DD]" />
              <div className="h-3 w-4/5 rounded bg-[#EDE8DD]" />
            </div>
            <div className="space-y-3">
              <div className="h-5 w-20 rounded bg-[#E4DFD4]" />
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3].map((chip) => (
                  <div key={chip} className="h-7 w-20 rounded-full bg-[#EDE8DD]" />
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <span className="sr-only">Loading this profile...</span>
    </div>
  );
}
