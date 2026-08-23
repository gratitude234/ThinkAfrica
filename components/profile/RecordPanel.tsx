import Link from "next/link";
import type { ProfileCredibilityBadge } from "@/lib/profileCredibility";

/**
 * The record headline. This is the one place on the profile that states how
 * much work exists and how much of it carries evidence.
 *
 * It replaces two earlier sections that both reported the same figures in
 * different words (a five-tile "record at a glance" summary and a separate
 * "contribution quality" panel). Every count below is also reachable inside
 * the contribution tabs, so this panel deliberately shows *three* numbers and
 * pushes the rest down: volume, rigour, permanence.
 *
 * Which three is a product decision, not a display one -- see
 * docs/profile-record-contract.md before changing them.
 */

const BADGE_CLASSES: Record<ProfileCredibilityBadge["tone"], string> = {
  emerald: "border-green-wash-border bg-green-tint text-emerald-brand",
  sky: "border-card-border bg-canvas text-ink-soft",
  purple: "border-purple-tint bg-purple-tint text-purple-accent",
  amber: "border-gold-tint bg-gold-tint text-gold-ink",
  gray: "border-card-border bg-canvas text-ink-muted",
};

export interface RecordPanelStats {
  contributionCount: number;
  sourceBackedCount: number;
  citableCount: number;
}

interface RecordPanelProps {
  stats: RecordPanelStats;
  badges: ProfileCredibilityBadge[];
  displayName: string;
  isOwnProfile: boolean;
}

export default function RecordPanel({
  stats,
  badges,
  displayName,
  isOwnProfile,
}: RecordPanelProps) {
  const tiles = [
    {
      key: "contributions",
      label: "Contributions",
      value: stats.contributionCount,
      detail: "Published work and public debate arguments",
    },
    {
      key: "source-backed",
      label: "Source-backed",
      value: stats.sourceBackedCount,
      detail: "Carries at least one structured reference",
    },
    {
      key: "citable",
      label: "Citable",
      value: stats.citableCount,
      detail: "Has a stable citation ID and archived record",
    },
  ];

  const isEmpty = stats.contributionCount === 0;

  return (
    <section
      id="intellectual-record"
      aria-labelledby="record-panel-title"
      className="rounded-xl border border-card-border bg-card p-6 sm:p-7"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-kicker font-semibold uppercase text-gold-ink">
            Intellectual Record
          </p>
          <h2
            id="record-panel-title"
            className="font-display mt-1.5 text-headline font-semibold text-ink"
          >
            {isOwnProfile ? "Your record" : `${displayName}'s record`}
          </h2>
          <p className="mt-1.5 max-w-[52ch] text-meta text-ink-muted">
            Every figure here is tied to a public contribution or an inspectable
            quality signal.
          </p>
        </div>

        {isOwnProfile ? (
          <Link
            href="/write"
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37] focus:outline-none focus:ring-2 focus:ring-emerald-ink focus:ring-offset-2"
          >
            Add contribution
          </Link>
        ) : null}
      </div>

      {isEmpty ? (
        <p className="mt-6 rounded-lg border border-dashed border-card-border bg-canvas px-4 py-5 text-sm text-ink-muted">
          {isOwnProfile
            ? "Your record starts with your first published idea."
            : `${displayName} has not published a contribution yet.`}
        </p>
      ) : (
        <>
          <div className="mt-6 grid gap-px overflow-hidden rounded-lg border border-card-border bg-divider sm:grid-cols-3">
            {tiles.map((tile) => (
              <div key={tile.key} className="bg-canvas px-4 py-5">
                <p className="font-display text-[2rem] font-semibold leading-none tabular-nums text-ink">
                  {tile.value.toLocaleString()}
                </p>
                <p className="mt-2.5 text-sm font-semibold text-ink">
                  {tile.label}
                </p>
                <p className="mt-1 text-meta leading-5 text-ink-muted">
                  {tile.detail}
                </p>
              </div>
            ))}
          </div>

          {badges.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {badges.map((badge) => (
                <li
                  key={badge.key}
                  className={`rounded-full border px-2.5 py-1 text-meta font-semibold ${BADGE_CLASSES[badge.tone]}`}
                >
                  {badge.label}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
