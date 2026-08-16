import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ApplicationForm from "./ApplicationForm";

export default async function AmbassadorApplyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/ambassadors/apply");

  const [{ data: profile }, { data: existingApplication }] = await Promise.all([
    supabase
      .from("profiles")
      .select("university")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("campus_ambassadors")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const university = profile?.university?.trim() ?? "";
  const { data: cohort } = university
    ? await supabase
        .from("campus_cohorts")
        .select("id, university")
        .in("status", ["selected", "active"])
        .ilike("university", university)
        .maybeSingle()
    : { data: null };

  return (
    <div className="mx-auto max-w-xl">
      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-brand">
          Campus density
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-gray-950">
          Ambassador application
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          Ambassadors operate a selected cohort through editorial prompts,
          response circles, and recurring publication support.
        </p>
      </header>

      {existingApplication ? (
        <div className="rounded-xl border border-gray-200 bg-white p-7 text-center">
          <h2 className="text-lg font-semibold text-gray-950">
            Application {existingApplication.status}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {existingApplication.status === "active"
              ? "Your Ambassador tools are ready."
              : "The team will update this status after reviewing your campus plan."}
          </p>
          <Link
            href={
              existingApplication.status === "active"
                ? "/ambassadors/dashboard"
                : "/ambassadors"
            }
            className="mt-5 inline-flex min-h-11 items-center font-semibold text-emerald-700"
          >
            {existingApplication.status === "active"
              ? "Open Ambassador dashboard"
              : "Back to Ambassadors"}{" "}
            →
          </Link>
        </div>
      ) : !university ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="font-semibold text-amber-950">Add your university first</h2>
          <p className="mt-2 text-sm leading-6 text-amber-800">
            Campus applications are tied to the university on your profile.
          </p>
          <Link href="/settings" className="mt-4 inline-flex min-h-11 items-center font-semibold text-amber-900">
            Update profile →
          </Link>
        </div>
      ) : !cohort ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="font-semibold text-gray-950">
            Applications are not open at {university}
          </h2>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            Phase 3 intentionally concentrates support on selected campuses.
            Your campus can be considered after the current cohorts show durable retention.
          </p>
          <Link href="/campus" className="mt-4 inline-flex min-h-11 items-center font-semibold text-emerald-700">
            View selected campuses →
          </Link>
        </div>
      ) : (
        <ApplicationForm university={cohort.university} />
      )}
    </div>
  );
}
