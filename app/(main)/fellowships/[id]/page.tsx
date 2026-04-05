import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import FellowshipApply from "./FellowshipApply";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function FellowshipPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: fellowship } = await supabase
    .from("fellowships")
    .select("*")
    .eq("id", id)
    .single();

  if (!fellowship) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let existingApplication: { status: string } | null = null;
  if (user) {
    const { data } = await supabase
      .from("fellowship_applications")
      .select("status")
      .eq("fellowship_id", id)
      .eq("user_id", user.id)
      .single();
    existingApplication = data;
  }

  const daysLeft = fellowship.deadline
    ? Math.ceil(
        (new Date(fellowship.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    : null;

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/fellowships"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Fellowships
      </Link>

      <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6">
        {/* Status */}
        <div className="flex items-center gap-2 mb-4">
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              fellowship.status === "open"
                ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {fellowship.status === "open" ? "Open" : "Closed"}
          </span>
          {daysLeft !== null && daysLeft >= 0 && fellowship.status === "open" && (
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                daysLeft <= 7
                  ? "bg-red-50 text-red-600 border border-red-200"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {daysLeft === 0 ? "Closes today" : `${daysLeft} days left`}
            </span>
          )}
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2 leading-tight">
          {fellowship.title}
        </h1>

        {fellowship.sponsor_name && (
          <p className="text-sm font-medium text-emerald-600 mb-4">
            by {fellowship.sponsor_name}
          </p>
        )}

        {/* Key details */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {fellowship.amount && (
            <div className="bg-amber-50 rounded-lg p-3">
              <p className="text-xs text-amber-600 font-medium mb-0.5">Award</p>
              <p className="text-sm font-semibold text-gray-900">{fellowship.amount}</p>
            </div>
          )}
          {fellowship.deadline && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-medium mb-0.5">Deadline</p>
              <p className="text-sm font-semibold text-gray-900">
                {formatDate(fellowship.deadline)}
              </p>
            </div>
          )}
        </div>

        {fellowship.description && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">About this Fellowship</h2>
            <p className="text-sm text-gray-600 leading-relaxed">{fellowship.description}</p>
          </div>
        )}

        {fellowship.eligibility && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Eligibility</h2>
            <p className="text-sm text-gray-600 leading-relaxed">{fellowship.eligibility}</p>
          </div>
        )}

        {fellowship.application_url && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">External Application</h2>
            <a
              href={fellowship.application_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-emerald-brand hover:underline"
            >
              {fellowship.application_url}
            </a>
          </div>
        )}

        <div className="pt-4 border-t border-gray-100">
          <FellowshipApply
            fellowshipId={id}
            userId={user?.id ?? null}
            existingApplication={existingApplication}
            fellowshipStatus={fellowship.status}
          />
        </div>
      </div>
    </div>
  );
}
