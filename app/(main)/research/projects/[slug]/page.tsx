import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import UserAvatar from "@/components/ui/UserAvatar";
import {
  RESEARCH_PROJECT_STATUSES,
  formatResearchValue,
  type ResearchProjectStatus,
} from "@/lib/research";
import { SITE_NAME, absoluteUrl, canonicalPath } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import {
  CollaborationRequestForm,
  CollaborationRequestsPanel,
  LinkResearchOutputForm,
  ResearchAssetForm,
  ResearchLifecycleForm,
  ResearchUpdateForm,
  type ResearchRequestView,
} from "./ProjectWorkspaceForms";

interface PageProps {
  params: Promise<{ slug: string }>;
}

interface Person {
  id?: string;
  username: string;
  full_name: string | null;
  avatar_url?: string | null;
  university?: string | null;
}

interface ProjectRow {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  summary: string;
  research_question: string;
  methodology: string;
  expected_output: string;
  disciplines: string[];
  skills_needed: string[];
  status: string;
  visibility: string;
  target_completion_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  owner: Person | Person[] | null;
  research_project_members: Array<{
    user_id: string;
    role: string;
    status: string;
    joined_at: string;
    profile: Person | Person[] | null;
  }> | null;
  linked_output:
    | { id: string; slug: string; title: string | null; citation_id: string | null; read_count: number | null; view_count: number | null }
    | Array<{ id: string; slug: string; title: string | null; citation_id: string | null; read_count: number | null; view_count: number | null }>
    | null;
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

const getResearchProject = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("research_projects")
    .select(
      "id, owner_id, slug, title, summary, research_question, methodology, expected_output, disciplines, skills_needed, status, visibility, target_completion_date, completed_at, created_at, updated_at, owner:profiles!research_projects_owner_id_fkey(id, username, full_name, avatar_url, university), research_project_members(user_id, role, status, joined_at, profile:profiles!research_project_members_user_id_fkey(id, username, full_name, avatar_url, university)), linked_output:posts!research_projects_linked_post_id_fkey(id, slug, title, citation_id, read_count, view_count)"
    )
    .eq("slug", slug)
    .maybeSingle();
  return (data as unknown as ProjectRow | null) ?? null;
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getResearchProject(slug);
  if (!project) return { title: "Research project not found" };
  const description = project.summary.slice(0, 155);
  const owner = one(project.owner);
  const ogImage = absoluteUrl(
    `/api/og?type=research&title=${encodeURIComponent(project.title)}&author=${encodeURIComponent(owner?.full_name ?? owner?.username ?? "")}`
  );
  return {
    title: project.title,
    description,
    alternates: { canonical: canonicalPath(`/research/projects/${project.slug}`) },
    openGraph: {
      title: `${project.title} | Indegenius Research`,
      description,
      url: absoluteUrl(`/research/projects/${project.slug}`),
      siteName: SITE_NAME,
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "article",
    },
  };
}

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export default async function ResearchProjectPage({ params }: PageProps) {
  const { slug } = await params;
  const project = await getResearchProject(slug);
  if (!project) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const members = (project.research_project_members ?? [])
    .filter((member) => member.status === "active")
    .map((member) => ({ ...member, profile: one(member.profile) }));
  const isOwner = user?.id === project.owner_id;
  const isMember = Boolean(user && members.some((member) => member.user_id === user.id));
  const activeStatus = RESEARCH_PROJECT_STATUSES.includes(project.status as ResearchProjectStatus)
    ? (project.status as ResearchProjectStatus)
    : "proposal";
  const canContribute =
    Boolean(user && (isOwner || isMember)) && !["completed", "archived"].includes(project.status);
  const canRequest = Boolean(
    user && !isOwner && !isMember && ["recruiting", "active"].includes(project.status)
  );

  const [updatesResult, assetsResult, eventsResult, requestsResult, outputsResult] =
    await Promise.all([
      supabase
        .from("research_project_updates")
        .select("id, update_type, title, body, visibility, created_at, author:profiles!research_project_updates_author_id_fkey(username, full_name)")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("research_project_assets")
        .select("id, asset_type, title, description, storage_path, external_url, mime_type, size_bytes, visibility, upload_status, created_at")
        .eq("project_id", project.id)
        .eq("upload_status", "ready")
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("research_project_events")
        .select("id, event_type, from_status, to_status, metadata, created_at")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false })
        .limit(40),
      user
        ? supabase
            .from("research_collaboration_requests")
            .select("id, recipient_id, direction, requested_role, message, offered_skills, status, sender:profiles!research_collaboration_requests_sender_id_fkey(username, full_name)")
            .eq("project_id", project.id)
            .eq("status", "pending")
            .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      isOwner
        ? supabase
            .from("posts")
            .select("id, title")
            .eq("author_id", project.owner_id)
            .eq("type", "research")
            .eq("status", "published")
            .or("citation_id.not.is.null,published_version_id.not.is.null")
            .order("published_at", { ascending: false })
            .limit(30)
        : Promise.resolve({ data: [] }),
    ]);

  const incomingRequests = (requestsResult.data ?? [])
    .filter((request) => request.recipient_id === user?.id)
    .map((request) => ({
      id: request.id,
      direction: request.direction,
      requested_role: request.requested_role,
      message: request.message,
      offered_skills: request.offered_skills ?? [],
      sender: one(request.sender),
    })) as ResearchRequestView[];
  const linkedOutput = one(project.linked_output);
  const updates = updatesResult.data ?? [];
  const assets = assetsResult.data ?? [];
  const events = eventsResult.data ?? [];
  const owner = one(project.owner);

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      {user ? <RetentionEventTracker event="research_project_viewed" metadata={{ projectId: project.id, status: project.status }} /> : null}

      <header className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{formatResearchValue(project.status)}</span>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">{formatResearchValue(project.visibility)}</span>
        </div>
        <h1 className="mt-4 max-w-4xl font-display text-3xl font-semibold text-gray-950 sm:text-4xl">{project.title}</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600">{project.summary}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {project.disciplines.map((discipline) => <span key={discipline} className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600">{discipline}</span>)}
        </div>
        <div className="mt-6 flex items-center gap-3 border-t border-gray-100 pt-5">
          <UserAvatar name={owner?.full_name ?? owner?.username ?? "Research lead"} src={owner?.avatar_url} size={42} />
          <div>
            <p className="text-sm font-semibold text-gray-900">{owner?.full_name ?? owner?.username ?? "Research lead"}</p>
            <p className="text-xs text-gray-500">Project lead{owner?.university ? ` · ${owner.university}` : ""}</p>
          </div>
        </div>
      </header>

      <CollaborationRequestsPanel requests={incomingRequests} />

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
        <main className="min-w-0 space-y-7">
          <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Research design</p>
            <div className="mt-4 space-y-5">
              <div><h2 className="text-sm font-semibold text-gray-950">Research question</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">{project.research_question}</p></div>
              <div><h2 className="text-sm font-semibold text-gray-950">Methodology</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">{project.methodology}</p></div>
              <div><h2 className="text-sm font-semibold text-gray-950">Expected output</h2><p className="mt-2 text-sm leading-6 text-gray-600">{project.expected_output}</p></div>
            </div>
          </section>

          <section aria-labelledby="research-updates-title">
            <div className="flex items-end justify-between gap-4">
              <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Living record</p><h2 id="research-updates-title" className="mt-1 text-xl font-semibold text-gray-950">Project updates</h2></div>
            </div>
            {updates.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white p-7 text-center text-sm text-gray-500">No project update has been published yet.</p> : (
              <div className="mt-4 space-y-3">{updates.map((update) => {
                const author = one(update.author);
                return <article key={update.id} className="rounded-xl border border-gray-200 bg-white p-5"><div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold text-emerald-700">{formatResearchValue(update.update_type)}</span><span className="text-gray-400">·</span><time className="text-gray-500">{formatDate(update.created_at)}</time>{update.visibility === "members" ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">Members</span> : null}</div><h3 className="mt-2 text-base font-semibold text-gray-950">{update.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">{update.body}</p><p className="mt-3 text-xs text-gray-500">{author?.full_name ?? author?.username ?? "Project member"}</p></article>;
              })}</div>
            )}
          </section>

          <section aria-labelledby="research-assets-title">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Evidence and media</p><h2 id="research-assets-title" className="mt-1 text-xl font-semibold text-gray-950">Research assets</h2></div>
            {assets.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white p-7 text-center text-sm text-gray-500">No datasets, documents, images, audio, or video have been attached.</p> : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">{assets.map((asset) => <a key={asset.id} href={asset.external_url ?? `/api/research-project-assets/${asset.id}`} target={asset.external_url ? "_blank" : undefined} rel={asset.external_url ? "noreferrer" : undefined} className="rounded-xl border border-gray-200 bg-white p-4 hover:border-emerald-200"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{formatResearchValue(asset.asset_type)}</p><h3 className="mt-1 text-sm font-semibold text-gray-950">{asset.title}</h3>{asset.description ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-500">{asset.description}</p> : null}<p className="mt-3 text-xs font-semibold text-emerald-700">{asset.storage_path ? "Open securely" : "Open resource"} →</p></a>)}</div>
            )}
          </section>

          {linkedOutput ? (
            <section className="rounded-xl border border-purple-200 bg-purple-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-purple-700">Research output</p>
              <Link href={`/post/${linkedOutput.slug}`} className="mt-2 block text-lg font-semibold text-gray-950 hover:text-purple-800">{linkedOutput.title ?? "Published research"}</Link>
              <p className="mt-2 text-xs text-gray-600">{linkedOutput.citation_id ? `Citable record ${linkedOutput.citation_id} · ` : ""}{(linkedOutput.read_count ?? 0).toLocaleString()} reads</p>
            </section>
          ) : null}
        </main>

        <aside className="space-y-4">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-950">Project team</h2>
            <div className="mt-3 space-y-3">{members.map((member) => <Link key={member.user_id} href={member.profile?.username ? `/${member.profile.username}` : "#"} className="flex items-center gap-3"><UserAvatar name={member.profile?.full_name ?? member.profile?.username ?? "Member"} src={member.profile?.avatar_url} size={36} /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-gray-900">{member.profile?.full_name ?? member.profile?.username ?? "Member"}</span><span className="block text-xs text-gray-500">{formatResearchValue(member.role)}</span></span></Link>)}</div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-950">Project needs</h2>
            {project.skills_needed.length === 0 ? <p className="mt-2 text-sm text-gray-500">No additional skills are listed.</p> : <div className="mt-3 flex flex-wrap gap-2">{project.skills_needed.map((skill) => <span key={skill} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">{skill}</span>)}</div>}
            <dl className="mt-4 space-y-2 border-t border-gray-100 pt-4 text-xs"><div className="flex justify-between gap-3"><dt className="text-gray-500">Started</dt><dd className="font-medium text-gray-800">{formatDate(project.created_at)}</dd></div><div className="flex justify-between gap-3"><dt className="text-gray-500">Target</dt><dd className="font-medium text-gray-800">{formatDate(project.target_completion_date)}</dd></div></dl>
          </section>

          {isOwner ? <ResearchLifecycleForm projectId={project.id} status={activeStatus} /> : null}
          {(canRequest || (isOwner && !["completed", "archived"].includes(project.status))) ? <CollaborationRequestForm projectId={project.id} isOwner={isOwner} /> : null}
          {!user && project.status === "recruiting" ? <Link href={`/login?redirectTo=${encodeURIComponent(`/research/projects/${project.slug}`)}`} className="flex min-h-11 items-center justify-center rounded-xl bg-emerald-brand px-4 text-sm font-semibold text-white">Sign in to collaborate</Link> : null}
          {canContribute ? <ResearchUpdateForm projectId={project.id} /> : null}
          {canContribute ? <ResearchAssetForm projectId={project.id} /> : null}
          {isOwner && !linkedOutput ? <LinkResearchOutputForm projectId={project.id} posts={(outputsResult.data ?? []).map((post) => ({ id: post.id, title: post.title ?? "Untitled research" }))} /> : null}
        </aside>
      </div>

      {events.length > 0 ? (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-base font-semibold text-gray-950">Lifecycle history</h2>
          <ol className="mt-3 space-y-2">{events.map((event) => <li key={event.id} className="flex items-start justify-between gap-4 border-t border-gray-100 py-3 first:border-0"><span className="text-sm text-gray-700">{event.event_type === "status_changed" ? `${formatResearchValue(event.from_status ?? "project")} → ${formatResearchValue(event.to_status ?? "updated")}` : formatResearchValue(event.event_type)}</span><time className="shrink-0 text-xs text-gray-500">{formatDate(event.created_at)}</time></li>)}</ol>
        </section>
      ) : null}
    </div>
  );
}
