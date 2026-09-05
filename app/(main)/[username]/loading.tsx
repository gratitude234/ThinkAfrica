import { PROFILE_COLUMNS, PROFILE_SHELL } from "@/lib/profileLayout";

/**
 * Mirrors the real section order so nothing reshuffles when the page resolves:
 * identity, the record strip, then work on the left with Background in the
 * rail. Featured is deliberately not drawn, since most profiles have not
 * selected any and a placeholder for it would be the reshuffle in reverse.
 *
 * The identity block borrows the page's own `profile-identity` grid rather
 * than approximating it with flex. That is the whole point of a skeleton
 * here: the avatar, the name, the actions and the meta column land in exactly
 * the cells they will occupy, at both breakpoints the grid defines, so the
 * swap is a fill rather than a jump.
 */
export default function Loading() {
  return (
    <div
      className={`${PROFILE_SHELL} animate-pulse motion-reduce:animate-none first:-mt-6 lg:first:mt-0`}
      role="status"
      aria-label="Loading this profile"
    >
      {/* Not a card, for the same reason the real header is not one: it is the
          profile rather than an item on it. Full bleed below `lg`, closing on
          a single rule. */}
      <section className="-mx-4 flex flex-col overflow-hidden border-b border-card-border bg-card sm:-mx-6 lg:mx-0">
        <div className="h-14 bg-[#EDE9E3] sm:h-16" />

        <div className="profile-identity px-4 py-5 sm:px-6 sm:py-7 lg:px-0">
          <div className="profile-identity-avatar relative z-10 -mt-12 h-[88px] w-[88px] shrink-0 rounded-full border-4 border-card bg-gray-200 sm:-mt-14" />

          <div className="profile-identity-name min-w-0 space-y-2">
            {/* Name, then the handle and descriptor line under it. */}
            <div className="h-8 w-52 max-w-full rounded bg-gray-200 sm:h-9" />
            <div className="h-4 w-64 max-w-full rounded bg-gray-100" />
          </div>

          <div className="profile-identity-meta min-w-0">
            {/* Affiliation, country, followers, following. */}
            <div className="h-3.5 w-72 max-w-full rounded bg-gray-100" />

            <div className="mt-4 space-y-2">
              <div className="h-4 w-full rounded bg-gray-100" />
              <div className="h-4 w-11/12 max-w-full rounded bg-gray-100" />
              <div className="h-4 w-3/5 rounded bg-gray-100" />
            </div>

          </div>

          <div className="profile-identity-actions flex flex-wrap items-start gap-2 sm:max-w-[290px] sm:justify-end">
            <div className="h-11 w-28 rounded-lg bg-gray-200" />
            <div className="h-11 w-11 rounded-lg bg-gray-100" />
          </div>

          {/* Writes about: an eyebrow over a row of set words, not chips. */}
          <div className="profile-identity-topics space-y-2">
            <div className="h-2.5 w-24 rounded bg-gray-100" />
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <div className="h-5 w-24 rounded bg-gray-200" />
              <div className="h-5 w-16 rounded bg-gray-200" />
              <div className="h-5 w-20 rounded bg-gray-200" />
            </div>
          </div>
        </div>

        {/* The Intellectual Record strip: an eyebrow over a row of tiles that
            size to their content, not an equal-column grid. */}
        <div className="border-t border-card-border bg-canvas/70 px-4 py-4 sm:px-6 lg:px-0">
          <div className="mb-2.5 h-2.5 w-36 rounded bg-gray-100" />
          <div className="flex flex-wrap items-start divide-x divide-card-border">
            {[0, 1].map((cell) => (
              <div
                key={cell}
                className="flex min-w-0 flex-col gap-1 px-3 py-1 first:pl-0 last:pr-0 sm:px-5"
              >
                <div className="h-3 w-20 rounded bg-gray-100" />
                <div className="h-7 w-12 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className={`mt-6 ${PROFILE_COLUMNS}`}>
        <div className="min-w-0 space-y-4">
          <div className="border-b border-card-border pb-3">
            <div className="h-3 w-28 rounded bg-gray-100" />
            <div className="mt-2 h-6 w-56 max-w-full rounded bg-gray-200" />
          </div>
          {[0, 1, 2].map((card) => (
            <div
              key={card}
              className="space-y-3 rounded-xl border border-card-border bg-card p-4 sm:p-5"
            >
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
