import { PROFILE_COLUMNS, PROFILE_SHELL } from "@/lib/profileLayout";

/**
 * Mirrors the real section order so nothing reshuffles when the page resolves:
 * identity, the record strip, About, then work on the left with Background in
 * the rail. Featured is deliberately not drawn, since most profiles have not
 * selected any and a placeholder for it would be the reshuffle in reverse.
 */
export default function Loading() {
  return (
    <div
      className={`${PROFILE_SHELL} animate-pulse motion-reduce:animate-none`}
      role="status"
      aria-label="Loading this profile"
    >
      <section className="overflow-hidden rounded-xl border border-card-border bg-card">
        <div className="h-14 bg-gray-100 sm:h-16" />

        <div className="p-5 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="-mt-12 h-[88px] w-[88px] shrink-0 rounded-full border-4 border-card bg-gray-200 sm:-mt-14" />
            <div className="flex-1 space-y-3">
              <div className="h-8 w-48 max-w-full rounded bg-gray-200" />
              <div className="h-4 w-28 rounded bg-gray-100" />
              <div className="h-4 w-64 max-w-full rounded bg-gray-100" />
              <div className="h-4 w-52 max-w-full rounded bg-gray-100" />
            </div>
            <div className="h-11 w-32 rounded-lg bg-gray-200" />
          </div>
        </div>

        <div className="border-t border-card-border bg-canvas/70 px-5 py-4 sm:px-7">
          <div className="h-3 w-32 rounded bg-gray-100" />
          <div className="mt-3 grid grid-cols-3 gap-4">
            {[0, 1, 2].map((cell) => (
              <div key={cell} className="space-y-2">
                <div className="h-3 w-20 max-w-full rounded bg-gray-100" />
                <div className="h-7 w-12 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2 px-5 pb-5 pt-5 sm:px-7 sm:pb-7">
          <div className="h-4 w-16 rounded bg-gray-100" />
          <div className="h-4 w-full rounded bg-gray-100" />
          <div className="h-4 w-4/5 rounded bg-gray-100" />
        </div>
      </section>

      <div className={`mt-6 ${PROFILE_COLUMNS}`}>
        <div className="min-w-0 space-y-4">
          <div className="border-b border-card-border pb-3">
            <div className="h-3 w-28 rounded bg-gray-100" />
            <div className="mt-2 h-6 w-56 max-w-full rounded bg-gray-200" />
          </div>
          {[0, 1, 2].map((card) => (
            <div key={card} className="space-y-3 rounded-xl border border-card-border bg-card p-4 sm:p-5">
              <div className="h-3 w-24 rounded bg-gray-100" />
              <div className="h-6 w-3/4 rounded bg-gray-200" />
              <div className="h-4 w-full rounded bg-gray-100" />
              <div className="h-4 w-2/3 rounded bg-gray-100" />
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-card-border bg-card p-5 sm:p-6 lg:mt-0">
          <div className="h-6 w-32 rounded bg-gray-200" />
          <div className="mt-5 space-y-5">
            {[0, 1, 2].map((field) => (
              <div key={field} className="space-y-2">
                <div className="h-3 w-20 rounded bg-gray-100" />
                <div className="h-4 w-36 max-w-full rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <span className="sr-only">Loading this profile...</span>
    </div>
  );
}
