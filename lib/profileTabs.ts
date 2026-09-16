import { resolveContentKind } from "@/lib/contentModel";

export const PUBLIC_PROFILE_TABS = ["posts", "articles", "about"] as const;
export const OWNER_PROFILE_TABS = ["posts", "articles", "drafts", "about"] as const;
export const PROFILE_TABS = PUBLIC_PROFILE_TABS;

export type ProfileTab = (typeof OWNER_PROFILE_TABS)[number];
export const DEFAULT_PROFILE_TAB: ProfileTab = "posts";

export const PROFILE_TAB_LABELS: Record<ProfileTab, string> = {
  posts: "Posts",
  articles: "Articles",
  drafts: "Drafts",
  about: "About",
};

export type ProfilePublicationKind = "post" | "article";

export const PROFILE_TAB_KIND: Record<
  Exclude<ProfileTab, "about" | "drafts">,
  ProfilePublicationKind
> = {
  posts: "post",
  articles: "article",
};

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
    typeof value === "string" &&
    (OWNER_PROFILE_TABS as readonly string[]).includes(value)
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

export function resolveProfilePage(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(first(value) ?? "", 10);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 500);
}

export function profileTabHref(username: string, tab: ProfileTab, page = 1) {
  const params = new URLSearchParams();
  if (tab !== DEFAULT_PROFILE_TAB) params.set("view", tab);
  if (page > 1 && tab !== "about" && tab !== "drafts") params.set("page", String(page));
  const query = params.toString();
  return `/${username}${query ? `?${query}` : ""}`;
}