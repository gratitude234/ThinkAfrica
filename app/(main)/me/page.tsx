import Link from "next/link";
import { redirect } from "next/navigation";
import UserAvatar from "@/components/ui/UserAvatar";
import { canAccessAdminHubForRole } from "@/lib/adminAccess";
import { getUsableProfileUsername } from "@/lib/profileUsername";
import { canReview } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/types";

type HubLink = {
  label: string;
  description: string;
  href: string;
  icon: "writing" | "bookmarks" | "settings" | "review" | "admin";
};

const ACCOUNT_LINKS: HubLink[] = [
  {
    label: "My writing",
    description: "Manage drafts, submissions, and published work.",
    href: "/dashboard",
    icon: "writing",
  },
  {
    label: "Bookmarks",
    description: "Return to the posts and research you saved.",
    href: "/bookmarks",
    icon: "bookmarks",
  },
  {
    label: "Settings",
    description: "Update your profile, security, and preferences.",
    href: "/settings",
    icon: "settings",
  },
];

function HubIcon({ icon }: { icon: HubLink["icon"] }) {
  const paths = {
    writing:
      "M4 5.75A1.75 1.75 0 015.75 4h12.5A1.75 1.75 0 0120 5.75v12.5A1.75 1.75 0 0118.25 20H5.75A1.75 1.75 0 014 18.25V5.75zM8 8h8M8 12h8M8 16h5",
    bookmarks: "M6 4.75A1.75 1.75 0 017.75 3h8.5A1.75 1.75 0 0118 4.75V21l-6-3-6 3V4.75z",
    settings:
      "M12 15.25a3.25 3.25 0 100-6.5 3.25 3.25 0 000 6.5zM19.4 15a1.7 1.7 0 00.34 1.88l.06.06-1.92 3.32-.08-.02a1.7 1.7 0 00-1.8.64l-.04.06h-3.84l-.04-.07a1.7 1.7 0 00-1.8-.63l-.08.02-1.92-3.32.06-.06A1.7 1.7 0 008.6 15l-.02-.08-1.92-3.32.02-.08A1.7 1.7 0 008.34 9.6l-.06-.06 1.92-3.32.08.02a1.7 1.7 0 001.8-.63l.04-.07h3.84l.04.07a1.7 1.7 0 001.8.63l.08-.02 1.92 3.32-.06.06a1.7 1.7 0 00-.34 1.88l.02.08 1.92 3.32-.02.08z",
    review: "M5 4h14v16H5V4zm3 5 2.2 2.2L16 6.5M8 15h8",
    admin: "M12 3l7 3v5c0 4.6-2.9 8.3-7 10-4.1-1.7-7-5.4-7-10V6l7-3zm-2 8 1.5 1.5L15 9",
  } satisfies Record<HubLink["icon"], string>;

  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
      <svg
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d={paths[icon]} />
      </svg>
    </span>
  );
}

function AccountLink({ item }: { item: HubLink }) {
  return (
    <Link
      href={item.href}
      className="group flex min-h-[92px] items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-emerald-200 hover:bg-emerald-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
    >
      <HubIcon icon={item.icon} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900">
          {item.label}
        </span>
        <span className="mt-1 block text-xs leading-5 text-gray-500">
          {item.description}
        </span>
      </span>
      <svg
        className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
      </svg>
    </Link>
  );
}

export default async function MePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/me");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, full_name, avatar_url, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/settings");
  }

  const username = getUsableProfileUsername(profile.username ?? null);
  const displayName =
    profile.full_name?.trim() ||
    username ||
    user.email?.split("@")[0] ||
    "Indegenius member";
  const role = (profile.role ?? "student") as AppRole;
  const canAccessReview = canReview(role);
  const isBootstrapAdmin = Boolean(
    process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL
  );
  const canAccessAdmin = canAccessAdminHubForRole(role, isBootstrapAdmin);
  const links: HubLink[] = [
    ...ACCOUNT_LINKS,
    ...(canAccessReview
      ? [
          {
            label: "Review",
            description: "Open your assigned editorial review queue.",
            href: "/review",
            icon: "review" as const,
          },
        ]
      : []),
    ...(canAccessAdmin
      ? [
          {
            label: "Admin",
            description: "Open the operations and editorial tools.",
            href: "/admin",
            icon: "admin" as const,
          },
        ]
      : []),
  ];
  const profileHref = username ? `/${username}` : "/settings";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm shadow-black/[0.02]">
        <div className="h-14 bg-[radial-gradient(circle_at_18%_0%,rgba(16,185,129,0.18),transparent_42%),linear-gradient(135deg,#FFFFFF,#FAF8F5)]" />
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:pb-6">
          <div className="-mt-7 flex min-w-0 items-end gap-3">
            <UserAvatar
              name={displayName}
              src={profile.avatar_url}
              size={72}
              className="shrink-0 overflow-hidden rounded-full border-4 border-white shadow-sm"
            />
            <div className="min-w-0 pb-1">
              <h1 className="truncate font-display text-2xl font-semibold text-ink">
                {displayName}
              </h1>
              <p className="mt-0.5 truncate text-sm text-gray-500">
                {username ? `@${username}` : user.email}
              </p>
              <p className="mt-1 text-xs font-semibold text-emerald-700">
                Your Intellectual Record
              </p>
            </div>
          </div>

          <Link
            href={profileHref}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            {username ? "Open Intellectual Record" : "Complete profile"}
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-brand">
            Your account
          </p>
          <h2 className="mt-1 text-lg font-semibold text-gray-900">
            Manage your work and preferences
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {links.map((item) => (
            <AccountLink key={item.href} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
