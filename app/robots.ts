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
        "/messages/",
        "/notifications",
        "/settings",
        "/dashboard",
        "/bookmarks",
        "/write",
        "/edit/",
        "/review/",
        "/onboarding",
        "/stats",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
