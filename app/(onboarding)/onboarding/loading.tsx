export default function Loading() {
  return (
    <div className="h-dvh overflow-hidden bg-canvas">
      <div className="mx-auto flex h-full w-full max-w-lg flex-col animate-pulse">
        <div className="flex-shrink-0 px-5 pt-8">
          <div className="flex h-7 items-center justify-between">
            <span className="h-7 w-7" />
            <div className="flex items-center gap-1.5">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="h-2 w-2 rounded-full bg-gray-200" />
              ))}
            </div>
            <span className="h-7 w-7" />
          </div>
        </div>

        <div className="flex-shrink-0 px-5 pb-1 pt-4">
          <div className="h-6 w-2/3 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-4/5 rounded bg-gray-100" />
        </div>

        <div className="flex-1 overflow-hidden px-5 py-3">
          <div className="grid grid-cols-3 gap-2.5">
            {[...Array(9)].map((_, index) => (
              <div key={index} className="h-[104px] rounded-2xl border border-gray-200 bg-white" />
            ))}
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-gray-200 bg-white px-5 pt-3.5 pb-4">
          <div className="h-12 w-full rounded-xl bg-gray-200" />
        </div>
      </div>
    </div>
  );
}
