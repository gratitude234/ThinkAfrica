/**
 * Mirrors the Command Center's real order so nothing reshuffles when the page
 * resolves: header with its next action, the section tab row, then the editing
 * column with the preview rail beside it.
 *
 * This route loads six independent profile domains in parallel (identity,
 * record summary, featured work, research, opportunities, outcomes), so it is
 * the owner route most likely to be waiting on something, and it was the one
 * with no skeleton at all.
 *
 * Placeholder fills use the flat greys every other skeleton in the app uses,
 * rather than brand tokens: a pulsing block is furniture, not chrome, and
 * matching the surrounding 50-odd loading files matters more here than
 * tokenizing it.
 */
export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-[900px] animate-pulse motion-reduce:animate-none lg:max-w-[1180px]"
      role="status"
      aria-label="Loading your profile workspace"
    >
      <header className="rounded-xl border border-card-border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-gray-100" />
            <div className="h-8 w-64 max-w-full rounded bg-gray-200" />
            <div className="h-4 w-72 max-w-full rounded bg-gray-100" />
          </div>
          <div className="flex shrink-0 gap-2">
            <div className="h-11 w-28 rounded-lg bg-gray-200" />
            <div className="h-11 w-24 rounded-lg bg-gray-100" />
          </div>
        </div>

        {/* The contextual next action. Drawn because almost every owner has
            one, so omitting it would be the reshuffle this file prevents. */}
        <div className="mt-5 space-y-2 rounded-lg border border-green-wash-border bg-green-tint p-4">
          <div className="h-4 w-52 max-w-full rounded bg-gray-200" />
          <div className="h-4 w-full rounded bg-gray-100" />
          <div className="h-11 w-40 rounded-lg bg-gray-200" />
        </div>
      </header>

      <div className="mt-5 flex gap-1 border-b border-card-border pb-px">
        {[0, 1, 2, 3, 4].map((tab) => (
          <div key={tab} className="h-11 w-24 shrink-0 rounded-t bg-gray-100" />
        ))}
      </div>

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
        <div className="min-w-0 space-y-6">
          {[0, 1, 2].map((section) => (
            <div
              key={section}
              className="space-y-4 rounded-xl border border-card-border bg-card p-5 sm:p-6"
            >
              <div className="h-5 w-40 rounded bg-gray-200" />
              <div className="h-4 w-64 max-w-full rounded bg-gray-100" />
              {[0, 1].map((field) => (
                <div key={field} className="space-y-1.5">
                  <div className="h-3 w-28 rounded bg-gray-100" />
                  <div className="h-11 w-full rounded-lg bg-gray-100" />
                </div>
              ))}
              <div className="h-11 w-28 rounded-lg bg-gray-200" />
            </div>
          ))}
        </div>

        <aside className="mt-6 hidden lg:mt-0 lg:block">
          <div className="space-y-4 rounded-xl border border-card-border bg-card p-5">
            <div className="h-3 w-20 rounded bg-gray-100" />
            <div className="h-24 w-full rounded-lg bg-gray-100" />
            <div className="h-16 w-16 rounded-full bg-gray-200" />
            <div className="h-6 w-40 rounded bg-gray-200" />
            <div className="h-4 w-32 rounded bg-gray-100" />
            <div className="h-4 w-full rounded bg-gray-100" />
          </div>
        </aside>
      </div>

      <span className="sr-only">Loading your profile workspace...</span>
    </div>
  );
}
