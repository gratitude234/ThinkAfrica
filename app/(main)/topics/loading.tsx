const SECTION_CHIP_WIDTHS = [96, 120, 84, 108, 92, 132, 76, 104];

export default function Loading() {
  return (
    <div
      className="animate-pulse motion-reduce:animate-none"
      role="status"
      aria-label="Loading topics"
    >
      {[...Array(4)].map((_, section) => (
        <section key={section} className="mb-10">
          <div className="mb-3 h-3.5 w-44 rounded bg-gray-200" />
          <div className="flex flex-wrap gap-2">
            {SECTION_CHIP_WIDTHS.map((w, i) => (
              <div
                key={i}
                className="h-10 rounded-full border border-gray-200 bg-white shadow-sm"
                style={{ width: w }}
              />
            ))}
          </div>
        </section>
      ))}

      <span className="sr-only">Loading topics…</span>
    </div>
  );
}
