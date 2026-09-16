import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin/",
        "/login",
        "/signup",
        "/forgot-password",
        "/reset-password",
        "/notifications",
        "/settings",
        "/bookmarks",
        "/write",
        "/edit/",
        "/onboarding",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
