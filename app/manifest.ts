import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Indegenius",
    short_name: "Indegenius",
    description:
      "Research, essays, and policy briefs from African university students.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FAF8F5",
    theme_color: "#073929",
    orientation: "portrait",
    icons: [
      {
        src: "/indegenius-app-icon-transparent-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/indegenius-app-icon-transparent-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // GAP: no maskable icon. Android adaptive/maskable icons need the
      // artwork confined to the inner ~66% "safe zone" with padding around
      // it, or Android crops it into a circle/squircle and clips content.
      // The Indegenius asset pack (as of 2026-07-07) doesn't include a
      // padded maskable variant, so we're intentionally not declaring
      // purpose: "maskable" against an unpadded icon here. Add one when a
      // properly-padded maskable export exists.
    ],
  };
}
