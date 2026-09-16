import "server-only";

import { createAdminClient, AdminAccessError } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/types";

export type AdminCapability =
  | "admin.full"
  | "users.manage"
  | "users.verify"
  | "moderation.manage"
  | "communications.manage"
  | "communications.send_as_executive";

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
    href: "/admin/users",
    title: "Users",
    description: "Find accounts and review account status.",
    capability: "users.manage",
  },
  {
    href: "/admin/moderation",
    title: "Moderation",
    description: "Review reports, remove content, and manage suspensions.",
    capability: "moderation.manage",
  },
  {
    href: "/admin/communications",
    title: "Communications",
    description: "Send platform announcements to the community.",
    capability: "communications.manage",
  },
];

const FULL_ADMIN_CAPABILITIES: AdminCapability[] = [
  "admin.full",
  "users.manage",
  "users.verify",
  "moderation.manage",
  "communications.manage",
  "communications.send_as_executive",
];

export function getAdminCapabilitiesForRole(
  role: AppRole,
  isBootstrapAdmin: boolean
): AdminCapability[] {
  return isBootstrapAdmin || role === "admin" ? FULL_ADMIN_CAPABILITIES : [];
}

export function canAccessAdminHubForRole(
  role: AppRole | null | undefined,
  isBootstrapAdmin: boolean
) {
  return getAdminCapabilitiesForRole(role ?? "student", isBootstrapAdmin).length > 0;
}

export function hasCapability(
  context: Pick<AdminContext, "capabilities"> | null,
  capability: AdminCapability
) {
  if (!context) return false;
  return context.capabilities.includes("admin.full") || context.capabilities.includes(capability);
}

export function getVisibleAdminNavItems(context: AdminContext) {
  return ADMIN_NAV_ITEMS.filter((item) => hasCapability(context, item.capability));
}

export function hasAdminHubAccess(context: AdminContext | null) {
  return Boolean(context && getVisibleAdminNavItems(context).length > 0);
}

export async function getAdminContext(): Promise<AdminContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

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
  if (!context) throw new AdminAccessError("You must be signed in.", 401);
  if (!hasCapability(context, capability)) {
    throw new AdminAccessError("You do not have permission to access this admin area.", 403);
  }
  return context;
}

export async function requireAdminHubAccess() {
  const context = await getAdminContext();
  if (!context) throw new AdminAccessError("You must be signed in.", 401);
  if (!hasAdminHubAccess(context)) {
    throw new AdminAccessError("You do not have admin access.", 403);
  }
  return context;
}

export async function createAdminActionClient(capability: AdminCapability) {
  const context = await requireCapability(capability);
  return { admin: createAdminClient(), context };
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