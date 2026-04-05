import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import Tag from "@/components/ui/Tag";
import SponsorBanner from "@/components/ui/SponsorBanner";

type WebinarStatus = "scheduled" | "live" | "ended";

function StatusBadge({ status }: { status: WebinarStatus }) {
  const styles: Record<WebinarStatus, string> = {
    scheduled: "bg-blue-50 text-blue-600 border border-blue-200",
    live: "bg-red-50 text-red-600 border border-red-200 animate-pulse",
    ended: "bg-gray-100 text-gray-500 border border-gray-200",
  };
  const labels: Record<WebinarStatus, string> = {
    scheduled: "Scheduled",
    live: "LIVE",
    ended: "Ended",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function WebinarsPage({ searchParams }: PageProps) {
  const { filter } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let query = supabase
    .from("webinars")
    .select(`id, title, description, status, scheduled_at, tags, attendee_count, profiles!webinars_host_id_fkey (username, full_name, avatar_url)`)
    .order("scheduled_at", { ascending: false });

  if (filter === "upcoming") {
    query = query.eq("status", "scheduled");
  } else if (filter === "live") {
    query = query.eq("status", "live");
  } else if (filter === "past") {
    query = query.eq("status", "ended");
  }

  const { data: webinarsRaw } = await query;

  const webinars = (webinarsRaw ?? []).map((w) => ({
    ...w,
    profiles: Array.isArray(w.profiles) ? w.profiles[0] : w.profiles,
  }));

  const { data: sponsorRaw } = await supabase
    .from("sponsor_placements")
    .select("sponsor_name, content, link_url")
    .eq("placement_type", "webinar")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  const sponsor = sponsorRaw ?? null;

  const tabs = [
    { label: "All", value: undefined },
    { label: "Upcoming", value: "upcoming" },
    { label: "Live", value: "live" },
    { label: "Past", value: "past" },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <SponsorBanner placement={sponsor} />
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webinars</h1>
          <p className="text-gray-500 text-sm mt-1">
            Live sessions, workshops, and expert talks
          </p>
        </div>
        {user && (
          <Link
            href="/webinars/create"
            className="px-4 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors"
          >
            Host a Webinar
          </Link>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map((tab) => {
          const isActive = filter === tab.value || (!filter && !tab.value);
          return (
            <Link
              key={tab.label}
              href={tab.value ? `/webinars?filter=${tab.value}` : "/webinars"}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Webinar cards */}
      {webinars.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">No webinars found</p>
          <p className="text-sm mt-1">Check back soon or host your own.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {webinars.map((webinar) => {
            const host = webinar.profiles;
            return (
              <Link
                key={webinar.id}
                href={`/webinars/${webinar.id}`}
                className="block bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <StatusBadge status={webinar.status as WebinarStatus} />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900 mb-2 leading-snug">
                      {webinar.title}
                    </h2>
                    {webinar.description && (
                      <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                        {webinar.description}
                      </p>
                    )}
                    {webinar.tags && webinar.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {webinar.tags.slice(0, 4).map((tag: string) => (
                          <Tag key={tag} label={tag} />
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      {host && (
                        <span>
                          Hosted by{" "}
                          <span className="font-medium text-gray-600">
                            {host.full_name}
                          </span>
                        </span>
                      )}
                      <span>{formatDate(webinar.scheduled_at)}</span>
                      <span>{webinar.attendee_count} registered</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
