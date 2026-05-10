import Link from "next/link";

type AuthShellProps = {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  subtitle: string;
  proofItems: string[];
  quote: string;
  quoteSource: string;
  footer?: React.ReactNode;
};

export const INPUT_STYLES =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-ink shadow-sm shadow-black/[0.01] transition-colors placeholder:text-gray-400 focus:border-emerald-brand focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-gray-50";

export const PRIMARY_BUTTON_STYLES =
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-brand px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-900/10 transition-colors hover:bg-emerald-600 focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60";

export const SECONDARY_LINK_STYLES =
  "font-semibold text-emerald-700 transition-colors hover:text-emerald-800 hover:underline";

export function AuthShell({
  children,
  eyebrow,
  title,
  subtitle,
  proofItems,
  quote,
  quoteSource,
  footer,
}: AuthShellProps) {
  return (
    <main className="min-h-dvh bg-[#F7F5F0]">
      <div className="mx-auto grid min-h-dvh w-full max-w-7xl grid-cols-1 lg:grid-cols-[0.95fr_1.05fr]">
        <aside className="hidden min-h-dvh flex-col justify-between overflow-hidden bg-[#111816] px-10 py-10 text-white lg:flex">
          <div>
            <Link
              href="/landing"
              className="inline-flex font-display text-[30px] font-bold leading-none"
              aria-label="ThinkAfrica home"
            >
              <span className="text-emerald-brand">Think</span>
              <span className="text-purple-accent">Africa</span>
            </Link>

            <div className="mt-16 max-w-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
                {eyebrow}
              </p>
              <h2 className="font-display mt-5 text-[48px] font-semibold leading-[1.02] text-white">
                Ideas, arguments, and academic identity in one place.
              </h2>
              <p className="mt-5 max-w-md text-sm leading-7 text-white/62">
                Join the student network built around thoughtful publishing,
                credible profiles, and conversations that travel beyond one
                campus.
              </p>
            </div>
          </div>

          <div className="space-y-8">
            <div className="grid grid-cols-3 gap-3">
              {proofItems.map((item, index) => (
                <div
                  key={item}
                  className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
                    0{index + 1}
                  </p>
                  <p className="mt-3 text-sm leading-5 text-white/78">
                    {item}
                  </p>
                </div>
              ))}
            </div>

            <figure className="border-l border-emerald-300/60 pl-5">
              <blockquote className="font-display text-[24px] leading-snug text-white">
                &quot;{quote}&quot;
              </blockquote>
              <figcaption className="mt-3 text-sm text-white/52">
                {quoteSource}
              </figcaption>
            </figure>
          </div>
        </aside>

        <section className="flex min-h-dvh items-start justify-center px-5 pb-10 pt-7 sm:px-8 lg:items-center lg:bg-white lg:px-12 lg:py-12">
          <div className="w-full max-w-[470px]">
            <div className="mb-8 lg:hidden">
              <Link
                href="/landing"
                className="inline-flex font-display text-[27px] font-bold leading-none"
                aria-label="ThinkAfrica home"
              >
                <span className="text-emerald-brand">Think</span>
                <span className="text-purple-accent">Africa</span>
              </Link>
              <p className="mt-3 text-[13px] font-medium text-ink-muted">
                Africa&apos;s Intellectual Network
              </p>
            </div>

            <div className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm shadow-black/[0.03] sm:p-8 lg:rounded-none lg:border-0 lg:p-0 lg:shadow-none">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-brand">
                {eyebrow}
              </p>
              <h1 className="font-display mt-3 text-[34px] font-semibold leading-[1.08] text-ink sm:text-[40px]">
                {title}
              </h1>
              <p className="mt-4 text-sm leading-6 text-ink-muted">
                {subtitle}
              </p>

              <div className="mt-8">{children}</div>
            </div>

            {footer ? (
              <div className="mt-5 text-center text-sm text-ink-muted">
                {footer}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
