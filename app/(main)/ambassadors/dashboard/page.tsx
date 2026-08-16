import Link from "next/link";
import { redirect } from "next/navigation";
import { formatCampusProgramValue } from "@/lib/campus";
import { createClient } from "@/lib/supabase/server";
import CampusPromptLink from "@/components/campus/CampusPromptLink";
import AmbassadorActivityForm from "./AmbassadorActivityForm";

interface CohortRelation {
  id: string;
  university: string;
  status: string;
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export default async function AmbassadorDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/ambassadors/dashboard");

  const { data: ambassadorRaw } = await supabase
    .from("campus_ambassadors")
    .select("id, status, campus_cohort_id, campus_cohorts(id, university, status)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ambassadorRaw || ambassadorRaw.status !== "active" || !ambassadorRaw.campus_cohort_id) {
    redirect("/ambassadors");
  }

  const cohort = one(ambassadorRaw.campus_cohorts as CohortRelation | CohortRelation[] | null);
  const now = new Date().toISOString();
  const [promptsResult, programsResult, activityResult] = await Promise.all([
    supabase
      .from("campus_editorial_prompts")
      .select("id, title, prompt_text, response_question")
      .eq("cohort_id", ambassadorRaw.campus_cohort_id)
      .eq("active", true)
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .order("starts_at", { ascending: false })
      .limit(3),
    supabase
      .from("campus_programs")
      .select("id, title, format, recurrence, next_session_at")
      .eq("cohort_id", ambassadorRaw.campus_cohort_id)
      .eq("active", true)
      .order("next_session_at", { ascending: true, nullsFirst: false })
      .limit(6),
    supabase
      .from("campus_ambassador_activity")
      .select("id, activity_type, happened_on, participant_count, notes")
      .eq("ambassador_id", ambassadorRaw.id)
      .order("happened_on", { ascending: false })
      .limit(20),
  ]);

  const prompts = promptsResult.data ?? [];
  const programs = programsResult.data ?? [];
  const activity = activityResult.data ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="rounded-2xl bg-emerald-brand p-7 text-white sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Ambassador operating desk</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">{cohort?.university ?? "Your campus"}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">
          Run the current editorial rhythm, help contributors make their second publication, and create response loops around campus work.
        </p>
        <Link href="/campus" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-semibold text-emerald-900">Open campus hub</Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-base font-semibold text-gray-950">Current editorial prompts</h2>
            <div className="mt-3 divide-y divide-gray-100">
              {prompts.length === 0 ? <p className="py-6 text-sm text-gray-400">No prompt is active.</p> : prompts.map((prompt) => (
                <article key={prompt.id} className="py-4 first:pt-1">
                  <h3 className="text-sm font-semibold text-gray-900">{prompt.title}</h3>
                  <p className="mt-1 text-sm leading-5 text-gray-500">{prompt.prompt_text}</p>
                  {prompt.response_question ? <p className="mt-2 text-xs font-medium text-emerald-700">Response loop: {prompt.response_question}</p> : null}
                  <CampusPromptLink promptId={prompt.id} source="ambassador_dashboard" className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold text-emerald-700">Open prompt →</CampusPromptLink>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-base font-semibold text-gray-950">Recurring program checklist</h2>
            <div className="mt-3 divide-y divide-gray-100">
              {programs.length === 0 ? <p className="py-6 text-sm text-gray-400">No recurring program is active.</p> : programs.map((program) => (
                <div key={program.id} className="py-3">
                  <p className="text-sm font-semibold text-gray-900">{program.title}</p>
                  <p className="mt-1 text-xs text-gray-500">{formatCampusProgramValue(program.format)} · {formatCampusProgramValue(program.recurrence)}{program.next_session_at ? ` · ${formatDate(program.next_session_at)}` : ""}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <AmbassadorActivityForm />
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-base font-semibold text-gray-950">Recent operating activity</h2>
        <div className="mt-3 divide-y divide-gray-100">
          {activity.length === 0 ? <p className="py-6 text-sm text-gray-400">No activity has been recorded yet.</p> : activity.map((item) => (
            <div key={item.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">{formatCampusProgramValue(item.activity_type)}</p>
                {item.notes ? <p className="mt-1 text-xs text-gray-500">{item.notes}</p> : null}
              </div>
              <p className="text-xs text-gray-500">{formatDate(item.happened_on)} · {item.participant_count} participants</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
