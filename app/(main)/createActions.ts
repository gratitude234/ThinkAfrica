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
    id: "write",
    label: "Write",
    description: "Start writing now — choose the format when you publish.",
    badge: "Start writing",
    href: "/write",
    category: "write",
  },
  {
    id: "research-paper",
    label: "Upload research paper",
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
