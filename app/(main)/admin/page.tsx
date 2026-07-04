import Link from "next/link";
import {
  getVisibleAdminNavItems,
  requireAdminHubAccess,
} from "@/lib/adminAccess";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";

function StatCard({
  href,
  label,
  value,
  helper,
}: {
  href: string;
  label: string;
  value: number;
  helper: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
    >
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-sm text-gray-500">{helper}</p>
    </Link>
  );
}

export default async function AdminIndexPage() {
  const context = await requireAdminHubAccess();
  const admin = createAdminClient();
  const visibleLinks = getVisibleAdminNavItems(context);

  const [
    { count: pendingEditorialCount },
    { count: pendingApplicationsCount },
    { count: pendingAmbassadorsCount },
    { count: pendingReportsCount },
    { data: publishedAuthorRows },
    { data: recentAuditRows },
  ] = await Promise.all([
    admin
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .in("type", ["research", "policy_brief"]),
    admin
      .from("fellowship_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("campus_ambassadors")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("posts")
      .select("author_id")
      .eq("status", "published"),
    admin
      .from("admin_audit_events")
      .select("id, actor_email, action, target_table, target_id, created_at")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const verificationCandidates = new Set<string>();
  const authorCounts = new Map<string, number>();
  for (const row of publishedAuthorRows ?? []) {
    const nextCount = (authorCounts.get(row.author_id) ?? 0) + 1;
    authorCounts.set(row.author_id, nextCount);
    if (nextCount >= 3) {
      verificationCandidates.add(row.author_id);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-brand">
          Admin
        </p>
        <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-ink">
          Operations Dashboard
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Capability-based admin access for editorial, user trust, opportunities,
          and platform operations.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          href="/admin/review"
          label="Editorial queue"
          value={pendingEditorialCount ?? 0}
          helper="Research and policy briefs awaiting action"
        />
        <StatCard
          href="/admin/fellowships"
          label="Applications"
          value={pendingApplicationsCount ?? 0}
          helper="Opportunity applications pending review"
        />
        <StatCard
          href="/admin/verification"
          label="Verification candidates"
          value={verificationCandidates.size}
          helper="Contributors with 3+ published posts"
        />
        <StatCard
          href="/admin/ambassadors"
          label="Ambassador requests"
          value={pendingAmbassadorsCount ?? 0}
          helper="Campus ambassador requests pending"
        />
        <StatCard
          href="/admin/moderation"
          label="Open reports"
          value={pendingReportsCount ?? 0}
          helper="User reports awaiting moderation"
        />
      </div>

      <section>
        <h2 className="text-base font-semibold text-gray-900">Admin areas</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
            >
              <h3 className="text-sm font-semibold text-gray-900">{link.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                {link.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Recent admin activity
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Sensitive admin actions are recorded for audit review.
            </p>
          </div>
        </div>
        <div className="mt-4 divide-y divide-gray-100">
          {(recentAuditRows ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              No admin audit events recorded yet.
            </p>
          ) : (
            (recentAuditRows ?? []).map((event) => (
              <div
                key={event.id}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {event.action}
                  </p>
                  <p className="text-xs text-gray-500">
                    {event.actor_email ?? "Unknown admin"}
                    {event.target_table ? ` / ${event.target_table}` : ""}
                  </p>
                </div>
                <p className="text-xs text-gray-400">
                  {formatDate(event.created_at)}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
