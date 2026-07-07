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
    theme_color: "#10B981",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
