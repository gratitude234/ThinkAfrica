import "server-only";

import { createAdminClient, AdminAccessError } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/types";

export type AdminCapability =
  | "admin.full"
  | "editorial.manage"
  | "review.assigned"
  | "users.verify"
  | "opportunities.manage"
  | "partners.manage"
  | "sponsors.manage"
  | "ambassadors.manage"
  | "analytics.view"
  | "digest.manage";

export interface AdminContext {
  userId: string;
  email: string | null;
  role: AppRole;
  fullName: string | null;
  username: string | null;
  isBootstrapAdmin: boolean;
  capabilities: AdminCapability[];
}

export type AdminNavItem = {
  href: string;
  title: string;
  description: string;
  capability: AdminCapability;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    href: "/admin/review",
    title: "Editorial Queue",
    description: "Assign reviewers and make final editorial decisions.",
    capability: "editorial.manage",
  },
  {
    href: "/admin/verification",
    title: "Contributor Verification",
    description: "Verify contributors and manage reviewer/editor roles.",
    capability: "users.verify",
  },
  {
    href: "/admin/fellowships",
    title: "Opportunities",
    description: "Manage curated opportunities and applications.",
    capability: "opportunities.manage",
  },
  {
    href: "/admin/ambassadors",
    title: "Ambassadors",
    description: "Review ambassador applications.",
    capability: "ambassadors.manage",
  },
  {
    href: "/admin/partners",
    title: "Partners",
    description: "Manage institutional partner visibility.",
    capability: "partners.manage",
  },
  {
    href: "/admin/sponsors",
    title: "Sponsors",
    description: "Manage sponsor placements.",
    capability: "sponsors.manage",
  },
  {
    href: "/admin/analytics",
    title: "Analytics",
    description: "Review platform activity and growth signals.",
    capability: "analytics.view",
  },
  {
    href: "/admin/digest",
    title: "Digest",
    description: "Preview the weekly editorial digest.",
    capability: "digest.manage",
  },
];

const FULL_ADMIN_CAPABILITIES: AdminCapability[] = [
  "admin.full",
  "editorial.manage",
  "review.assigned",
  "users.verify",
  "opportunities.manage",
  "partners.manage",
  "sponsors.manage",
  "ambassadors.manage",
  "analytics.view",
  "digest.manage",
];

export function getAdminCapabilitiesForRole(
  role: AppRole,
  isBootstrapAdmin: boolean
): AdminCapability[] {
  if (isBootstrapAdmin || role === "admin") {
    return FULL_ADMIN_CAPABILITIES;
  }

  if (role === "editor") {
    return ["editorial.manage", "review.assigned"];
  }

  if (role === "reviewer") {
    return ["review.assigned"];
  }

  return [];
}

export function canAccessAdminHubForRole(
  role: AppRole | null | undefined,
  isBootstrapAdmin: boolean
) {
  const capabilities = getAdminCapabilitiesForRole(role ?? "student", isBootstrapAdmin);
  return ADMIN_NAV_ITEMS.some(
    (item) =>
      capabilities.includes("admin.full") || capabilities.includes(item.capability)
  );
}

export function hasCapability(
  context: Pick<AdminContext, "capabilities"> | null,
  capability: AdminCapability
) {
  if (!context) return false;
  return (
    context.capabilities.includes("admin.full") ||
    context.capabilities.includes(capability)
  );
}

export function getVisibleAdminNavItems(context: AdminContext) {
  return ADMIN_NAV_ITEMS.filter((item) => hasCapability(context, item.capability));
}

export function hasAdminHubAccess(context: AdminContext | null) {
  if (!context) return false;
  return getVisibleAdminNavItems(context).length > 0;
}

export async function getAdminContext(): Promise<AdminContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, username")
    .eq("id", user.id)
    .maybeSingle();

  const role = ((profile?.role ?? "student") as AppRole) ?? "student";
  const isBootstrapAdmin = Boolean(
    process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL
  );

  return {
    userId: user.id,
    email: user.email ?? null,
    role,
    fullName: profile?.full_name ?? null,
    username: profile?.username ?? null,
    isBootstrapAdmin,
    capabilities: getAdminCapabilitiesForRole(role, isBootstrapAdmin),
  };
}

export async function requireCapability(capability: AdminCapability) {
  const context = await getAdminContext();

  if (!context) {
    throw new AdminAccessError("You must be signed in.", 401);
  }

  if (!hasCapability(context, capability)) {
    throw new AdminAccessError("You do not have permission to access this admin area.", 403);
  }

  return context;
}

export async function requireAdminHubAccess() {
  const context = await getAdminContext();

  if (!context) {
    throw new AdminAccessError("You must be signed in.", 401);
  }

  if (!hasAdminHubAccess(context)) {
    throw new AdminAccessError("You do not have admin access.", 403);
  }

  return context;
}

export async function createAdminActionClient(capability: AdminCapability) {
  const context = await requireCapability(capability);
  return {
    admin: createAdminClient(),
    context,
  };
}

export async function recordAdminAuditEvent(input: {
  action: string;
  targetTable?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  context?: AdminContext;
  admin?: ReturnType<typeof createAdminClient>;
}) {
  const context = input.context ?? (await getAdminContext());
  if (!context) return;

  const admin = input.admin ?? createAdminClient();
  await admin.from("admin_audit_events").insert({
    actor_id: context.userId,
    actor_email: context.email,
    action: input.action,
    target_table: input.targetTable ?? null,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? {},
  });
}
