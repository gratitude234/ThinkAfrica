"use client";

import { useVisualViewportBottom } from "@/lib/useVisualViewportBottom";

/**
 * The composer deliberately renders without the (main) NavigationShell, so
 * nothing here used to publish `--mobile-visual-viewport-bottom`. The
 * composer's fixed formatting toolbar read the 0px fallback and sat under
 * the soft keyboard while typing, which is the one moment it is needed.
 */
export default function WriteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useVisualViewportBottom();

  return children;
}
