export default function Loading() {
  return (
    <div className="mx-auto max-w-[960px] animate-pulse text-ink">
      <section className="border-b border-[#e5e0d8] px-2 py-14 text-center sm:py-16">
        <div className="mx-auto mb-6 h-3 w-44 rounded bg-emerald-100" />
        <div className="mx-auto h-12 max-w-[620px] rounded bg-gray-200 sm:h-16" />
        <div className="mx-auto mt-5 h-5 max-w-[520px] rounded bg-gray-100" />
        <div className="mx-auto mt-10 grid max-w-[640px] grid-cols-2 gap-px overflow-hidden rounded-xl bg-[#e5e0d8] sm:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="bg-canvas px-3 py-5">
              <div className="mx-auto h-8 w-14 rounded bg-gray-200" />
              <div className="mx-auto mt-3 h-3 w-20 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-10 border-b border-[#e5e0d8] py-16 lg:grid-cols-2">
        <div>
          <div className="mb-5 h-3 w-36 rounded bg-emerald-100" />
          <div className="h-9 w-4/5 rounded bg-gray-200" />
          <div className="mt-5 space-y-3">
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-11/12 rounded bg-gray-100" />
            <div className="h-4 w-4/5 rounded bg-gray-100" />
          </div>
          <div className="mt-8 h-36 rounded-b-xl border-t-4 border-emerald-100 bg-white" />
        </div>
        <div className="space-y-3.5">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="rounded-xl border border-[#e5e0d8] bg-white p-5">
              <div className="h-5 w-3/5 rounded bg-gray-200" />
              <div className="mt-3 h-4 w-full rounded bg-gray-100" />
              <div className="mt-2 h-4 w-4/5 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </section>

      <section className="relative left-1/2 w-screen -translate-x-1/2 bg-ink py-16">
        <div className="mx-auto max-w-[960px] px-5">
          <div className="mb-5 h-3 w-44 rounded bg-white/10" />
          <div className="h-9 max-w-[420px] rounded bg-white/15" />
          <div className="mt-10 grid gap-px overflow-hidden rounded-xl bg-white/10 lg:grid-cols-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="min-h-[230px] bg-white/[0.04] p-7">
                <div className="h-9 w-9 rounded-lg bg-white/10" />
                <div className="mt-5 h-5 w-2/3 rounded bg-white/15" />
                <div className="mt-4 space-y-2">
                  <div className="h-3 w-full rounded bg-white/10" />
                  <div className="h-3 w-4/5 rounded bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mb-10 h-28 max-w-[540px] rounded bg-gray-100" />
        <div className="grid gap-5 lg:grid-cols-3">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="overflow-hidden rounded-2xl border border-[#e5e0d8] bg-white">
              <div className="aspect-[5/4] bg-gray-200" />
              <div className="space-y-3 p-5">
                <div className="h-5 w-28 rounded bg-gray-100" />
                <div className="h-6 w-4/5 rounded bg-gray-200" />
                <div className="h-4 w-full rounded bg-gray-100" />
                <div className="h-4 w-5/6 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
