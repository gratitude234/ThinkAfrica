import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import AmbassadorActions from "./AmbassadorActions";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-600 border border-amber-200",
  active: "bg-emerald-50 text-emerald-600 border border-emerald-200",
  inactive: "bg-gray-100 text-gray-500 border border-gray-200",
};

export default async function AdminAmbassadorsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <p className="text-gray-500">You don&apos;t have access to this page.</p>
      </div>
    );
  }

  const { data: applicationsRaw } = await supabase
    .from("campus_ambassadors")
    .select(`
      id, university, status, referral_count, joined_at,
      profiles!campus_ambassadors_user_id_fkey (username, full_name, university, avatar_url)
    `)
    .order("joined_at", { ascending: true });

  const applications = (applicationsRaw ?? []).map((a) => ({
    ...a,
    profiles: Array.isArray(a.profiles) ? a.profiles[0] : a.profiles,
  }));

  const pending = applications.filter((a) => a.status === "pending");
  const others = applications.filter((a) => a.status !== "pending");

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Ambassador Applications</h1>
        <p className="text-gray-500 text-sm mt-1">
          {pending.length} pending · {applications.filter((a) => a.status === "active").length} active
        </p>
      </div>

      {applications.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>No applications yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {[...pending, ...others].map((app) => {
            const profile = app.profiles;
            return (
              <div
                key={app.id}
                className="bg-white rounded-xl border border-gray-200 p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold flex-shrink-0">
                      {profile?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{profile?.full_name}</p>
                      <p className="text-xs text-gray-500">
                        @{profile?.username} · {app.university}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Applied {formatDate(app.joined_at)} · {app.referral_count} referrals
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full capitalize ${STATUS_STYLES[app.status] ?? ""}`}>
                      {app.status}
                    </span>
                    <AmbassadorActions
                      ambassadorId={app.id}
                      currentStatus={app.status}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
