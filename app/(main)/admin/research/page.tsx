import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAdminActionClient } from "@/lib/adminAccess";
import {
  RESEARCH_EXIT_METRICS,
  formatResearchValue,
  getResearchExitGateState,
  getResearchMetricState,
  getResearchMetricStateLabel,
  type ResearchMetricState,
} from "@/lib/research";
import { AdminAccessError } from "@/lib/supabase/admin";
import ResearchTargetsForm from "./ResearchTargetsForm";
import { isResearchEnabled } from "@/lib/featureFlags";

interface ResearchMetrics {
  windowDays: number;
  windowStart: string;
  windowComplete: boolean;
  measurementStartedAt: string;
  proposalsCreated: number;
  activeProjects: number;
  acceptedCollaborations: number;
  completedProjects: number;
  publicUpdates: number;
  multimediaAssets: number;
  requestsCreated: number;
  activeCollaborators: number;
  linkedOutputs: number;
  linkedOutputReads: number;
  linkedOutputViews: number;
  projectViews: number;
  targets: Record<(typeof RESEARCH_EXIT_METRICS)[number]["key"], number | null>;
}

interface ProjectRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  visibility: string;
  updated_at: string;
  owner:
    | { username: string; full_name: string | null }
    | Array<{ username: string; full_name: string | null }>
    | null;
}

interface RequestRow {
  id: string;
  direction: string;
  requested_role: string;
  status: string;
  created_at: string;
  responded_at: string | null;
  project:
    | { slug: string; title: string }
    | Array<{ slug: string; title: string }>
    | null;
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value)
  );
}

const STATE_CLASS: Record<ResearchMetricState, string> = {
  not_set: "bg-gray-100 text-gray-600",
  collecting: "bg-sky-50 text-sky-700",
  on_target: "bg-emerald-50 text-emerald-700",
  below_target: "bg-amber-50 text-amber-800",
};

export default async function AdminResearchPage() {
  if (!isResearchEnabled()) notFound();

  let admin;
  try {
    ({ admin } = await createAdminActionClient("analytics.view"));
  } catch (error) {
    if (error instanceof AdminAccessError && error.status === 401) redirect("/login");
    return <p className="py-16 text-center text-sm text-gray-500">You do not have access to research analytics.</p>;
  }

  const [metricsResult, targetsResult, projectsResult, requestsResult] =
    await Promise.all([
      admin.rpc("get_research_expansion_metrics"),
      admin
        .from("research_expansion_targets")
        .select(
          "window_days, proposals_created_target, active_projects_target, accepted_collaborations_target, completed_projects_target, public_updates_target, multimedia_assets_target, measurement_started_at"
        )
        .eq("scope", "global")
        .maybeSingle(),
      admin
        .from("research_projects")
        .select(
          "id, slug, title, status, visibility, updated_at, owner:profiles!research_projects_owner_id_fkey(username, full_name)"
        )
        .order("updated_at", { ascending: false })
        .limit(20),
      admin
        .from("research_collaboration_requests")
        .select(
          "id, direction, requested_role, status, created_at, responded_at, project:research_projects!research_collaboration_requests_project_id_fkey(slug, title)"
        )
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const rawTargets = targetsResult.data;
  const targets = {
    proposalsCreated: rawTargets?.proposals_created_target ?? null,
    activeProjects: rawTargets?.active_projects_target ?? null,
    acceptedCollaborations: rawTargets?.accepted_collaborations_target ?? null,
    completedProjects: rawTargets?.completed_projects_target ?? null,
    publicUpdates: rawTargets?.public_updates_target ?? null,
    multimediaAssets: rawTargets?.multimedia_assets_target ?? null,
  };
  const rawMetrics = metricsResult.data as Partial<ResearchMetrics> | null;
  const metrics: ResearchMetrics = {
    windowDays: numberValue(rawMetrics?.windowDays ?? rawTargets?.window_days ?? 90),
    windowStart: rawMetrics?.windowStart ?? rawTargets?.measurement_started_at ?? "",
    windowComplete: Boolean(rawMetrics?.windowComplete),
    measurementStartedAt:
      rawMetrics?.measurementStartedAt ?? rawTargets?.measurement_started_at ?? "",
    proposalsCreated: numberValue(rawMetrics?.proposalsCreated),
    activeProjects: numberValue(rawMetrics?.activeProjects),
    acceptedCollaborations: numberValue(rawMetrics?.acceptedCollaborations),
    completedProjects: numberValue(rawMetrics?.completedProjects),
    publicUpdates: numberValue(rawMetrics?.publicUpdates),
    multimediaAssets: numberValue(rawMetrics?.multimediaAssets),
    requestsCreated: numberValue(rawMetrics?.requestsCreated),
    activeCollaborators: numberValue(rawMetrics?.activeCollaborators),
    linkedOutputs: numberValue(rawMetrics?.linkedOutputs),
    linkedOutputReads: numberValue(rawMetrics?.linkedOutputReads),
    linkedOutputViews: numberValue(rawMetrics?.linkedOutputViews),
    projectViews: numberValue(rawMetrics?.projectViews),
    targets,
  };
  const metricStates = RESEARCH_EXIT_METRICS.map((metric) =>
    getResearchMetricState({
      value: metrics[metric.key],
      target: targets[metric.key],
      windowComplete: metrics.windowComplete,
    })
  );
  const exitGate = getResearchExitGateState(metricStates);
  const gateCopy = {
    not_set: "Targets not approved",
    collecting: "Measurement in progress",
    reached: "Exit gate reached",
    not_reached: "Exit gate not reached",
  }[exitGate];
  const projects = (projectsResult.data ?? []) as unknown as ProjectRow[];
  const requests = (requestsResult.data ?? []) as unknown as RequestRow[];

  return (
    <div className="space-y-8">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-brand">Phase 4</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Research expansion</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
          Measure whether structured inquiry produces sustained project activity,
          accepted collaboration, visible progress, multimedia evidence, and completed work.
        </p>
      </header>

      {metricsResult.error || targetsResult.error ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Research measurement is unavailable until the Phase 4 migration is applied.
        </p>
      ) : null}

      <section className="rounded-2xl bg-gray-950 p-6 text-white sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">Phase 4 exit gate</p>
            <h2 className="mt-2 text-2xl font-semibold">{gateCopy}</h2>
          </div>
          <p className="text-right text-xs leading-5 text-white/60">
            {metrics.windowDays}-day window<br />
            Started {dateLabel(metrics.measurementStartedAt)}
          </p>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-white/70">
          The gate is reached only when every approved target is met. Unset targets
          and incomplete windows remain explicit instead of being interpreted as success.
        </p>
      </section>

      <section aria-labelledby="research-metrics-title">
        <h2 id="research-metrics-title" className="text-lg font-semibold text-gray-950">Exit-gate evidence</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {RESEARCH_EXIT_METRICS.map((definition, index) => {
            const value = metrics[definition.key];
            const target = targets[definition.key];
            const state = metricStates[index];
            return (
              <article key={definition.key} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-gray-800">{definition.label}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATE_CLASS[state]}`}>
                    {getResearchMetricStateLabel(state)}
                  </span>
                </div>
                <p className="mt-3 text-3xl font-semibold tabular-nums text-gray-950">{value.toLocaleString()}</p>
                <p className="mt-1 text-xs text-gray-500">{target === null ? "No approved target" : `Target ${target.toLocaleString()}`}</p>
                <p className="mt-3 text-[11px] leading-4 text-gray-400">{definition.definition}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="research-impact-title">
        <h2 id="research-impact-title" className="text-lg font-semibold text-gray-950">Impact signals</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            ["Project views", metrics.projectViews],
            ["Requests sent", metrics.requestsCreated],
            ["New collaborators", metrics.activeCollaborators],
            ["Linked outputs", metrics.linkedOutputs],
            ["Output reads", metrics.linkedOutputReads],
            ["Output views", metrics.linkedOutputViews],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-[11px] font-medium text-gray-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-950">{Number(value).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </section>

      <ResearchTargetsForm windowDays={metrics.windowDays || 90} targets={targets} />

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-950">Recent projects</h2>
            <Link href="/research" className="text-sm font-semibold text-emerald-700">Open hub</Link>
          </div>
          <div className="mt-3 divide-y divide-gray-100">
            {projects.length === 0 ? <p className="py-5 text-sm text-gray-500">No research projects yet.</p> : projects.map((project) => {
              const owner = one(project.owner);
              return (
                <Link key={project.id} href={`/research/projects/${project.slug}`} className="block py-3">
                  <p className="text-sm font-semibold text-gray-900">{project.title}</p>
                  <p className="mt-1 text-xs text-gray-500">{formatResearchValue(project.status)} · {owner?.full_name ?? owner?.username ?? "Unknown lead"} · updated {dateLabel(project.updated_at)}</p>
                </Link>
              );
            })}
          </div>
        </section>
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-950">Recent collaboration requests</h2>
          <div className="mt-3 divide-y divide-gray-100">
            {requests.length === 0 ? <p className="py-5 text-sm text-gray-500">No collaboration requests yet.</p> : requests.map((request) => {
              const project = one(request.project);
              return (
                <div key={request.id} className="py-3">
                  <p className="text-sm font-semibold text-gray-900">{project?.title ?? "Research project"}</p>
                  <p className="mt-1 text-xs text-gray-500">{formatResearchValue(request.direction)} · {formatResearchValue(request.requested_role)} · {formatResearchValue(request.status)} · {dateLabel(request.created_at)}</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
