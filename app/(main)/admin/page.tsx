import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canReview } from "@/lib/roles";
import type { AppRole } from "@/lib/types";

type AdminLink = {
  href: string;
  title: string;
  description: string;
  roles: AppRole[];
  bootstrapOnly?: boolean;
};

const ADMIN_LINKS: AdminLink[] = [
  {
    href: "/admin/review",
    title: "Editorial Queue",
    description: "Review submissions, assign reviewers, and feature posts.",
    roles: ["reviewer", "editor", "admin"],
  },
  {
    href: "/admin/verification",
    title: "Contributor Verification",
    description: "Verify eligible contributors and manage profile roles.",
    roles: ["admin"],
  },
  {
    href: "/admin/analytics",
    title: "Analytics",
    description: "Review platform activity and growth signals.",
    roles: ["admin"],
    bootstrapOnly: true,
  },
  {
    href: "/admin/digest",
    title: "Digest",
    description: "Prepare and send editorial digests.",
    roles: ["admin"],
    bootstrapOnly: true,
  },
  {
    href: "/admin/fellowships",
    title: "Opportunities",
    description: "Manage curated opportunities and applications.",
    roles: ["admin"],
    bootstrapOnly: true,
  },
  {
    href: "/admin/partners",
    title: "Partners",
    description: "Manage partner entries and visibility.",
    roles: ["admin"],
    bootstrapOnly: true,
  },
  {
    href: "/admin/sponsors",
    title: "Sponsors",
    description: "Manage sponsor entries and visibility.",
    roles: ["admin"],
    bootstrapOnly: true,
  },
  {
    href: "/admin/ambassadors",
    title: "Ambassadors",
    description: "Review ambassador applications.",
    roles: ["admin"],
    bootstrapOnly: true,
  },
] as const;

export default async function AdminIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, username")
    .eq("id", user.id)
    .single();

  const adminEmail = process.env.ADMIN_EMAIL;
  const isBootstrapAdmin = Boolean(adminEmail && user.email === adminEmail);
  const role = profile?.role ?? "student";
  const isRoleAdmin = role === "admin";
  const canAccessAdmin = isBootstrapAdmin || isRoleAdmin || canReview(role);

  if (!canAccessAdmin) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
        <p className="mt-2 text-sm text-gray-500">
          You don&apos;t have access to this page.
        </p>
      </div>
    );
  }

  const visibleLinks = ADMIN_LINKS.filter((link) => {
    if (link.bootstrapOnly && !isBootstrapAdmin) return false;
    if (isBootstrapAdmin) return true;
    if (isRoleAdmin) return link.roles.includes("admin");
    return link.roles.some((allowedRole) => allowedRole === role);
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-brand">
          Admin
        </p>
        <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-ink">
          Control Center
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Signed in as {profile?.full_name ?? profile?.username ?? user.email} ·{" "}
          {isBootstrapAdmin ? "bootstrap admin" : role}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
          >
            <h2 className="text-base font-semibold text-gray-900">
              {link.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              {link.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
