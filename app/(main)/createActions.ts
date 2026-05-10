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
    id: "quick-take",
    label: "Quick Take",
    description: "Share one clear thought, observation, or question.",
    badge: "Fast publish",
    href: "/write?type=blog&starter=1",
    category: "write",
  },
  {
    id: "essay",
    label: "Essay",
    description: "Build a structured argument or commentary.",
    badge: "Medium effort",
    href: "/write?type=essay&starter=1",
    category: "write",
  },
  {
    id: "policy-brief",
    label: "Policy Brief",
    description: "Frame a problem, evidence, options, and recommendation.",
    badge: "Editorial review",
    href: "/write?type=policy_brief&starter=1",
    category: "write",
  },
  {
    id: "research-paper",
    label: "Research Paper",
    description: "Submit serious academic work with references.",
    badge: "Peer review",
    href: "/write?type=research&starter=1",
    category: "write",
  },
];

export function getCreateHref(href: string, userId: string | null) {
  if (userId) return href;
  return `/login?redirectTo=${encodeURIComponent(href)}`;
}
