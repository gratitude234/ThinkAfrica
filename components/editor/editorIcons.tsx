import type { ReactNode } from "react";
import type { TextAlignment } from "./extensions";

/** One stroke icon. Every write-screen icon is drawn at this weight so the toolbars read as one set. */
export function Icon({ path, className = "h-5 w-5" }: { path: ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

export const UNDO_ICON = <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />;
export const REDO_ICON = <path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />;
export const SOURCES_ICON = (
  <>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 15.5z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h4.5a1.5 1.5 0 0 0 1.5-1.5z" />
  </>
);
export const PREVIEW_ICON = (
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12" />
    <circle cx="12" cy="12" r="2.75" />
  </>
);
export const CLOSE_ICON = <path d="M6 6l12 12M18 6 6 18" />;
export const PLUS_ICON = <path d="M12 5v14M5 12h14" />;
export const MORE_ICON = (
  <>
    <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" />
  </>
);
export const IMAGE_ICON = (
  <>
    <rect x="3.5" y="4" width="17" height="16" rx="2" />
    <path d="m5.5 17 4.25-4.25 3 3 2.25-2.25 3.5 3.5" />
    <circle cx="15.5" cy="9" r="1.25" />
  </>
);
export const LINK_ICON = (
  <path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.15-1.15" />
);
export const BOLD_ICON = <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zm0 7h7a3.5 3.5 0 0 1 0 7H7z" />;
export const ITALIC_ICON = <path d="M15 5h-5m4 14H9M14 5l-4 14" />;
export const QUOTE_ICON = <path d="M5 5v14M10 8h9M10 12h9M10 16h6" />;
export const BULLETS_ICON = (
  <>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none" />
  </>
);
export const NUMBERS_ICON = (
  <>
    <path d="M10 6h10M10 12h10M10 18h10" />
    <path d="M4 5.5h1V9M3.6 15.2a1.2 1.2 0 1 1 1.9 1.4L3.6 18.6H5.6" />
  </>
);
export const DIVIDER_ICON = <path d="M4 12h16" />;
export const BACK_ICON = <path d="M19 12H5m6-6-6 6 6 6" />;

export const ALIGNMENT_OPTIONS: ReadonlyArray<{
  value: TextAlignment;
  label: string;
  icon: ReactNode;
}> = [
  { value: "left", label: "Align left", icon: <path d="M4 6h16M4 10h10M4 14h16M4 18h10" /> },
  { value: "center", label: "Align centre", icon: <path d="M4 6h16M7 10h10M4 14h16M7 18h10" /> },
  { value: "right", label: "Align right", icon: <path d="M4 6h16M10 10h10M4 14h16M10 18h10" /> },
  { value: "justify", label: "Justify", icon: <path d="M4 6h16M4 10h16M4 14h16M4 18h16" /> },
];

/**
 * The Article mark from the mockup: a serif "A" on the brand green. It is the
 * one place the Post composer points at the long-form screen, so it reads as
 * a masthead letter rather than another stroke icon.
 */
export function ArticleMark({ className = "h-7 w-7 text-sm" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-md bg-emerald-brand font-semibold text-white publication-article-title ${className}`}
    >
      A
    </span>
  );
}
