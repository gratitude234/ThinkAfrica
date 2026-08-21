import ExploreTrackedLink from "./ExploreTrackedLink";

export default function MobileOpportunitiesBanner({
  openProfileCount,
  openFellowshipCount,
}: {
  openProfileCount: number;
  openFellowshipCount: number;
}) {
  const signals = [
    openProfileCount > 0
      ? `${openProfileCount.toLocaleString()} open ${
          openProfileCount === 1 ? "profile" : "profiles"
        }`
      : null,
    openFellowshipCount > 0
      ? `${openFellowshipCount.toLocaleString()} curated ${
          openFellowshipCount === 1 ? "opening" : "openings"
        }`
      : null,
  ].filter(Boolean);
  const summary =
    signals.length > 0
      ? signals.join(" · ")
      : "Discover openings and make your profile visible.";

  return (
    <ExploreTrackedLink
      href="/opportunities"
      metadata={{ item: "mobile_opportunities", surface: "explore" }}
      className="mb-4 flex min-h-16 items-center justify-between gap-3 rounded-xl border border-green-wash-border bg-green-tint px-4 py-3.5 lg:hidden"
    >
      <span className="min-w-0">
        <span className="block text-kicker font-semibold uppercase text-emerald-ink">
          Opportunities
        </span>
        <span className="mt-1 block text-meta leading-5 text-ink">
          {summary}
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-meta font-semibold text-emerald-ink">
        Explore
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
        </svg>
      </span>
    </ExploreTrackedLink>
  );
}
