import type { Metadata } from "next";
import Link from "next/link";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import ResearchProjectCard, { type ResearchProjectCardData } from "@/components/research/ResearchProjectCard";
import { DEFAULT_OG_IMAGE, SITE_NAME, absoluteUrl, canonicalPath } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

const DESCRIPTION =
  "Develop research proposals, recruit collaborators, publish project updates, and connect completed inquiry to your Intellectual Record.";

export const metadata: Metadata = {
  title: "Research",
  description: DESCRIPTION,
  alternates: { canonical: canonicalPath("/research") },
  openGraph: {
    title: "Research | Indegenius",
    description: DESCRIPTION,
    url: absoluteUrl("/research"),
    siteName: SITE_NAME,
    images: [{ url: absoluteUrl(DEFAULT_OG_IMAGE), width: 1200, height: 630 }],
    type: "website",
  },
};

interface ProjectRow {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  summary: string;
  status: string;
  disciplines: string[];
  skills_needed: string[];
  target_completion_date: string | null;
  owner:
    | { username: string; full_name: string | null; university: string | null }
    | { username: string; full_name: string | null; university: string | null }[]
    | null;
  research_project_members: Array<{ user_id: string; status: string }> | null;
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function toCard(project: ProjectRow): ResearchProjectCardData {
  return {
    id: project.id,
    slug: project.slug,
    title: project.title,
    summary: project.summary,
    status: project.status,
    disciplines: project.disciplines ?? [],
    skills_needed: project.skills_needed ?? [],
    target_completion_date: project.target_completion_date,
    owner: one(project.owner),
    activeMemberCount: (project.research_project_members ?? []).filter(
      (member) => member.status === "active"
    ).length,
  };
}

export default async function ResearchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [projectsResult, requestsResult, profileResult] = await Promise.all([
    supabase
      .from("research_projects")
      .select(
        "id, owner_id, slug, title, summary, status, disciplines, skills_needed, target_completion_date, owner:profiles!research_projects_owner_id_fkey(username, full_name, university), research_project_members(user_id, status)"
      )
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(60),
    user
      ? supabase
          .from("research_collaboration_requests")
          .select(
            "id, direction, requested_role, message, project:research_projects!research_collaboration_requests_project_id_fkey(slug, title), sender:profiles!research_collaboration_requests_sender_id_fkey(username, full_name)"
          )
          .eq("recipient_id", user.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
    user
      ? supabase
          .from("researcher_profiles")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const projects = ((projectsResult.data ?? []) as unknown as ProjectRow[]).map(toCard);
  const rawRows = (projectsResult.data ?? []) as unknown as ProjectRow[];
  const ownProjectIds = new Set(
    user
      ? rawRows
          .filter(
            (project) =>
              project.owner_id === user.id ||
              (project.research_project_members ?? []).some(
                (member) => member.user_id === user.id && member.status === "active"
              )
          )
          .map((project) => project.id)
      : []
  );
  const myProjects = projects.filter((project) => ownProjectIds.has(project.id));
  const recruitingProjects = projects.filter(
    (project) => project.status === "recruiting" && !ownProjectIds.has(project.id)
  );
  const recentProjects = projects.filter(
    (project) => project.status !== "recruiting" && !ownProjectIds.has(project.id)
  );
  const requests = requestsResult.data ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-9">
      {user ? <RetentionEventTracker event="research_hub_viewed" metadata={{ signedIn: true }} /> : null}

      <header className="rounded-2xl bg-gray-950 p-7 text-white sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Structured inquiry</p>
        <h1 className="mt-3 max-w-3xl font-display text-3xl font-semibold sm:text-4xl">
          Take an idea from question to collaborative research.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
          Frame a proposal, make the work visible, recruit specific capabilities, document progress, and connect the completed output to your Intellectual Record.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={user ? "/research/proposals/new" : "/login?redirectTo=%2Fresearch%2Fproposals%2Fnew"} className="inline-flex min-h-11 items-center rounded-lg bg-emerald-brand px-4 text-sm font-semibold text-white">
            Create a proposal
          </Link>
          <Link href={user ? "/research/profile" : "/signup"} className="inline-flex min-h-11 items-center rounded-lg border border-white/20 px-4 text-sm font-semibold text-white">
            {profileResult.data ? "Edit research profile" : "Build research profile"}
          </Link>
          <Link href="/submit/research" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-white/75">
            Submit finished research
          </Link>
        </div>
      </header>

      {requests.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-lg font-semibold text-gray-950">Requests awaiting your response</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {requests.map((request) => {
              const project = one(request.project);
              const sender = one(request.sender);
              return (
                <Link key={request.id} href={project?.slug ? `/research/projects/${project.slug}?view=requests` : "/research"} className="rounded-lg border border-amber-100 bg-white p-4">
                  <p className="text-sm font-semibold text-gray-900">{project?.title ?? "Research project"}</p>
                  <p className="mt-1 text-xs text-gray-500">From {sender?.full_name ?? sender?.username ?? "a researcher"} · {request.requested_role.replaceAll("_", " ")}</p>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {user ? (
        <section aria-labelledby="my-research-title">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Workspace</p>
              <h2 id="my-research-title" className="mt-1 text-2xl font-semibold text-gray-950">Your research projects</h2>
            </div>
            <Link href="/research/proposals/new" className="text-sm font-semibold text-emerald-700">New proposal</Link>
          </div>
          {myProjects.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
              <p className="text-sm text-gray-500">Your first structured inquiry can begin with one clear research question.</p>
              <Link href="/research/proposals/new" className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-emerald-brand px-4 text-sm font-semibold text-white">Frame a proposal</Link>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">{myProjects.map((project) => <ResearchProjectCard key={project.id} project={project} />)}</div>
          )}
        </section>
      ) : null}

      <section aria-labelledby="research-collaboration-title">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Open collaboration</p>
        <h2 id="research-collaboration-title" className="mt-1 text-2xl font-semibold text-gray-950">Projects recruiting now</h2>
        {recruitingProjects.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">No public project is recruiting right now.</p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">{recruitingProjects.map((project) => <ResearchProjectCard key={project.id} project={project} />)}</div>
        )}
      </section>

      {recentProjects.length > 0 ? (
        <section aria-labelledby="research-active-title">
          <h2 id="research-active-title" className="text-2xl font-semibold text-gray-950">Research in progress</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">{recentProjects.slice(0, 8).map((project) => <ResearchProjectCard key={project.id} project={project} />)}</div>
        </section>
      ) : null}
    </div>
  );
}
