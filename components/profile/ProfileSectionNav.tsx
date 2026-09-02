import Link from "next/link";

/**
 * A profile has four addressable sections and previously offered no way to
 * reach any of them except scrolling. Desktop only: a phone already carries
 * the bottom nav, the sticky follow bar and the compose button, and a fourth
 * pinned layer there would cost more screen than the jump saves.
 *
 * Pinned under the top nav via the shared [data-app-context-nav] rule, the
 * same one the feed's tab strip uses, so both track the nav's live occupancy
 * and pin in line. It sits flush under the header rather than floating below
 * a gap: with the header no longer drawn as a card, this rule and the
 * header's own bottom edge are what give the page its structure, and a strip
 * that stays put while the record scrolls is doing more of that work than a
 * border ever did.
 *
 * The attributes rather than the StickySubnav wrapper, deliberately. That
 * component also calls registerSubnav, which hands the chrome controller its
 * one subnav slot and makes mobile chrome compaction wait on this strip's
 * in-flow anchor. This strip does not exist on a phone, so it would be
 * deciding when the phone's nav retreats while never appearing there: the
 * profile header is long, and the nav would sit expanded most of the way
 * down it. Pinning is all this needs, and pinning is pure CSS.
 *
 * Sections the author has not filled in are left out, so a new profile does
 * not advertise its own gaps.
 */
export default function ProfileSectionNav({
  showFeatured,
  showBackground,
}: {
  showFeatured: boolean;
  showBackground: boolean;
}) {
  const sections = [
    showFeatured ? { href: "#featured-work", label: "Featured" } : null,
    { href: "#latest-record", label: "Record" },
    showBackground ? { href: "#background", label: "Background" } : null,
  ].filter((section): section is { href: string; label: string } => section !== null);

  if (sections.length < 2) return null;

  return (
    <nav
      data-app-context-nav=""
      data-app-chrome-motion=""
      aria-label="Profile sections"
      // Opaque, not bg-card/95: the record cards passing beneath would
      // otherwise ghost through the labels.
      className="z-30 hidden border-b border-card-border bg-card lg:flex"
    >
      {sections.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          className="focus-ring -mb-px border-b-2 border-transparent px-4 py-2.5 first:pl-0 text-sm font-semibold text-ink-muted hover:border-card-border-hover hover:text-ink"
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
