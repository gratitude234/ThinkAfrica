import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SponsorForm from "./SponsorForm";
import SponsorToggle from "./SponsorToggle";

const PLACEMENT_LABELS: Record<string, string> = {
  leaderboard: "Leaderboard",
  webinar: "Webinars",
  policy_hub: "Policy Hub",
  fellowship: "Fellowships",
};

export default async function AdminSponsorsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    return <div className="max-w-2xl mx-auto py-20 text-center text-gray-500">Access denied.</div>;
  }

  const { data: placements } = await supabase
    .from("sponsor_placements")
    .select("id, sponsor_name, placement_type, content, link_url, active, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manage Sponsors</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {(placements ?? []).filter(p => p.active).length} active placements
          </p>
        </div>
        <SponsorForm />
      </div>

      {(placements ?? []).length === 0 ? (
        <div className="text-center py-16 text-gray-400">No sponsor placements yet.</div>
      ) : (
        <div className="space-y-3">
          {(placements ?? []).map((p) => (
            <div key={p.id} className={`bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between gap-4 ${!p.active ? "opacity-60" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-gray-900 text-sm">{p.sponsor_name}</p>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {PLACEMENT_LABELS[p.placement_type] ?? p.placement_type}
                  </span>
                  {p.active && (
                    <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">Active</span>
                  )}
                </div>
                {p.content && <p className="text-xs text-gray-500 truncate">{p.content}</p>}
                {p.link_url && (
                  <a href={p.link_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-emerald-brand hover:underline truncate block">
                    {p.link_url}
                  </a>
                )}
              </div>
              <SponsorToggle sponsorId={p.id} active={p.active} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
