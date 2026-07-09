import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL, absoluteUrl } from "@/lib/site";
import { isLowQualityTitle } from "@/lib/postQuality";

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
  { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.3 },
  { url: absoluteUrl("/terms"), changeFrequency: "yearly", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const supabase = createAdminClient();

    const [postsResult, debatesResult, profilesResult, publishedAuthorsResult] = await Promise.all([
      supabase
        .from("posts")
        .select("slug, title, published_at, created_at, updated_at")
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
        .select("id, username, created_at, privacy_settings, bio")
        .not("username", "is", null)
        .order("created_at", { ascending: false })
        .limit(1000),
      // Only used to check "does this author have a published post" for the
      // profile content gate below — a thin author_id-only scan, not paginated
      // with the main posts query above.
      supabase.from("posts").select("author_id").eq("status", "published").limit(5000),
    ]);

    const authorsWithPublishedPosts = new Set(
      publishedAuthorsResult.data?.map((row) => row.author_id) ?? []
    );

    const postRoutes =
      postsResult.data
        ?.filter((post) => !isLowQualityTitle(post.title))
        .map((post) => ({
          url: absoluteUrl(`/post/${post.slug}`),
          lastModified: post.updated_at ?? post.published_at ?? post.created_at ?? undefined,
          changeFrequency: "weekly" as const,
          priority: 0.8,
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
        ?.filter((profile) => {
          if (!profile.username) return false;
          const visibility = (profile.privacy_settings as { profile_visibility?: string } | null)
            ?.profile_visibility;
          if (visibility === "members_only") return false;

          const hasBio = Boolean(profile.bio?.trim());
          const hasPublishedPost = authorsWithPublishedPosts.has(profile.id);
          return hasBio || hasPublishedPost;
        })
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
