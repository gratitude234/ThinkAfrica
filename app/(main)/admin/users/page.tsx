import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminActionClient } from "@/lib/adminAccess";
import { AdminAccessError, createAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/lib/types";

interface UserRow {
  id: string;
  full_name: string | null;
  username: string;
  role: AppRole;
  created_at: string;
}

export default async function AdminUsersPage() {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = (await createAdminActionClient("users.manage")).admin;
  } catch (error) {
    if (error instanceof AdminAccessError && error.status === 401) redirect("/login");
    return <div className="py-20 text-center text-gray-500">Access denied.</div>;
  }

  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, username, role, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const users = (data ?? []) as UserRow[];

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="mt-1 text-sm text-gray-500">Recent accounts. Account restrictions remain in Moderation.</p>
      </header>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Could not load users.</p>
      ) : users.length === 0 ? (
        <p className="py-16 text-center text-gray-400">No users found.</p>
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <Link href={`/${user.username}`} className="font-semibold text-gray-900 hover:text-emerald-700">
                  {user.full_name?.trim() || `@${user.username}`}
                </Link>
                <p className="truncate text-sm text-gray-500">@{user.username}</p>
              </div>
              <span className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600">
                {user.role === "admin" ? "Administrator" : "Member"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}