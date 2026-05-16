import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getVisibleAdminNavItems,
  requireAdminHubAccess,
} from "@/lib/adminAccess";
import { AdminAccessError } from "@/lib/supabase/admin";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let context: Awaited<ReturnType<typeof requireAdminHubAccess>>;

  try {
    context = await requireAdminHubAccess();
  } catch (error) {
    if (error instanceof AdminAccessError && error.status === 401) {
      redirect("/login");
    }

    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
        <p className="mt-2 text-sm text-gray-500">
          You don&apos;t have access to this page.
        </p>
        <Link
          href="/review"
          className="mt-5 inline-flex rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-emerald-200 hover:text-emerald-700"
        >
          Open reviewer portal
        </Link>
      </div>
    );
  }

  const navItems = getVisibleAdminNavItems(context);
  const displayName = context.fullName ?? context.username ?? context.email ?? "Admin";

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 pb-16 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-6">
      <aside className="lg:sticky lg:top-[76px] lg:self-start">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-brand">
            Admin
          </p>
          <h1 className="mt-1 text-lg font-semibold text-gray-900">
            Operations Hub
          </h1>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            {displayName}
            {" / "}
            {context.isBootstrapAdmin ? "bootstrap admin" : context.role}
          </p>
          {context.isBootstrapAdmin ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              Bootstrap access is active. Set this account role to admin for
              durable production access.
            </p>
          ) : null}
        </div>

        <nav className="mt-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-white hover:text-emerald-700"
            >
              {item.title}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="min-w-0">{children}</main>
    </div>
  );
}
