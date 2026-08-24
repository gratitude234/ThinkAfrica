import Link from "next/link";

/**
 * A profile has four addressable sections and previously offered no way to
 * reach any of them except scrolling. Desktop only: on a phone the page is
 * short enough after the Featured rail that a jump list would be furniture.
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
      aria-label="Profile sections"
      className="mt-6 hidden border-b border-card-border lg:flex"
    >
      {sections.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          className="focus-ring -mb-px border-b-2 border-transparent px-4 py-2.5 text-sm font-semibold text-ink-muted hover:border-card-border-hover hover:text-ink"
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
