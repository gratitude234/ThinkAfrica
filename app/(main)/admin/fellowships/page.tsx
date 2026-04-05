import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import FellowshipForm from "./FellowshipForm";
import ApplicationActions from "./ApplicationActions";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-600 border-amber-200",
  shortlisted: "bg-blue-50 text-blue-600 border-blue-200",
  accepted: "bg-emerald-50 text-emerald-600 border-emerald-200",
  rejected: "bg-red-50 text-red-500 border-red-200",
};

export default async function AdminFellowshipsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    return <div className="max-w-2xl mx-auto py-20 text-center text-gray-500">Access denied.</div>;
  }

  const { data: fellowships } = await supabase
    .from("fellowships")
    .select("id, title, status, deadline, sponsor_name")
    .order("created_at", { ascending: false });

  const { data: applicationsRaw } = await supabase
    .from("fellowship_applications")
    .select(`
      id, status, applied_at, cover_letter, fellowship_id,
      profiles!fellowship_applications_user_id_fkey (full_name, university, username)
    `)
    .order("applied_at", { ascending: false });

  const applications = (applicationsRaw ?? []).map((a) => ({
    ...a,
    profiles: Array.isArray(a.profiles) ? a.profiles[0] : a.profiles,
  }));

  // Group by fellowship
  const appsByFellowship = applications.reduce((acc, app) => {
    if (!acc[app.fellowship_id]) acc[app.fellowship_id] = [];
    acc[app.fellowship_id].push(app);
    return acc;
  }, {} as Record<string, typeof applications>);

  const totalApps = applications.length;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manage Fellowships</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {(fellowships ?? []).length} fellowships · {totalApps} applications
          </p>
        </div>
        <FellowshipForm />
      </div>

      {(fellowships ?? []).length === 0 ? (
        <div className="text-center py-16 text-gray-400">No fellowships yet.</div>
      ) : (
        <div className="space-y-8">
          {(fellowships ?? []).map((fellowship) => {
            const apps = appsByFellowship[fellowship.id] ?? [];
            return (
              <div key={fellowship.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">{fellowship.title}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {fellowship.sponsor_name && `${fellowship.sponsor_name} · `}
                      {fellowship.deadline ? `Deadline: ${formatDate(fellowship.deadline)}` : "No deadline"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${
                      fellowship.status === "open" ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"
                    }`}>
                      {fellowship.status}
                    </span>
                    <span className="text-xs text-gray-400">{apps.length} application{apps.length !== 1 ? "s" : ""}</span>
                  </div>
                </div>

                {apps.length === 0 ? (
                  <div className="px-6 py-4 text-sm text-gray-400">No applications yet.</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {apps.map((app) => (
                      <div key={app.id} className="px-6 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-gray-900 text-sm">{app.profiles?.full_name}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLES[app.status] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                                {app.status}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 mb-2">
                              {app.profiles?.university} · Applied {formatDate(app.applied_at)}
                            </p>
                            {app.cover_letter && (
                              <p className="text-xs text-gray-500 line-clamp-2">
                                {app.cover_letter}
                              </p>
                            )}
                          </div>
                          <div className="flex-shrink-0">
                            <ApplicationActions applicationId={app.id} currentStatus={app.status} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
