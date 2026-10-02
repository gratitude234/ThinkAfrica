export default function Loading() {
  return (
    <div
      className="mx-auto min-w-0 max-w-full animate-pulse motion-reduce:animate-none min-[1280px]:max-w-[1064px]"
      role="status"
      aria-label="Loading Explore"
    >
      <div>
        <div className="h-7 w-72 max-w-full rounded bg-divider" />
        <div className="mt-2 h-4 w-80 max-w-full rounded bg-divider/60" />
        <div className="mt-3.5 h-[46px] sm:mt-[22px] sm:h-[52px] w-full max-w-[640px] rounded-xl bg-divider/60" />
      </div>

      <div className="mt-[18px] flex gap-[18px] sm:mt-[26px] sm:gap-[26px] border-b border-card-border pb-3">
        {[56, 64, 48, 52].map((width, index) => (
          <div key={index} className="h-4 rounded bg-divider/60" style={{ width }} />
        ))}
      </div>

      <div className="mt-3.5 sm:mt-6 grid min-w-0 grid-cols-1 items-start min-[1280px]:grid-cols-[minmax(0,720px)_312px] min-[1280px]:gap-8">
        <div className="min-w-0">
          <div className="mb-[22px] flex gap-2">
            {[50, 62, 70].map((width, index) => (
              <div key={index} className="h-8 rounded-full bg-divider/60" style={{ width }} />
            ))}
          </div>

          <div className="mb-[18px]">
            <div className="h-4 w-36 rounded bg-divider" />
            <div className="mt-1.5 h-3 w-60 max-w-full rounded bg-divider/60" />
          </div>

          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="border-b border-divider py-[18px]">
              <div className="flex items-center gap-2">
                <div className="h-[26px] w-[26px] rounded-full bg-divider" />
                <div className="h-3 w-28 rounded bg-divider" />
                <div className="h-3 w-10 rounded bg-divider/60" />
              </div>
              <div className="mt-3 h-4 w-[92%] rounded bg-divider/70" />
              <div className="mt-2 h-4 w-[66%] rounded bg-divider/60" />
              <div className="mt-3 h-3 w-40 rounded bg-divider/50" />
            </div>
          ))}
        </div>

        <aside className="hidden min-[1280px]:block">
          <div className="mb-4 flex items-center justify-between">
            <div className="h-3 w-28 rounded bg-divider" />
            <div className="h-3 w-10 rounded bg-divider/60" />
          </div>
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="border-b border-divider py-3.5 first:pt-0">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-divider" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-28 rounded bg-divider" />
                  <div className="h-2.5 w-20 rounded bg-divider/60" />
                </div>
                <div className="h-8 w-16 rounded-full bg-divider/60" />
              </div>
            </div>
          ))}
        </aside>
      </div>

      <span className="sr-only">Loading Explore</span>
    </div>
  );
}
