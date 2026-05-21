import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL, absoluteUrl } from "@/lib/site";

export const revalidate = 3600;

type SitemapRow = {
  url: string;
  lastModified?: string | Date;
  changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority?: number;
};

const staticRoutes: SitemapRow[] = [
  { url: SITE_URL, changeFrequency: "daily", priority: 1 },
  { url: absoluteUrl("/landing"), changeFrequency: "weekly", priority: 0.9 },
  { url: absoluteUrl("/explore"), changeFrequency: "hourly", priority: 0.9 },
  { url: absoluteUrl("/debates"), changeFrequency: "daily", priority: 0.8 },
  { url: absoluteUrl("/opportunities"), changeFrequency: "daily", priority: 0.8 },
  { url: absoluteUrl("/about"), changeFrequency: "monthly", priority: 0.6 },
  { url: absoluteUrl("/topics"), changeFrequency: "weekly", priority: 0.7 },
  { url: absoluteUrl("/editorial-standards"), changeFrequency: "monthly", priority: 0.5 },
  { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.2 },
  { url: absoluteUrl("/terms"), changeFrequency: "yearly", priority: 0.2 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const supabase = createAdminClient();

    const [postsResult, debatesResult, profilesResult] = await Promise.all([
      supabase
        .from("posts")
        .select("slug, published_at, created_at")
        .eq("status", "published")
        .not("slug", "is", null)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(1000),
      supabase
        .from("debates")
        .select("id, created_at, ends_at")
        .in("status", ["open", "active", "closed"])
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("profiles")
        .select("username, created_at")
        .not("username", "is", null)
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);

    const postRoutes =
      postsResult.data?.map((post) => ({
        url: absoluteUrl(`/post/${post.slug}`),
        lastModified: post.published_at ?? post.created_at ?? undefined,
        changeFrequency: "weekly" as const,
        priority: 0.75,
      })) ?? [];

    const debateRoutes =
      debatesResult.data?.map((debate) => ({
        url: absoluteUrl(`/debates/${debate.id}`),
        lastModified: debate.ends_at ?? debate.created_at ?? undefined,
        changeFrequency: "daily" as const,
        priority: 0.65,
      })) ?? [];

    const profileRoutes =
      profilesResult.data
        ?.filter((profile) => Boolean(profile.username))
        .map((profile) => ({
          url: absoluteUrl(`/${profile.username}`),
          lastModified: profile.created_at ?? undefined,
          changeFrequency: "weekly" as const,
          priority: 0.55,
        })) ?? [];

    return [...staticRoutes, ...postRoutes, ...debateRoutes, ...profileRoutes];
  } catch (error) {
    console.error("[sitemap] failed to build dynamic sitemap", error);
    return staticRoutes;
  }
}
