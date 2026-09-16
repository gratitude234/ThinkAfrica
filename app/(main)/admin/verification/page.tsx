import { redirect } from "next/navigation";
import { createAdminActionClient } from "@/lib/adminAccess";
import { AdminAccessError, createAdminClient } from "@/lib/supabase/admin";
import VerificationActions from "./VerificationActions";

interface VerificationRow {
  id: string;
  full_name: string | null;
  username: string;
  verified: boolean;
}

export default async function AdminVerificationPage() {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = (await createAdminActionClient("users.verify")).admin;
  } catch (error) {
    if (error instanceof AdminAccessError && error.status === 401) redirect("/login");
    return <div className="py-20 text-center text-gray-500">Access denied.</div>;
  }

  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, username, verified")
    .order("username", { ascending: true })
    .limit(200);
  const profiles = (data ?? []) as VerificationRow[];

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Account verification</h1>
        <p className="mt-1 text-sm leading-6 text-gray-500">
          Internal account and security state. Verification is not shown as a public badge or ranking signal.
        </p>
      </header>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Could not load accounts.</p>
      ) : profiles.length === 0 ? (
        <p className="py-16 text-center text-gray-400">No accounts found.</p>
      ) : (
        <div className="space-y-3">
          {profiles.map((profile) => (
            <div key={profile.id} className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{profile.full_name?.trim() || `@${profile.username}`}</p>
                <p className="truncate text-xs text-gray-500">@{profile.username} · {profile.verified ? "Internal verification recorded" : "Not internally verified"}</p>
              </div>
              <VerificationActions
                userId={profile.id}
                verified={profile.verified}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}