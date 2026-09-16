import Link from "next/link";
import { getVisibleAdminNavItems, requireAdminHubAccess } from "@/lib/adminAccess";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";

function StatCard({ href, label, value, helper }: {
  href: string;
  label: string;
  value: number;
  helper: string;
}) {
  return (
    <Link href={href} className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value.toLocaleString()}</p>
      <p className="mt-1 text-sm text-gray-500">{helper}</p>
    </Link>
  );
}

export default async function AdminIndexPage() {
  const context = await requireAdminHubAccess();
  const admin = createAdminClient();
  const visibleLinks = getVisibleAdminNavItems(context);
  const [
    { count: userCount },
    { count: publicationCount },
    { count: pendingReportsCount },
    { data: recentAuditRows },
  ] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("posts").select("id", { count: "exact", head: true }).eq("status", "published"),
    admin.from("reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin
      .from("admin_audit_events")
      .select("id, actor_email, action, target_table, target_id, created_at")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-brand">Admin</p>
        <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-ink">Platform operations</h1>
        <p className="mt-2 text-sm text-gray-500">Moderation, account support, communications, and basic platform health.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard href="/admin/users" label="Users" value={userCount ?? 0} helper="Registered accounts" />
        <StatCard href="/explore" label="Publications" value={publicationCount ?? 0} helper="Published posts and articles" />
        <StatCard href="/admin/moderation" label="Open reports" value={pendingReportsCount ?? 0} helper="Awaiting moderation" />
      </div>

      <section>
        <h2 className="text-base font-semibold text-gray-900">Admin areas</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleLinks.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md">
              <h3 className="text-sm font-semibold text-gray-900">{link.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">{link.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-base font-semibold text-gray-900">Recent admin activity</h2>
        <p className="mt-1 text-sm text-gray-500">Security-sensitive actions remain available for audit review.</p>
        <div className="mt-4 divide-y divide-gray-100">
          {(recentAuditRows ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No admin audit events recorded yet.</p>
          ) : (
            (recentAuditRows ?? []).map((event) => (
              <div key={event.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{event.action}</p>
                  <p className="text-xs text-gray-500">
                    {event.actor_email ?? "Unknown admin"}{event.target_table ? ` / ${event.target_table}` : ""}
                  </p>
                </div>
                <p className="text-xs text-gray-400">{formatDate(event.created_at)}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}