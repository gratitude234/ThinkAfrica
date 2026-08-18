import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { absoluteUrl } from "@/lib/site";
import { isLowQualityTitle } from "@/lib/postQuality";
import { isLightweightPost } from "@/lib/postDisplay";

export const revalidate = 3600;

// The whole sitemap is produced by a single render, and static generation on
// Vercel aborts a route that takes longer than 60s. Keep the database work well
// under that budget: a slow or unreachable Supabase instance should degrade the
// sitemap, never fail the build. The next revalidation picks the URLs back up.
const QUERY_TIMEOUT_MS = Number(process.env.SITEMAP_QUERY_TIMEOUT_MS ?? 20_000);

type SitemapRow = {
  url: string;
  lastModified?: string | Date;
  changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority?: number;
};

type QueryResponse<T> = { data: T[] | null; error: { message: string } | null };

type PostRow = {
  slug: string | null;
  title: string | null;
  type: string | null;
  content_kind: string | null;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};
type DebateRow = { id: string; created_at: string | null; ends_at: string | null };
type ProfileRow = {
  id: string;
  username: string | null;
  created_at: string | null;
  privacy_settings: unknown;
  bio: string | null;
};
type AuthorRow = { author_id: string | null };
type ResearchProjectRow = { slug: string | null; updated_at: string | null };
type ResearcherProfileRow = { user_id: string | null };

const staticRoutes: SitemapRow[] = [
  { url: absoluteUrl("/landing"), changeFrequency: "daily", priority: 1 },
  { url: absoluteUrl("/explore"), changeFrequency: "hourly", priority: 0.9 },
  { url: absoluteUrl("/debates"), changeFrequency: "daily", priority: 0.8 },
  { url: absoluteUrl("/campus"), changeFrequency: "daily", priority: 0.75 },
  { url: absoluteUrl("/research"), changeFrequency: "daily", priority: 0.8 },
  { url: absoluteUrl("/opportunities"), changeFrequency: "daily", priority: 0.8 },
  { url: absoluteUrl("/about"), changeFrequency: "monthly", priority: 0.6 },
  { url: absoluteUrl("/topics"), changeFrequency: "weekly", priority: 0.7 },
  { url: absoluteUrl("/editorial-standards"), changeFrequency: "monthly", priority: 0.5 },
  { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.3 },
  { url: absoluteUrl("/terms"), changeFrequency: "yearly", priority: 0.3 },
];

// Resolves to the query's rows, or to [] when it errors or misses the shared
// deadline -- one unhealthy table drops its own URLs instead of the sitemap.
async function collect<T>(
  label: string,
  query: PromiseLike<QueryResponse<T>>,
  deadline: Promise<null>
): Promise<T[]> {
  try {
    const result = await Promise.race([query, deadline]);
    if (!result) {
      console.warn(`[sitemap] ${label} exceeded ${QUERY_TIMEOUT_MS}ms, omitting those URLs`);
      return [];
    }
    if (result.error) {
      console.warn(`[sitemap] ${label} failed`, result.error);
      return [];
    }
    return result.data ?? [];
  } catch (error) {
    console.warn(`[sitemap] ${label} failed`, error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (error) {
    console.error("[sitemap] admin client unavailable, serving static routes only", error);
    return staticRoutes;
  }

  // One deadline shared by every query, plus an abort signal so whatever is
  // still in flight when it passes stops holding the render open.
  const controller = new AbortController();
  let expire: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    expire = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, QUERY_TIMEOUT_MS);
  });
  const signal = controller.signal;

  try {
    const [
      posts,
      debates,
      profiles,
      publishedAuthors,
      researchProjects,
      researcherProfiles,
    ] = await Promise.all([
      collect<PostRow>(
        "posts",
        supabase
          .from("posts")
          .select("slug, title, type, content_kind, published_at, created_at, updated_at")
          .eq("status", "published")
          .not("slug", "is", null)
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(1000)
          .abortSignal(signal),
        deadline
      ),
      collect<DebateRow>(
        "debates",
        supabase
          .from("debates")
          .select("id, created_at, ends_at")
          .in("status", ["open", "active", "closed"])
          .order("created_at", { ascending: false })
          .limit(500)
          .abortSignal(signal),
        deadline
      ),
      collect<ProfileRow>(
        "profiles",
        supabase
          .from("profiles")
          .select("id, username, created_at, privacy_settings, bio")
          .not("username", "is", null)
          .order("created_at", { ascending: false })
          .limit(1000)
          .abortSignal(signal),
        deadline
      ),
      // Only used to check "does this author have a published post" for the
      // profile content gate below — a thin author_id-only scan, not paginated
      // with the main posts query above.
      collect<AuthorRow>(
        "published authors",
        supabase
          .from("posts")
          .select("author_id")
          .eq("status", "published")
          .limit(5000)
          .abortSignal(signal),
        deadline
      ),
      collect<ResearchProjectRow>(
        "research projects",
        supabase
          .from("research_projects")
          .select("slug, updated_at")
          .eq("visibility", "public")
          .neq("status", "archived")
          .order("updated_at", { ascending: false })
          .limit(1000)
          .abortSignal(signal),
        deadline
      ),
      collect<ResearcherProfileRow>(
        "researcher profiles",
        supabase.from("researcher_profiles").select("user_id").limit(5000).abortSignal(signal),
        deadline
      ),
    ]);

    const authorsWithPublishedPosts = new Set(publishedAuthors.map((row) => row.author_id));
    const profilesWithResearchPractice = new Set(researcherProfiles.map((row) => row.user_id));

    const postRoutes = posts
      .filter(
        (post) =>
          // A genuinely titleless lightweight Post has no title to judge
          // for quality -- don't let its absence exclude it from the
          // sitemap. A legacy titled Blog (also resolves to "post") still
          // goes through the normal title-quality check below, same as
          // any other titled content -- resolveContentKind() alone would
          // wrongly exempt a titled Blog named "test" or "untitled" too.
          isLightweightPost(post) || !isLowQualityTitle(post.title)
      )
      .map((post) => ({
        url: absoluteUrl(`/post/${post.slug}`),
        lastModified: post.updated_at ?? post.published_at ?? post.created_at ?? undefined,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));

    const debateRoutes = debates.map((debate) => ({
      url: absoluteUrl(`/debates/${debate.id}`),
      lastModified: debate.ends_at ?? debate.created_at ?? undefined,
      changeFrequency: "daily" as const,
      priority: 0.65,
    }));

    const profileRoutes = profiles
      .filter((profile) => {
        if (!profile.username) return false;
        const visibility = (profile.privacy_settings as { profile_visibility?: string } | null)
          ?.profile_visibility;
        if (visibility === "members_only") return false;

        const hasBio = Boolean(profile.bio?.trim());
        const hasPublishedPost = authorsWithPublishedPosts.has(profile.id);
        return hasBio || hasPublishedPost || profilesWithResearchPractice.has(profile.id);
      })
      .map((profile) => ({
        url: absoluteUrl(`/${profile.username}`),
        lastModified: profile.created_at ?? undefined,
        changeFrequency: "weekly" as const,
        priority: 0.55,
      }));

    const researchProjectRoutes = researchProjects.map((project) => ({
      url: absoluteUrl(`/research/projects/${project.slug}`),
      lastModified: project.updated_at ?? undefined,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    return [
      ...staticRoutes,
      ...postRoutes,
      ...debateRoutes,
      ...researchProjectRoutes,
      ...profileRoutes,
    ];
  } catch (error) {
    console.error("[sitemap] failed to build dynamic sitemap", error);
    return staticRoutes;
  } finally {
    clearTimeout(expire);
  }
}
