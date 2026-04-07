import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import EmptyState, { EMPTY_STATES } from "@/components/ui/EmptyState";
import SponsorBanner from "@/components/ui/SponsorBanner";

function DeadlineBadge({ deadline }: { deadline: string | null }) {
  if (!deadline) return null;
  const daysLeft = Math.ceil(
    (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (daysLeft < 0) return null;
  const urgent = daysLeft <= 7;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        urgent
          ? "bg-red-50 text-red-600 border border-red-200"
          : "bg-gray-100 text-gray-600"
      }`}
    >
      {urgent ? `${daysLeft}d left` : `Due ${formatDate(deadline)}`}
    </span>
  );
}

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function FellowshipsPage({ searchParams }: PageProps) {
  const { filter } = await searchParams;
  const supabase = await createClient();

  const { data: all } = await supabase
    .from("fellowships")
    .select("id, title, sponsor_name, amount, eligibility, deadline, status, created_at")
    .order("deadline", { ascending: true, nullsFirst: false });

  const now = new Date();
  const open = (all ?? []).filter((f) => f.status === "open");
  const closed = (all ?? []).filter((f) => f.status === "closed");

  const { data: sponsorRaw } = await supabase
    .from("sponsor_placements")
    .select("sponsor_name, content, link_url")
    .eq("placement_type", "fellowship")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  const sponsor = sponsorRaw ?? null;

  const closingSoon = open.filter((f) => {
    if (!f.deadline) return false;
    const days = (new Date(f.deadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return days <= 14;
  });

  const displayOpen = filter === "soon" ? closingSoon : open;

  return (
    <div className="max-w-4xl mx-auto">
      <SponsorBanner placement={sponsor} />
      {/* Hero */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Fellowships &amp; Grants</h1>
        <p className="text-gray-500 text-lg">Funding Africa&apos;s Next Generation of Thinkers</p>
      </div>

      {/* Filter */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {[
          { label: "All Open", value: undefined },
          { label: "Closing Soon", value: "soon" },
        ].map((tab) => {
          const isActive = filter === tab.value || (!filter && !tab.value);
          return (
            <Link
              key={tab.label}
              href={tab.value ? `/fellowships?filter=${tab.value}` : "/fellowships"}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
              {tab.value === "soon" && closingSoon.length > 0 && (
                <span className="ml-1.5 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                  {closingSoon.length}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Open fellowships */}
      {displayOpen.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200">
          <EmptyState {...EMPTY_STATES.fellowships} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {displayOpen.map((f) => (
            <Link
              key={f.id}
              href={`/fellowships/${f.id}`}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow flex flex-col"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <h2 className="text-base font-semibold text-gray-900 leading-snug flex-1">
                  {f.title}
                </h2>
                <DeadlineBadge deadline={f.deadline} />
              </div>

              {f.sponsor_name && (
                <p className="text-xs font-medium text-emerald-600 mb-2">
                  by {f.sponsor_name}
                </p>
              )}

              {f.amount && (
                <p className="text-sm font-semibold text-gray-700 mb-2">{f.amount}</p>
              )}

              {f.eligibility && (
                <p className="text-xs text-gray-500 line-clamp-2 mb-4 flex-1">
                  {f.eligibility}
                </p>
              )}

              <span className="mt-auto inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors self-start">
                Apply Now
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Past opportunities */}
      {closed.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 text-gray-400">
            Past Opportunities
          </h2>
          <div className="space-y-3">
            {closed.map((f) => (
              <div
                key={f.id}
                className="bg-gray-50 rounded-xl border border-gray-200 p-4 opacity-70"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700">{f.title}</h3>
                    {f.sponsor_name && (
                      <p className="text-xs text-gray-400">by {f.sponsor_name}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">Closed</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
