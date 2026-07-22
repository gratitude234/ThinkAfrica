export type CreateActionCategory = "write" | "community" | "profile";

export interface CreateAction {
  id: string;
  label: string;
  description: string;
  badge: string;
  href: string;
  category: CreateActionCategory;
}

export const CREATE_ACTIONS: CreateAction[] = [
  {
    id: "post",
    label: "Post",
    description: "Share a quick thought, question, or update.",
    badge: "No title required",
    href: "/create/post",
    category: "write",
  },
  {
    id: "article",
    label: "Article",
    description: "Develop an idea in a structured long-form piece.",
    // "kind=article" is the preferred, stable URL for the Article composer --
    // see the matching comment in app/(write)/write/page.tsx. Essay and
    // Policy Brief are genres chosen later inside that composer, never
    // separate top-level destinations.
    badge: "Essay or Policy Brief optional",
    href: "/write?kind=article",
    category: "write",
  },
  {
    id: "research-paper",
    label: "Research Paper",
    description: "Upload formal academic research.",
    badge: "Editorial review required",
    href: "/submit/research",
    category: "write",
  },
];

// Shared copy for the Create chooser's header, reused by both the mobile
// bottom sheet and the desktop popover so the two presentations never drift.
export const CREATE_CHOOSER_TITLE = "Create";
export const CREATE_CHOOSER_SUBTITLE = "What would you like to share?";

export function getCreateHref(href: string, userId: string | null) {
  if (userId) return href;
  return `/login?redirectTo=${encodeURIComponent(href)}`;
}
