/**
 * The two button treatments the write screens share, from the mockup: a
 * filled brand button that goes quiet rather than translucent when it cannot
 * be pressed, and an outlined one beside it. Both keep the 44px touch target.
 * `aria-disabled` looks the same as `disabled` but can still be pressed, for a
 * button that answers a press by saying what is missing.
 */
export const WRITE_PRIMARY_BUTTON =
  "min-h-11 shrink-0 rounded-md px-4 font-semibold disabled:bg-divider disabled:text-ink-muted disabled:opacity-100 aria-disabled:bg-divider aria-disabled:text-ink-muted aria-disabled:hover:bg-divider";

export const WRITE_OUTLINE_BUTTON =
  "flex min-h-11 shrink-0 items-center justify-center rounded-md border border-emerald-brand px-4 text-sm font-semibold text-emerald-ink transition-colors hover:bg-green-wash disabled:cursor-not-allowed disabled:border-divider disabled:text-ink-muted";

export const WRITE_TEXT_BUTTON =
  "flex min-h-11 shrink-0 items-center rounded-md px-2 text-sm text-ink-muted transition-colors hover:text-ink";
