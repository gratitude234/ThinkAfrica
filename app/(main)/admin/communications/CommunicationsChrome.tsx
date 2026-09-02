import type { ReactNode } from "react";

/**
 * The flow is now wired end to end: drafts persist, counts are real, and a send
 * genuinely reaches Resend. What it has not had is a production run against a
 * real audience, and an admin screen that looks finished is exactly the kind of
 * thing someone trusts by accident.
 *
 * The notice stays until the deployment checklist in
 * supabase/migrations/20260902000001_email_broadcasts.sql has actually been
 * worked through: migrations applied, the nightly sync scheduled and run to
 * completion, and the Resend webhook receiving events. Its wording changed when
 * the backend landed, because a banner that says nothing sends email would
 * itself be the untrue thing on the page.
 */
export function PrototypeNotice() {
  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
      <span className="font-semibold">Not yet verified in production.</span> This
      flow does send real email. It has not been run against a live audience yet,
      so check the audience and send yourself a test before every broadcast.
    </p>
  );
}

export function CommunicationsHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-brand">
        Communications
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
            {title}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500">
            {description}
          </p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

/**
 * Broadcasts is the only section that exists. The other two are shown so the
 * shape of the section is legible, and deliberately inert so nobody goes
 * looking for a page that is not there.
 */
const SECTIONS: { key: string; label: string; available: boolean }[] = [
  { key: "broadcasts", label: "Broadcasts", available: true },
  { key: "audiences", label: "Audiences", available: false },
  { key: "history", label: "History", available: false },
];

export function CommunicationsTabs({ active }: { active: string }) {
  return (
    <nav
      aria-label="Communications sections"
      className="-mb-px flex items-center gap-7 overflow-x-auto border-b border-gray-200"
    >
      {SECTIONS.map((section) => {
        const isActive = section.available && section.key === active;
        return (
          <span
            key={section.key}
            aria-current={isActive ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 pb-3 text-sm transition-colors ${
              isActive
                ? "border-emerald-brand font-semibold text-ink"
                : "border-transparent text-gray-400"
            }`}
          >
            {section.label}
            {section.available ? null : (
              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                Soon
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
