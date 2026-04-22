export type AppRole = "student" | "reviewer" | "editor" | "admin";

export function canReview(role: AppRole) {
  return ["reviewer", "editor", "admin"].includes(role);
}

export function canPublish(role: AppRole) {
  return ["editor", "admin"].includes(role);
}
