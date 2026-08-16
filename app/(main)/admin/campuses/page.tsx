import { redirect } from "next/navigation";
import {
  CAMPUS_METRIC_DEFINITIONS,
  getCampusMetricState,
  getCampusMetricStateLabel,
  formatCampusProgramValue,
  type CampusCohortStatus,
} from "@/lib/campus";
import { createAdminActionClient } from "@/lib/adminAccess";
import { AdminAccessError } from "@/lib/supabase/admin";
import CampusOperationsForms from "./CampusOperationsForms";
import CohortStatusSelect from "./CohortStatusSelect";
import CohortTargetsForm from "./CohortTargetsForm";

interface CohortRow {
  id: string;
  university: string;
  country: string | null;
  status: CampusCohortStatus;
  cohort_start: string;
  cohort_end: string | null;
}

interface MetricRow {
  cohort_id: string;
  member_count: number;
  onboarding_completed_count: number;
  d7_eligible_count: number;
  d7_retained_count: number;
  d7_retention_rate: number | null;
  d7_retention_target: number | null;
  d30_eligible_count: number;
  d30_retained_count: number;
  d30_retention_rate: number | null;
  d30_retention_target: number | null;
  first_publication_count: number;
  second_publication_eligible_count: number;
  second_publication_30d_count: number;
  second_publication_30d_rate: number | null;
  second_publication_30d_target: number | null;
  response_received_eligible_count: number;
  response_received_30d_count: number;
  response_received_30d_rate: number | null;
  response_received_30d_target: number | null;
}

interface PromptRow {
  id: string;
  cohort_id: string;
  title: string;
  cadence: string;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
}

interface ProgramRow {
  id: string;
  cohort_id: string;
  title: string;
  format: string;
  recurrence: string;
  next_session_at: string | null;
  active: boolean;
}

interface AmbassadorActivityRow {
  id: string;
  cohort_id: string;
  activity_type: string;
  happened_on: string;
  participant_count: number;
  notes: string | null;
  campus_ambassadors:
    | {
        profiles:
          | { full_name: string | null; username: string | null }
          | { full_name: string | null; username: string | null }[]
          | null;
      }
    | {
        profiles:
          | { full_name: string | null; username: string | null }
          | { full_name: string | null; username: string | null }[]
          | null;
      }[]
    | null;
}

interface CampusCandidateRow {
  university: string;
  country: string | null;
  member_count: number;
  published_contributor_count: number;
  active_ambassador_count: number;
}

function asNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function MetricCard({
  label,
  definition,
  rate,
  target,
  numerator,
  eligible,
}: {
  label: string;
  definition: string;
  rate: number | null;
  target: number | null;
  numerator: number;
  eligible: number;
}) {
  const state = getCampusMetricState({ rate, target, eligibleCount: eligible });
  const stateClass =
    state === "on_target"
      ? "bg-emerald-50 text-emerald-700"
      : state === "below_target"
        ? "bg-amber-50 text-amber-700"
        : "bg-gray-100 text-gray-600";

  return (
    <div className="rounded-lg border border-gray-100 bg-canvas p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-gray-700">{label}</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${stateClass}`}>
          {getCampusMetricStateLabel(state)}
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-gray-950">
        {rate === null ? "—" : `${rate.toFixed(1)}%`}
      </p>
      <p className="mt-1 text-[11px] text-gray-500">
        {numerator} of {eligible} eligible
        {target === null ? " · no approved target" : ` · target ${target}%`}
      </p>
      <p className="mt-2 text-[11px] leading-4 text-gray-400">{definition}</p>
    </div>
  );
}

function shortDate(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function AdminCampusesPage() {
  let admin;
  try {
    ({ admin } = await createAdminActionClient("ambassadors.manage"));
  } catch (error) {
    if (error instanceof AdminAccessError && error.status === 401) redirect("/login");
    return <p className="py-16 text-center text-sm text-gray-500">You do not have access to campus operations.</p>;
  }

  const [
    cohortsResult,
    promptsResult,
    programsResult,
    metricsResult,
    activityResult,
    candidatesResult,
  ] = await Promise.all([
    admin
      .from("campus_cohorts")
      .select("id, university, country, status, cohort_start, cohort_end")
      .order("cohort_start", { ascending: false }),
    admin
      .from("campus_editorial_prompts")
      .select("id, cohort_id, title, cadence, starts_at, ends_at, active")
      .order("starts_at", { ascending: false })
      .limit(30),
    admin
      .from("campus_programs")
      .select("id, cohort_id, title, format, recurrence, next_session_at, active")
      .order("next_session_at", { ascending: true, nullsFirst: false })
      .limit(30),
    admin.rpc("get_campus_cohort_metrics"),
    admin
      .from("campus_ambassador_activity")
      .select(
        "id, cohort_id, activity_type, happened_on, participant_count, notes, campus_ambassadors(profiles!campus_ambassadors_user_id_fkey(full_name, username))"
      )
      .order("happened_on", { ascending: false })
      .limit(30),
    admin.rpc("get_campus_candidates"),
  ]);

  const cohorts = (cohortsResult.data ?? []) as CohortRow[];
  const prompts = (promptsResult.data ?? []) as PromptRow[];
  const programs = (programsResult.data ?? []) as ProgramRow[];
  const metrics = (metricsResult.data ?? []) as MetricRow[];
  const ambassadorActivity = (activityResult.data ?? []) as AmbassadorActivityRow[];
  const candidates = (candidatesResult.data ?? []) as CampusCandidateRow[];
  const metricsByCohort = new Map(metrics.map((metric) => [metric.cohort_id, metric]));
  const cohortNames = new Map(cohorts.map((cohort) => [cohort.id, cohort.university]));

  return (
    <div className="space-y-8">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-brand">
          Phase 3
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
          Campus density and retention
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
          Operate a small number of selected campuses, publish repeatable prompts and programs,
          and compare durable cohort facts with explicitly approved targets.
        </p>
      </header>

      {metricsResult.error ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Campus measurement is unavailable until the Phase 3 migration is applied.
        </p>
      ) : null}

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-base font-semibold text-gray-900">Existing-campus density</h2>
        <p className="mt-1 text-sm text-gray-500">
          Use real member and publication density to choose the next cohort. This is an inventory, not an automatic selection.
        </p>
        {candidatesResult.error ? (
          <p className="mt-4 text-sm text-amber-700">Candidate density becomes available after the Phase 3 migration.</p>
        ) : candidates.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400">No profiles have a university yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="pb-2 pr-4 font-semibold">Campus</th>
                  <th className="pb-2 pr-4 font-semibold">Members</th>
                  <th className="pb-2 pr-4 font-semibold">Published contributors</th>
                  <th className="pb-2 font-semibold">Active Ambassadors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {candidates.slice(0, 20).map((candidate) => (
                  <tr key={candidate.university.toLocaleLowerCase()}>
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-gray-900">{candidate.university}</p>
                      <p className="text-xs text-gray-500">{candidate.country ?? "Country not set"}</p>
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-gray-700">{candidate.member_count}</td>
                    <td className="py-3 pr-4 tabular-nums text-gray-700">{candidate.published_contributor_count}</td>
                    <td className="py-3 tabular-nums text-gray-700">{candidate.active_ambassador_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="cohort-performance-title">
        <div>
          <h2 id="cohort-performance-title" className="text-lg font-semibold text-gray-900">
            Selected campus cohorts
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Empty denominators remain “collecting data”; unset targets remain visibly unset.
          </p>
        </div>
        {cohorts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            No campus has been selected yet. Create the first cohort below.
          </div>
        ) : (
          <div className="space-y-4">
            {cohorts.map((cohort) => {
              const metric = metricsByCohort.get(cohort.id);
              return (
                <article key={cohort.id} className="rounded-xl border border-gray-200 bg-white p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-gray-950">{cohort.university}</h3>
                      <p className="mt-1 text-xs text-gray-500">
                        {cohort.country ?? "Country not set"} · {cohort.cohort_start}
                        {cohort.cohort_end ? ` to ${cohort.cohort_end}` : " onward"}
                      </p>
                      <p className="mt-2 text-xs font-medium text-emerald-700">
                        {metric?.member_count ?? 0} accounts · {metric?.onboarding_completed_count ?? 0} onboarded · {metric?.first_publication_count ?? 0} first publications
                      </p>
                    </div>
                    <CohortStatusSelect cohortId={cohort.id} currentStatus={cohort.status} />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                      label="D7 retention"
                      definition={CAMPUS_METRIC_DEFINITIONS.d7Retention}
                      rate={asNumber(metric?.d7_retention_rate)}
                      target={asNumber(metric?.d7_retention_target)}
                      numerator={metric?.d7_retained_count ?? 0}
                      eligible={metric?.d7_eligible_count ?? 0}
                    />
                    <MetricCard
                      label="D30 retention"
                      definition={CAMPUS_METRIC_DEFINITIONS.d30Retention}
                      rate={asNumber(metric?.d30_retention_rate)}
                      target={asNumber(metric?.d30_retention_target)}
                      numerator={metric?.d30_retained_count ?? 0}
                      eligible={metric?.d30_eligible_count ?? 0}
                    />
                    <MetricCard
                      label="Second publication"
                      definition={CAMPUS_METRIC_DEFINITIONS.secondPublication30d}
                      rate={asNumber(metric?.second_publication_30d_rate)}
                      target={asNumber(metric?.second_publication_30d_target)}
                      numerator={metric?.second_publication_30d_count ?? 0}
                      eligible={metric?.second_publication_eligible_count ?? 0}
                    />
                    <MetricCard
                      label="Response received"
                      definition={CAMPUS_METRIC_DEFINITIONS.responseReceived30d}
                      rate={asNumber(metric?.response_received_30d_rate)}
                      target={asNumber(metric?.response_received_30d_target)}
                      numerator={metric?.response_received_30d_count ?? 0}
                      eligible={metric?.response_received_eligible_count ?? 0}
                    />
                  </div>
                  <CohortTargetsForm
                    cohortId={cohort.id}
                    initialTargets={{
                      d7: asNumber(metric?.d7_retention_target),
                      d30: asNumber(metric?.d30_retention_target),
                      second: asNumber(metric?.second_publication_30d_target),
                      response: asNumber(metric?.response_received_30d_target),
                    }}
                  />
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Editorial prompt calendar</h2>
          <div className="mt-3 divide-y divide-gray-100">
            {prompts.length === 0 ? <p className="py-6 text-sm text-gray-400">No prompts scheduled.</p> : prompts.map((prompt) => (
              <div key={prompt.id} className="py-3">
                <p className="text-sm font-semibold text-gray-900">{prompt.title}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {cohortNames.get(prompt.cohort_id) ?? "Unknown campus"} · {formatCampusProgramValue(prompt.cadence)} · starts {shortDate(prompt.starts_at)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Recurring programs</h2>
          <div className="mt-3 divide-y divide-gray-100">
            {programs.length === 0 ? <p className="py-6 text-sm text-gray-400">No programs scheduled.</p> : programs.map((program) => (
              <div key={program.id} className="py-3">
                <p className="text-sm font-semibold text-gray-900">{program.title}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {cohortNames.get(program.cohort_id) ?? "Unknown campus"} · {formatCampusProgramValue(program.format)} · {formatCampusProgramValue(program.recurrence)} · {shortDate(program.next_session_at)}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-base font-semibold text-gray-900">Ambassador operating activity</h2>
        <p className="mt-1 text-sm text-gray-500">
          Completed campus work, recorded by active Ambassadors rather than inferred from referral totals.
        </p>
        <div className="mt-4 divide-y divide-gray-100">
          {ambassadorActivity.length === 0 ? (
            <p className="py-6 text-sm text-gray-400">No Ambassador activity has been recorded.</p>
          ) : (
            ambassadorActivity.map((activity) => {
              const ambassador = one(activity.campus_ambassadors);
              const profile = one(ambassador?.profiles ?? null);
              return (
                <div key={activity.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {formatCampusProgramValue(activity.activity_type)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {profile?.full_name ?? profile?.username ?? "Ambassador"} · {cohortNames.get(activity.cohort_id) ?? "Unknown campus"}
                    </p>
                    {activity.notes ? <p className="mt-1 text-xs leading-5 text-gray-500">{activity.notes}</p> : null}
                  </div>
                  <p className="shrink-0 text-xs text-gray-500">
                    {activity.happened_on} · {activity.participant_count} participants
                  </p>
                </div>
              );
            })
          )}
        </div>
      </section>

      <CampusOperationsForms cohorts={cohorts.map(({ id, university, status }) => ({ id, university, status }))} />
    </div>
  );
}
