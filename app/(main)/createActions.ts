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
    description: "Share a quick thought — publishes immediately, no title needed.",
    badge: "Quick post",
    href: "/create/post",
    category: "write",
  },
  {
    id: "article",
    label: "Article",
    description: "Write a long-form piece with a title — publishes immediately.",
    badge: "Long-form",
    href: "/write?kind=article",
    category: "write",
  },
  {
    id: "research-paper",
    label: "Research Paper",
    description: "Submit a finished research manuscript as a PDF.",
    badge: "PDF review",
    href: "/submit/research",
    category: "write",
  },
];

export function getCreateHref(href: string, userId: string | null) {
  if (userId) return href;
  return `/login?redirectTo=${encodeURIComponent(href)}`;
}
