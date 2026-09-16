import { resolveContentKind } from "@/lib/contentModel";

/**
 * A writer's profile is three tabs: Posts, Articles and About.
 *
 * The publishing reset, Phase 2G, replaced the Intellectual Record overview
 * and the separate full record with these. Every retired address still opens
 * something. An old `?view=` value (overview, research, responses, record)
 * opens the default tab, and the record's `?type=posts` or `?type=articles`
 * opens the matching one, which is where a bookmarked `/username/record?type=`
 * lands after the redirect in next.config.mjs.
 */
export const PROFILE_TABS = ["posts", "articles", "about"] as const;

export type ProfileTab = (typeof PROFILE_TABS)[number];

export const DEFAULT_PROFILE_TAB: ProfileTab = "posts";

export const PROFILE_TAB_LABELS: Record<ProfileTab, string> = {
  posts: "Posts",
  articles: "Articles",
  about: "About",
};

/** The two kinds of publication a profile lists. */
export type ProfilePublicationKind = "post" | "article";

export const PROFILE_TAB_KIND: Record<Exclude<ProfileTab, "about">, ProfilePublicationKind> = {
  posts: "post",
  articles: "article",
};

/**
 * Which tab a publication belongs on, or null for a row no tab lists.
 *
 * This used to also carry the legacy `posts.type` values each tab selected, so
 * a query could ask for "essay, policy_brief and research" as well as
 * "article". Phase 2I normalized those rows: a writer's old Research paper or
 * Policy Brief carries content_kind 'article' now and lands on Articles
 * because it is one, not because a mapping table says so.
 */
export function profilePublicationKind(row: {
  content_kind?: string | null;
}): ProfilePublicationKind | null {
  return resolveContentKind(row);
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function isProfileTab(value: unknown): value is ProfileTab {
  return (
    typeof value === "string" && (PROFILE_TABS as readonly string[]).includes(value)
  );
}

export function resolveProfileTab(query: {
  view?: string | string[];
  type?: string | string[];
}): ProfileTab {
  const view = first(query.view);
  if (isProfileTab(view)) return view;

  const type = first(query.type);
  if (type === "posts" || type === "articles") return type;

  return DEFAULT_PROFILE_TAB;
}

/** A positive page number, or 1 for anything else. Capped so a crafted URL
 *  cannot ask the database for an offset nobody could have paged to. */
export function resolveProfilePage(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(first(value) ?? "", 10);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 500);
}

export function profileTabHref(username: string, tab: ProfileTab, page = 1) {
  const params = new URLSearchParams();
  if (tab !== DEFAULT_PROFILE_TAB) params.set("view", tab);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/${username}${query ? `?${query}` : ""}`;
}
