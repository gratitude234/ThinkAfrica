import Image from "next/image";

interface BrandWordmarkProps {
  /** "emerald" for light surfaces, "white" for dark surfaces (e.g. the AuthShell sidebar). */
  tone?: "emerald" | "white";
  /** Wrapper classes -- layout only (flex/gap live here already, override with care). */
  className?: string;
  /** Classes for the icon glyph, e.g. sizing (`h-6 w-6`) and responsive show/hide. */
  iconClassName?: string;
  /** Classes for the "Indegenius" text, e.g. font-size. */
  textClassName?: string;
  /** Set false to render text only -- the icon glyph genuinely doesn't fit. */
  showIcon?: boolean;
}

/**
 * The brand's SVG lockups (`indegenius-icon-wordmark-*.svg`,
 * `indegenius-full-lockup-*.svg`) stack the icon above the wordmark inside a
 * near-square canvas, so constraining them to a normal header height leaves
 * a barely-legible sliver -- there is no horizontal-only wordmark asset to
 * crop to. This renders the square icon mark (unscaled/undistorted) next to
 * real "Indegenius" text set in the display typeface instead, giving every
 * header a readable horizontal lockup without redrawing the brand artwork.
 */
export default function BrandWordmark({
  tone = "emerald",
  className = "",
  iconClassName = "h-6 w-6",
  textClassName = "text-[19px]",
  showIcon = true,
}: BrandWordmarkProps) {
  const iconSrc =
    tone === "white"
      ? "/brand/indegenius-icon-only-white.svg"
      : "/brand/indegenius-icon-only-color.svg";
  const textColor = tone === "white" ? "text-white" : "text-emerald-brand";

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {showIcon ? (
        <Image
          src={iconSrc}
          alt=""
          width={924}
          height={924}
          priority
          aria-hidden="true"
          className={`shrink-0 ${iconClassName}`}
        />
      ) : null}
      <span
        className={`font-display font-bold leading-none tracking-tight ${textColor} ${textClassName}`}
      >
        Indegenius
      </span>
    </span>
  );
}
