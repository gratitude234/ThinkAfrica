import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import Tag from "@/components/ui/Tag";
import WebinarRegister from "./WebinarRegister";
import WebinarQA from "./WebinarQA";

type WebinarStatus = "scheduled" | "live" | "ended";

function StatusBadge({ status }: { status: WebinarStatus }) {
  const styles: Record<WebinarStatus, string> = {
    scheduled: "bg-blue-50 text-blue-600 border border-blue-200",
    live: "bg-red-50 text-red-600 border border-red-200",
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
  params: Promise<{ id: string }>;
}

export default async function WebinarPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: webinar } = await supabase
    .from("webinars")
    .select(`
      id, title, description, status, scheduled_at, ended_at,
      tags, attendee_count, recording_url, host_id,
      profiles!webinars_host_id_fkey (id, username, full_name, university, avatar_url)
    `)
    .eq("id", id)
    .single();

  if (!webinar) notFound();

  const host = Array.isArray(webinar.profiles) ? webinar.profiles[0] : webinar.profiles;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Check registration status
  let isRegistered = false;
  if (user) {
    const { data: reg } = await supabase
      .from("webinar_attendees")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("webinar_id", id)
      .single();
    isRegistered = !!reg;
  }

  // Fetch questions ordered by upvotes
  const { data: questionsRaw } = await supabase
    .from("webinar_questions")
    .select("id, content, upvotes, answered, created_at, profiles!webinar_questions_author_id_fkey (username, full_name)")
    .eq("webinar_id", id)
    .order("upvotes", { ascending: false });

  const questions = (questionsRaw ?? []).map((q) => ({
    ...q,
    profiles: Array.isArray(q.profiles) ? q.profiles[0] : q.profiles,
  }));

  const isHost = !!user && user.id === webinar.host_id;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back */}
      <Link
        href="/webinars"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Webinars
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3">
              <StatusBadge status={webinar.status as WebinarStatus} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-3 leading-tight">
              {webinar.title}
            </h1>
            {webinar.description && (
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                {webinar.description}
              </p>
            )}
            {webinar.tags && webinar.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {webinar.tags.map((tag: string) => (
                  <Tag key={tag} label={tag} />
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-4">
              <div>
                <span className="font-medium text-gray-900">Scheduled</span>
                <p className="text-gray-500">{formatDate(webinar.scheduled_at)}</p>
              </div>
              <div>
                <span className="font-medium text-gray-900">Attendees</span>
                <p className="text-gray-500">{webinar.attendee_count} registered</p>
              </div>
            </div>

            {host && (
              <Link href={`/${host.username}`} className="flex items-center gap-3 group w-fit">
                <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm">
                  {host.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 group-hover:text-emerald-brand transition-colors">
                    {host.full_name}
                  </p>
                  <p className="text-xs text-gray-400">{host.university}</p>
                </div>
              </Link>
            )}
          </div>

          <div className="flex-shrink-0">
            <WebinarRegister
              webinarId={id}
              userId={user?.id ?? null}
              initialRegistered={isRegistered}
              webinarStatus={webinar.status}
            />
          </div>
        </div>

        {/* Recording link */}
        {webinar.status === "ended" && webinar.recording_url && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <a
              href={webinar.recording_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-emerald-brand hover:text-emerald-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Watch Recording
            </a>
          </div>
        )}
      </div>

      {/* Q&A */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <WebinarQA
          webinarId={id}
          initialQuestions={questions}
          userId={user?.id ?? null}
          isHost={isHost}
          webinarStatus={webinar.status}
        />
      </div>
    </div>
  );
}
